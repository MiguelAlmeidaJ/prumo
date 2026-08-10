import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DomainEventStatus,
  DomainEventType,
  NotificationChannel,
  NotificationDeliveryStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../schedule/audit.service";
import {
  CreateTemplateDto,
  DeliveryQueryDto,
  EventQueryDto,
  NotificationQueryDto,
  RegisterPushTokenDto,
  TemplateQueryDto,
  UpdateCommunicationSettingsDto,
  UpdatePreferencesDto,
  UpdateReminderRuleDto,
  UpdateTemplateDto,
} from "./dto/communication.dto";
import { EmailProvider } from "./providers/email.provider";
import { CommunicationQueueService } from "./queue.service";
import { TemplateRendererService } from "./template-renderer.service";
import {
  isValidTimeZone,
  maskDestination,
  safeError,
} from "./communication.utils";

const EVENT_TYPES = Object.values(DomainEventType);

function pageMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

@Injectable()
export class CommunicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly renderer: TemplateRendererService,
    private readonly queues: CommunicationQueueService,
    private readonly emailProvider: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  async notifications(
    tenantId: string,
    userId: string,
    query: NotificationQueryDto,
  ) {
    const where: Prisma.NotificationWhereInput = {
      tenantId,
      userId,
      archivedAt: null,
      type: query.type,
      priority: query.priority,
      readAt:
        query.read === undefined
          ? undefined
          : query.read
            ? { not: null }
            : null,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, meta: pageMeta(query.page, query.pageSize, total) };
  }

  unreadCount(tenantId: string, userId: string) {
    return this.prisma.notification
      .count({ where: { tenantId, userId, readAt: null, archivedAt: null } })
      .then((count) => ({ count }));
  }

  async notification(tenantId: string, userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, tenantId, userId },
    });
    if (!notification)
      throw new NotFoundException("Notificação não encontrada.");
    return notification;
  }

  async read(tenantId: string, userId: string, id: string) {
    await this.notification(tenantId, userId, id);
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async readAll(tenantId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { tenantId, userId, readAt: null, archivedAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async archive(tenantId: string, userId: string, id: string) {
    await this.notification(tenantId, userId, id);
    return this.prisma.notification.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async preferences(tenantId: string, userId: string) {
    await this.prisma.notificationPreference.createMany({
      data: EVENT_TYPES.map((eventType) => ({
        tenantId,
        userId,
        eventType,
      })),
      skipDuplicates: true,
    });
    return this.prisma.notificationPreference.findMany({
      where: { tenantId, userId },
      orderBy: { eventType: "asc" },
    });
  }

  async updatePreferences(
    tenantId: string,
    userId: string,
    input: UpdatePreferencesDto,
  ) {
    await this.prisma.$transaction(
      input.preferences.map((preference) =>
        this.prisma.notificationPreference.upsert({
          where: {
            tenantId_userId_eventType: {
              tenantId,
              userId,
              eventType: preference.eventType,
            },
          },
          create: { tenantId, userId, ...preference },
          update: preference,
        }),
      ),
    );
    return this.preferences(tenantId, userId);
  }

  settings(userId: string) {
    return this.prisma.userCommunicationSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async updateSettings(userId: string, input: UpdateCommunicationSettingsDto) {
    if (!isValidTimeZone(input.timezone)) {
      throw new BadRequestException("Timezone inválido.");
    }
    if (Boolean(input.quietHoursStart) !== Boolean(input.quietHoursEnd)) {
      throw new BadRequestException(
        "Informe o início e o fim do horário silencioso.",
      );
    }
    return this.prisma.userCommunicationSettings.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
  }

  async registerDevice(
    tenantId: string,
    userId: string,
    input: RegisterPushTokenDto,
  ) {
    const existing = await this.prisma.devicePushToken.findUnique({
      where: { token: input.token },
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException("Este token pertence a outro usuário.");
    }
    return this.prisma.devicePushToken.upsert({
      where: { token: input.token },
      create: { tenantId, userId, ...input },
      update: {
        tenantId,
        platform: input.platform,
        deviceName: input.deviceName,
        active: true,
        lastUsedAt: new Date(),
      },
      select: {
        id: true,
        platform: true,
        deviceName: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  devices(tenantId: string, userId: string) {
    return this.prisma.devicePushToken.findMany({
      where: { userId, OR: [{ tenantId }, { tenantId: null }] },
      select: {
        id: true,
        platform: true,
        deviceName: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { lastUsedAt: "desc" },
    });
  }

  async removeDevice(tenantId: string, userId: string, id: string) {
    const result = await this.prisma.devicePushToken.updateMany({
      where: { id, userId, OR: [{ tenantId }, { tenantId: null }] },
      data: { active: false },
    });
    if (!result.count)
      throw new NotFoundException("Dispositivo não encontrado.");
  }

  async templates(tenantId: string, query: TemplateQueryDto) {
    const where: Prisma.NotificationTemplateWhereInput = {
      OR: [{ tenantId }, { tenantId: null }],
      code: query.code
        ? { contains: query.code, mode: "insensitive" }
        : undefined,
      channel: query.channel,
      active: query.active,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notificationTemplate.findMany({
        where,
        orderBy: [{ code: "asc" }, { channel: "asc" }, { version: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notificationTemplate.count({ where }),
    ]);
    return { data, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async template(tenantId: string, id: string) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!template) throw new NotFoundException("Template não encontrado.");
    return template;
  }

  async resolveTemplate(
    tenantId: string,
    code: string,
    channel: NotificationChannel,
  ) {
    const tenantTemplate = await this.prisma.notificationTemplate.findFirst({
      where: {
        code,
        channel,
        active: true,
        tenantId,
      },
      orderBy: { version: "desc" },
    });
    if (tenantTemplate) return tenantTemplate;
    return this.prisma.notificationTemplate.findFirst({
      where: { code, channel, active: true, tenantId: null },
      orderBy: { version: "desc" },
    });
  }

  async createTemplate(
    tenantId: string,
    actorUserId: string,
    input: CreateTemplateDto,
  ) {
    this.renderer.validate(
      input.allowedVariables,
      input.subject,
      input.title,
      input.body,
    );
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.notificationTemplate.findFirst({
        where: { tenantId, code: input.code, channel: input.channel },
        orderBy: { version: "desc" },
      });
      if (input.active) {
        await tx.notificationTemplate.updateMany({
          where: {
            tenantId,
            code: input.code,
            channel: input.channel,
            active: true,
          },
          data: { active: false },
        });
      }
      const created = await tx.notificationTemplate.create({
        data: { tenantId, ...input, version: (latest?.version ?? 0) + 1 },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "NotificationTemplate",
        entityId: created.id,
        action: "CREATE",
        actorUserId,
        after: created,
      });
      return created;
    });
  }

  async updateTemplate(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateTemplateDto,
  ) {
    const current = await this.template(tenantId, id);
    if (current.tenantId !== tenantId) {
      throw new ForbiddenException(
        "Crie uma sobrescrita do tenant para alterar um template global.",
      );
    }
    const contentChanged = [
      "subject",
      "title",
      "body",
      "allowedVariables",
    ].some((field) => field in input);
    const allowed = input.allowedVariables ?? current.allowedVariables;
    this.renderer.validate(
      allowed,
      input.subject === undefined ? current.subject : input.subject,
      input.title === undefined ? current.title : input.title,
      input.body ?? current.body,
    );
    return this.prisma.$transaction(async (tx) => {
      if (!contentChanged) {
        const updated = await tx.notificationTemplate.update({
          where: { id },
          data: { active: input.active },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "NotificationTemplate",
          entityId: id,
          action: input.active ? "ACTIVATE" : "DEACTIVATE",
          actorUserId,
          before: current,
          after: updated,
        });
        return updated;
      }
      await tx.notificationTemplate.updateMany({
        where: {
          tenantId,
          code: current.code,
          channel: current.channel,
          active: true,
        },
        data: { active: false },
      });
      const created = await tx.notificationTemplate.create({
        data: {
          tenantId,
          code: current.code,
          channel: current.channel,
          subject:
            input.subject === undefined ? current.subject : input.subject,
          title: input.title === undefined ? current.title : input.title,
          body: input.body ?? current.body,
          allowedVariables: allowed,
          active: input.active ?? true,
          version: current.version + 1,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "NotificationTemplate",
        entityId: created.id,
        action: "CREATE_VERSION",
        actorUserId,
        before: current,
        after: created,
      });
      return created;
    });
  }

  async deliveries(tenantId: string, query: DeliveryQueryDto) {
    const where: Prisma.NotificationDeliveryWhereInput = {
      tenantId,
      channel: query.channel,
      status: query.status,
      templateCode: query.template
        ? { contains: query.template, mode: "insensitive" }
        : undefined,
      eventId: query.eventId,
      userId: query.userId,
      provider: query.provider,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notificationDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    const data = rows.map((delivery) => ({
      ...delivery,
      destination: maskDestination(delivery.destination),
    }));
    return { data, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async delivery(tenantId: string, id: string) {
    const delivery = await this.prisma.notificationDelivery.findFirst({
      where: { id, tenantId },
    });
    if (!delivery) throw new NotFoundException("Entrega não encontrada.");
    return { ...delivery, destination: maskDestination(delivery.destination) };
  }

  async retryDelivery(tenantId: string, actorUserId: string, id: string) {
    const delivery = await this.prisma.notificationDelivery.findFirst({
      where: { id, tenantId },
    });
    if (!delivery) throw new NotFoundException("Entrega não encontrada.");
    if (delivery.status !== NotificationDeliveryStatus.FAILED) {
      throw new ConflictException(
        "Apenas entregas com falha podem ser reenviadas.",
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.notificationDelivery.update({
        where: { id },
        data: {
          status: NotificationDeliveryStatus.PENDING,
          attempts: 0,
          failedAt: null,
          lastError: null,
          scheduledAt: new Date(),
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "NotificationDelivery",
        entityId: id,
        action: "RETRY",
        actorUserId,
        before: delivery,
        after: result,
      });
      return result;
    });
    await this.enqueueDelivery(updated);
    return { ...updated, destination: maskDestination(updated.destination) };
  }

  async enqueueDelivery(delivery: {
    id: string;
    channel: NotificationChannel;
    scheduledAt: Date;
  }) {
    const queue =
      delivery.channel === NotificationChannel.EMAIL
        ? "emails"
        : delivery.channel === NotificationChannel.PUSH
          ? "push-notifications"
          : "notifications";
    await this.queues.add(
      queue,
      "send-delivery",
      { deliveryId: delivery.id },
      {
        idempotencyKey: delivery.id,
        delay: Math.max(0, delivery.scheduledAt.getTime() - Date.now()),
      },
    );
    await this.prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        status: NotificationDeliveryStatus.PENDING,
      },
      data: { status: NotificationDeliveryStatus.QUEUED, queuedAt: new Date() },
    });
  }

  async events(tenantId: string, query: EventQueryDto) {
    const where: Prisma.DomainEventWhereInput = {
      tenantId,
      type: query.type,
      status: query.status,
      aggregateType: query.aggregateType,
      occurredAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.domainEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.domainEvent.count({ where }),
    ]);
    return { data, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async event(tenantId: string, id: string) {
    const event = await this.prisma.domainEvent.findFirst({
      where: { id, tenantId },
    });
    if (!event) throw new NotFoundException("Evento não encontrado.");
    return event;
  }

  async sendTestEmail(tenantId: string, destination: string, subject: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });
    const result = await this.emailProvider.send({
      to: destination,
      subject,
      text: `Este é um teste de e-mail do Prumo para ${tenant.name}.`,
      html: `<h1>Prumo</h1><p>Este é um teste de e-mail para ${tenant.name}.</p>`,
    });
    return { provider: this.emailProvider.name, ...result };
  }

  reminderRules(tenantId: string) {
    return this.prisma.reminderRule.findMany({
      where: { tenantId },
      include: {
        template: {
          select: { id: true, code: true, channel: true, version: true },
        },
      },
      orderBy: [{ eventType: "asc" }, { minutesBefore: "desc" }],
    });
  }

  async updateReminderRule(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateReminderRuleDto,
  ) {
    const before = await this.prisma.reminderRule.findFirst({
      where: { id, tenantId },
    });
    if (!before)
      throw new NotFoundException("Regra de lembrete não encontrada.");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reminderRule.update({
        where: { id },
        data: input,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ReminderRule",
        entityId: id,
        action:
          input.active === undefined
            ? "UPDATE"
            : input.active
              ? "ACTIVATE"
              : "DEACTIVATE",
        actorUserId,
        before,
        after: updated,
      });
      return updated;
    });
  }

  testEndpointsAllowed(): boolean {
    return (
      process.env.NODE_ENV !== "production" ||
      this.config.get<string>("ALLOW_COMMUNICATION_TEST_ENDPOINTS") === "true"
    );
  }

  async markEventForReprocessing(
    tenantId: string,
    actorUserId: string,
    id: string,
  ) {
    const before = await this.event(tenantId, id);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.domainEvent.update({
        where: { id },
        data: {
          status: DomainEventStatus.PENDING,
          attempts: 0,
          processingStartedAt: null,
          processedAt: null,
          failedAt: null,
          lastError: null,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "DomainEvent",
        entityId: id,
        action: "REPROCESS",
        actorUserId,
        before,
        after: updated,
      });
      return updated;
    });
    try {
      await this.queues.add(
        "domain-events",
        "dispatch-event",
        { eventId: id },
        { idempotencyKey: `${id}-${Date.now()}` },
      );
    } catch (error) {
      await this.prisma.domainEvent.update({
        where: { id },
        data: { lastError: safeError(error) },
      });
      throw error;
    }
    return result;
  }
}
