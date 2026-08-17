import { Injectable, Logger } from "@nestjs/common";
import {
  DomainEventType,
  MembershipRole,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  Prisma,
} from "@prumo/database";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";
import {
  DEFAULT_CHANNELS,
  EVENT_DEFINITIONS,
  SECURITY_EVENT_TYPES,
} from "./communication.constants";
import { CommunicationQueueService } from "./queue.service";
import { CommunicationService } from "./communication.service";
import { TemplateRendererService } from "./template-renderer.service";
import { isWithinQuietHours, stableKey } from "./communication.utils";

type EventWithTenant = Prisma.DomainEventGetPayload<{
  include: { tenant: { select: { name: true } } };
}>;

interface Recipient {
  id: string;
  name: string;
  email: string;
}

function recordPayload(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function nextAllowedAt(
  now: Date,
  timezone: string,
  start?: string | null,
  end?: string | null,
): Date {
  if (!isWithinQuietHours(now, timezone, start, end)) return now;
  const candidate = new Date(now);
  for (let minute = 1; minute <= 1_440; minute += 1) {
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    if (!isWithinQuietHours(candidate, timezone, start, end)) return candidate;
  }
  return now;
}

@Injectable()
export class NotificationOrchestrator {
  private readonly logger = new Logger(NotificationOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly communication: CommunicationService,
    private readonly renderer: TemplateRendererService,
    private readonly queues: CommunicationQueueService,
    private readonly config: ConfigService,
  ) {}

  async processEvent(eventId: string): Promise<void> {
    const event = await this.prisma.domainEvent.findUnique({
      where: { id: eventId },
      include: { tenant: { select: { name: true } } },
    });
    if (!event || !event.tenantId || !event.tenant) return;
    const definition = EVENT_DEFINITIONS[event.type];
    if (!definition) {
      this.logger.warn(
        JSON.stringify({
          event: "notification.event.unmapped",
          eventId,
          type: event.type,
        }),
      );
      return;
    }
    const recipients = await this.resolveRecipients(event);
    await Promise.all(
      recipients.map((recipient) =>
        this.processRecipient(event, recipient, definition.templateCode),
      ),
    );
    await this.manageReminders(event, recipients);
  }

  private async resolveRecipients(
    event: EventWithTenant,
  ): Promise<Recipient[]> {
    const payload = recordPayload(event.payload);
    const userIds = new Set<string>();
    if (typeof payload.userId === "string") userIds.add(payload.userId);
    if (Array.isArray(payload.recipientUserIds)) {
      payload.recipientUserIds.forEach((id) => {
        if (typeof id === "string") userIds.add(id);
      });
    }
    const relatedEmails: string[] = [];
    if (typeof payload.studentId === "string") {
      const student = await this.prisma.student.findFirst({
        where: { id: payload.studentId, tenantId: event.tenantId! },
        select: { email: true },
      });
      if (student?.email) relatedEmails.push(student.email);
    }
    if (Array.isArray(payload.studentIds)) {
      const studentIds = payload.studentIds.filter(
        (id): id is string => typeof id === "string",
      );
      const students = await this.prisma.student.findMany({
        where: { id: { in: studentIds }, tenantId: event.tenantId! },
        select: { email: true },
      });
      students.forEach(({ email }) => {
        if (email) relatedEmails.push(email);
      });
    }
    if (typeof payload.instructorId === "string") {
      const instructor = await this.prisma.instructor.findFirst({
        where: { id: payload.instructorId, tenantId: event.tenantId! },
        select: { email: true },
      });
      if (instructor?.email) relatedEmails.push(instructor.email);
    }
    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId: event.tenantId!,
        active: true,
        user: {
          active: true,
          OR: [
            ...(userIds.size ? [{ id: { in: [...userIds] } }] : []),
            ...(relatedEmails.length
              ? [{ email: { in: relatedEmails, mode: "insensitive" as const } }]
              : []),
          ],
        },
      },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    if (memberships.length) return memberships.map(({ user }) => user);

    const administrativeEvents = new Set<DomainEventType>([
      DomainEventType.STUDENT_CREATED,
      DomainEventType.INSTALLMENT_OVERDUE,
      DomainEventType.DOCUMENT_EXPIRING,
      DomainEventType.PROCESS_EXPIRING,
    ]);
    if (!administrativeEvents.has(event.type)) return [];
    const administrators = await this.prisma.membership.findMany({
      where: {
        tenantId: event.tenantId!,
        active: true,
        role: {
          in: [
            MembershipRole.TENANT_OWNER,
            MembershipRole.TENANT_ADMIN,
            MembershipRole.SECRETARY,
            MembershipRole.FINANCE,
          ],
        },
        user: { active: true },
      },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    return administrators.map(({ user }) => user);
  }

  private async processRecipient(
    event: EventWithTenant,
    recipient: Recipient,
    templateCode: string,
  ): Promise<void> {
    const [preference, settings] = await Promise.all([
      this.prisma.notificationPreference.findUnique({
        where: {
          tenantId_userId_eventType: {
            tenantId: event.tenantId!,
            userId: recipient.id,
            eventType: event.type,
          },
        },
      }),
      this.communication.settings(recipient.id),
    ]);
    const critical = SECURITY_EVENT_TYPES.has(event.type);
    for (const channel of DEFAULT_CHANNELS) {
      const enabled =
        critical ||
        (channel === NotificationChannel.IN_APP
          ? (preference?.inAppEnabled ?? true)
          : channel === NotificationChannel.EMAIL
            ? (preference?.emailEnabled ?? settings.emailEnabled)
            : (preference?.pushEnabled ?? settings.pushEnabled));
      if (!enabled) {
        await this.suppressed(event, recipient, channel, templateCode);
        continue;
      }
      const scheduledAt =
        critical ||
        EVENT_DEFINITIONS[event.type]?.priority === NotificationPriority.URGENT
          ? new Date()
          : nextAllowedAt(
              new Date(),
              settings.timezone,
              settings.quietHoursStart,
              settings.quietHoursEnd,
            );
      await this.createDelivery({
        event,
        recipient,
        channel,
        templateCode,
        scheduledAt,
      });
    }
  }

  private variables(
    event: EventWithTenant,
    recipient: Recipient,
    actionUrl?: string,
  ): Record<string, unknown> {
    const payload = recordPayload(event.payload);
    const webUrl = this.config
      .get<string>("APP_WEB_URL", "http://localhost:3000")
      .replace(/\/$/, "");
    return {
      ...payload,
      tenantName: event.tenant?.name ?? "Prumo",
      userName: recipient.name,
      userEmail: recipient.email,
      eventType: event.type,
      actionUrl: actionUrl ? `${webUrl}${actionUrl}` : webUrl,
    };
  }

  private async createDelivery(input: {
    event: EventWithTenant;
    recipient: Recipient;
    channel: NotificationChannel;
    templateCode: string;
    scheduledAt: Date;
    scheduleIdentifier?: string;
    templateId?: string;
  }): Promise<void> {
    const definition = EVENT_DEFINITIONS[input.event.type];
    const actionUrl = definition?.actionUrl(recordPayload(input.event.payload));
    const template = input.templateId
      ? await this.prisma.notificationTemplate.findFirst({
          where: {
            id: input.templateId,
            active: true,
            OR: [{ tenantId: input.event.tenantId }, { tenantId: null }],
          },
        })
      : await this.communication.resolveTemplate(
          input.event.tenantId!,
          input.templateCode,
          input.channel,
        );
    if (!template) return;
    const variables = this.variables(input.event, input.recipient, actionUrl);
    this.renderer.validate(
      template.allowedVariables,
      template.subject,
      template.title,
      template.body,
    );
    const subject = template.subject
      ? this.renderer.render(template.subject, variables)
      : null;
    const title = template.title
      ? this.renderer.render(template.title, variables)
      : subject;
    const body = this.renderer.render(template.body, variables, {
      html: input.channel === NotificationChannel.EMAIL,
    });
    if (input.channel === NotificationChannel.EMAIL && !subject) return;
    if (input.channel !== NotificationChannel.EMAIL && !title) return;
    const pushToken =
      input.channel === NotificationChannel.PUSH
        ? await this.prisma.devicePushToken.findFirst({
            where: {
              userId: input.recipient.id,
              active: true,
              OR: [{ tenantId: input.event.tenantId }, { tenantId: null }],
            },
            orderBy: { lastUsedAt: "desc" },
          })
        : null;
    if (input.channel === NotificationChannel.PUSH && !pushToken) return;
    const destination =
      input.channel === NotificationChannel.EMAIL
        ? input.recipient.email
        : input.channel === NotificationChannel.PUSH
          ? pushToken!.token
          : input.recipient.id;
    const idempotencyKey = stableKey([
      input.event.id,
      input.recipient.id,
      input.channel,
      template.code,
      input.scheduleIdentifier,
    ]);
    const delivery = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.notificationDelivery.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return null;
      const existingNotification = await tx.notification.findFirst({
        where: {
          tenantId: input.event.tenantId!,
          userId: input.recipient.id,
          eventId: input.event.id,
        },
        orderBy: { createdAt: "asc" },
      });
      const notification =
        input.channel === NotificationChannel.IN_APP && !existingNotification
          ? await tx.notification.create({
              data: {
                tenantId: input.event.tenantId!,
                userId: input.recipient.id,
                eventId: input.event.id,
                type: input.event.type,
                title: title!,
                body,
                actionUrl,
                priority:
                  EVENT_DEFINITIONS[input.event.type]?.priority ??
                  NotificationPriority.NORMAL,
              },
            })
          : existingNotification;
      return tx.notificationDelivery.create({
        data: {
          tenantId: input.event.tenantId!,
          notificationId: notification?.id,
          eventId: input.event.id,
          userId: input.recipient.id,
          channel: input.channel,
          provider:
            input.channel === NotificationChannel.EMAIL
              ? "smtp"
              : input.channel === NotificationChannel.PUSH
                ? "expo"
                : "internal",
          destination,
          templateId: template.id,
          templateCode: template.code,
          templateVersion: template.version,
          renderedSubject: subject,
          renderedTitle: title,
          renderedBody: body,
          status:
            input.channel === NotificationChannel.IN_APP
              ? NotificationDeliveryStatus.DELIVERED
              : NotificationDeliveryStatus.PENDING,
          scheduledAt: input.scheduledAt,
          sentAt:
            input.channel === NotificationChannel.IN_APP
              ? new Date()
              : undefined,
          deliveredAt:
            input.channel === NotificationChannel.IN_APP
              ? new Date()
              : undefined,
          idempotencyKey,
        },
      });
    });
    if (delivery && delivery.status === NotificationDeliveryStatus.PENDING) {
      await this.communication.enqueueDelivery(delivery);
    }
  }

  private async suppressed(
    event: EventWithTenant,
    recipient: Recipient,
    channel: NotificationChannel,
    templateCode: string,
  ): Promise<void> {
    const template = await this.communication.resolveTemplate(
      event.tenantId!,
      templateCode,
      channel,
    );
    if (!template) return;
    const key = stableKey([event.id, recipient.id, channel, templateCode]);
    await this.prisma.notificationDelivery.upsert({
      where: { idempotencyKey: key },
      create: {
        tenantId: event.tenantId!,
        eventId: event.id,
        userId: recipient.id,
        channel,
        provider: "preferences",
        destination:
          channel === NotificationChannel.EMAIL
            ? recipient.email
            : recipient.id,
        templateId: template.id,
        templateCode,
        templateVersion: template.version,
        renderedBody: "",
        status: NotificationDeliveryStatus.SUPPRESSED,
        scheduledAt: new Date(),
        idempotencyKey: key,
      },
      update: {},
    });
  }

  private async manageReminders(
    event: EventWithTenant,
    recipients: Recipient[],
  ): Promise<void> {
    const payload = recordPayload(event.payload);
    const cancelTypes = new Set<DomainEventType>([
      DomainEventType.PRACTICAL_LESSON_RESCHEDULED,
      DomainEventType.PRACTICAL_LESSON_CANCELLED,
      DomainEventType.PRACTICAL_LESSON_COMPLETED,
      DomainEventType.THEORETICAL_CLASS_UPDATED,
      DomainEventType.THEORETICAL_CLASS_CANCELLED,
      DomainEventType.EXAM_RESCHEDULED,
      DomainEventType.EXAM_CANCELLED,
      DomainEventType.EXAM_RESULT_RECORDED,
    ]);
    if (cancelTypes.has(event.type)) {
      await this.queues.cancelReminders({
        tenantId: event.tenantId!,
        aggregateType: event.aggregateType,
        aggregateId:
          typeof payload.rescheduledFromId === "string"
            ? payload.rescheduledFromId
            : event.aggregateId,
      });
    }
    const scheduleField = EVENT_DEFINITIONS[event.type]?.scheduleField;
    const scheduleValue = scheduleField ? payload[scheduleField] : undefined;
    if (typeof scheduleValue !== "string") return;
    const occurrence = new Date(scheduleValue);
    if (Number.isNaN(occurrence.getTime()) || occurrence <= new Date()) return;
    const rules = await this.prisma.reminderRule.findMany({
      where: { tenantId: event.tenantId!, eventType: event.type, active: true },
    });
    for (const rule of rules) {
      const scheduledAt = new Date(
        occurrence.getTime() - rule.minutesBefore * 60_000,
      );
      if (scheduledAt <= new Date()) continue;
      for (const recipient of recipients) {
        const scheduleIdentifier = `${occurrence.toISOString()}-${rule.id}`;
        await this.queues.add(
          "reminders",
          "send-reminder",
          {
            eventId: event.id,
            userId: recipient.id,
            ruleId: rule.id,
            tenantId: event.tenantId,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            scheduleIdentifier,
          },
          {
            idempotencyKey: stableKey([
              event.id,
              recipient.id,
              rule.channel,
              rule.id,
              scheduleIdentifier,
            ]),
            delay: scheduledAt.getTime() - Date.now(),
          },
        );
      }
    }
  }

  async processReminder(input: {
    eventId: string;
    userId: string;
    ruleId: string;
    scheduleIdentifier: string;
  }): Promise<void> {
    const [event, user, rule] = await Promise.all([
      this.prisma.domainEvent.findUnique({
        where: { id: input.eventId },
        include: { tenant: { select: { name: true } } },
      }),
      this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.reminderRule.findUnique({ where: { id: input.ruleId } }),
    ]);
    if (!event?.tenantId || !event.tenant || !user || !rule?.active) return;
    await this.createDelivery({
      event,
      recipient: user,
      channel: rule.channel,
      templateCode: "reminder",
      templateId: rule.templateId,
      scheduledAt: new Date(),
      scheduleIdentifier: input.scheduleIdentifier,
    });
  }
}
