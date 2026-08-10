import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CampaignRecipientStatus,
  CommunicationAudienceType,
  CommunicationCampaignStatus,
  DomainEventStatus,
  DomainEventType,
  NotificationChannel,
  NotificationDeliveryStatus,
  Prisma,
  RegistryStatus,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../schedule/audit.service";
import {
  CampaignQueryDto,
  CampaignRecipientQueryDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from "./dto/communication.dto";
import { CommunicationQueueService } from "./queue.service";
import { stableKey } from "./communication.utils";
import { CommunicationService } from "./communication.service";

interface AudienceMember {
  userId?: string;
  studentId?: string;
  instructorId?: string;
  destination: string;
  name: string;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function meta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queues: CommunicationQueueService,
    private readonly communication: CommunicationService,
  ) {}

  create(tenantId: string, actorUserId: string, input: CreateCampaignDto) {
    if (input.channel === NotificationChannel.SMS) {
      throw new ConflictException("SMS real não está habilitado nesta fase.");
    }
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.communicationCampaign.create({
        data: {
          tenantId,
          createdByUserId: actorUserId,
          name: input.name,
          audienceType: input.audienceType,
          channel: input.channel,
          subject: input.subject,
          body: input.body,
          audienceFilter: input.audienceFilter
            ? json(input.audienceFilter)
            : undefined,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "CommunicationCampaign",
        entityId: campaign.id,
        action: "CREATE",
        actorUserId,
        after: campaign,
      });
      return campaign;
    });
  }

  async list(tenantId: string, query: CampaignQueryDto) {
    const where = {
      tenantId,
      status: query.status,
      channel: query.channel,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.communicationCampaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.communicationCampaign.count({ where }),
    ]);
    return { data, meta: meta(query.page, query.pageSize, total) };
  }

  async findOne(tenantId: string, id: string) {
    const campaign = await this.prisma.communicationCampaign.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { recipients: true } } },
    });
    if (!campaign) throw new NotFoundException("Campanha não encontrada.");
    return campaign;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateCampaignDto,
  ) {
    const before = await this.findOne(tenantId, id);
    if (before.status !== CommunicationCampaignStatus.DRAFT) {
      throw new ConflictException(
        "Apenas campanhas em rascunho podem ser editadas.",
      );
    }
    if (input.channel === NotificationChannel.SMS) {
      throw new ConflictException("SMS real não está habilitado nesta fase.");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.communicationCampaign.update({
        where: { id },
        data: {
          ...input,
          audienceFilter: input.audienceFilter
            ? json(input.audienceFilter)
            : undefined,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "CommunicationCampaign",
        entityId: id,
        action: "UPDATE",
        actorUserId,
        before,
        after: updated,
      });
      return updated;
    });
  }

  async schedule(
    tenantId: string,
    actorUserId: string,
    id: string,
    scheduledAt: Date,
  ) {
    const before = await this.findOne(tenantId, id);
    if (before.status !== CommunicationCampaignStatus.DRAFT) {
      throw new ConflictException("Campanha não está em rascunho.");
    }
    if (scheduledAt <= new Date()) {
      throw new ConflictException("O agendamento deve estar no futuro.");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.communicationCampaign.update({
        where: { id },
        data: {
          status: CommunicationCampaignStatus.SCHEDULED,
          scheduledAt,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "CommunicationCampaign",
        entityId: id,
        action: "SCHEDULE",
        actorUserId,
        before,
        after: campaign,
      });
      return campaign;
    });
    await this.enqueue(id, scheduledAt);
    return updated;
  }

  async send(tenantId: string, actorUserId: string, id: string) {
    const before = await this.findOne(tenantId, id);
    if (
      !(
        [
          CommunicationCampaignStatus.DRAFT,
          CommunicationCampaignStatus.SCHEDULED,
          CommunicationCampaignStatus.FAILED,
        ] as CommunicationCampaignStatus[]
      ).includes(before.status)
    ) {
      throw new ConflictException(
        "Campanha não pode ser enviada neste estado.",
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.communicationCampaign.update({
        where: { id },
        data: {
          status: CommunicationCampaignStatus.SCHEDULED,
          scheduledAt: new Date(),
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "CommunicationCampaign",
        entityId: id,
        action: "SEND",
        actorUserId,
        before,
        after: campaign,
      });
      return campaign;
    });
    await this.enqueue(id, new Date());
    return updated;
  }

  async cancel(tenantId: string, actorUserId: string, id: string) {
    const before = await this.findOne(tenantId, id);
    if (
      (
        [
          CommunicationCampaignStatus.COMPLETED,
          CommunicationCampaignStatus.CANCELLED,
        ] as CommunicationCampaignStatus[]
      ).includes(before.status)
    ) {
      throw new ConflictException("Campanha não pode ser cancelada.");
    }
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.communicationCampaign.update({
        where: { id },
        data: {
          status: CommunicationCampaignStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      await tx.communicationCampaignRecipient.updateMany({
        where: {
          tenantId,
          campaignId: id,
          status: CampaignRecipientStatus.PENDING,
        },
        data: { status: CampaignRecipientStatus.CANCELLED },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "CommunicationCampaign",
        entityId: id,
        action: "CANCEL",
        actorUserId,
        before,
        after: campaign,
      });
      return campaign;
    });
  }

  async recipients(
    tenantId: string,
    id: string,
    query: CampaignRecipientQueryDto,
  ) {
    await this.findOne(tenantId, id);
    const where = { tenantId, campaignId: id, status: query.status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.communicationCampaignRecipient.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.communicationCampaignRecipient.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        destination: row.destination.includes("@")
          ? `${row.destination.slice(0, 2)}***${row.destination.slice(row.destination.indexOf("@"))}`
          : "***",
      })),
      meta: meta(query.page, query.pageSize, total),
    };
  }

  private enqueue(campaignId: string, scheduledAt: Date) {
    return this.queues.add(
      "communication-campaigns",
      "send-campaign",
      { campaignId },
      {
        idempotencyKey: `${campaignId}-${scheduledAt.toISOString()}`,
        delay: Math.max(0, scheduledAt.getTime() - Date.now()),
      },
    );
  }

  async process(campaignId: string): Promise<void> {
    const campaign = await this.prisma.communicationCampaign.findUnique({
      where: { id: campaignId },
      include: { tenant: { select: { name: true } } },
    });
    if (
      !campaign ||
      campaign.status === CommunicationCampaignStatus.CANCELLED ||
      campaign.status === CommunicationCampaignStatus.COMPLETED
    ) {
      return;
    }
    await this.prisma.communicationCampaign.update({
      where: { id: campaignId },
      data: {
        status: CommunicationCampaignStatus.PROCESSING,
        startedAt: new Date(),
      },
    });
    try {
      const audience = await this.resolveAudience(campaign);
      const event = await this.prisma.domainEvent.upsert({
        where: {
          idempotencyKey: stableKey(["campaign", campaign.id]),
        },
        create: {
          tenantId: campaign.tenantId,
          type: DomainEventType.COMMUNICATION_CAMPAIGN,
          aggregateType: "CommunicationCampaign",
          aggregateId: campaign.id,
          payload: json({ campaignId: campaign.id }),
          status: DomainEventStatus.PROCESSED,
          processedAt: new Date(),
          idempotencyKey: stableKey(["campaign", campaign.id]),
        },
        update: {},
      });
      for (const member of audience) {
        const recipient =
          await this.prisma.communicationCampaignRecipient.upsert({
            where: {
              tenantId_campaignId_destination: {
                tenantId: campaign.tenantId,
                campaignId: campaign.id,
                destination: member.destination,
              },
            },
            create: {
              tenantId: campaign.tenantId,
              campaignId: campaign.id,
              userId: member.userId,
              studentId: member.studentId,
              instructorId: member.instructorId,
              destination: member.destination,
            },
            update: {},
          });
        if (!member.userId) {
          await this.prisma.communicationCampaignRecipient.update({
            where: { id: recipient.id },
            data: { status: CampaignRecipientStatus.FAILED },
          });
          continue;
        }
        const key = stableKey([
          event.id,
          member.userId,
          campaign.channel,
          "manual-campaign",
          campaign.id,
        ]);
        const delivery = await this.prisma.$transaction(async (tx) => {
          const existingDelivery = await tx.notificationDelivery.findUnique({
            where: { idempotencyKey: key },
          });
          if (existingDelivery) return existingDelivery;
          const notification =
            campaign.channel === NotificationChannel.IN_APP
              ? await tx.notification.create({
                  data: {
                    tenantId: campaign.tenantId,
                    userId: member.userId!,
                    eventId: event.id,
                    type: "COMMUNICATION_CAMPAIGN",
                    title: campaign.subject ?? campaign.name,
                    body: campaign.body,
                  },
                })
              : null;
          return tx.notificationDelivery.create({
            data: {
              tenantId: campaign.tenantId,
              notificationId: notification?.id,
              eventId: event.id,
              userId: member.userId!,
              channel: campaign.channel,
              provider:
                campaign.channel === NotificationChannel.EMAIL
                  ? "smtp"
                  : campaign.channel === NotificationChannel.PUSH
                    ? "expo"
                    : "internal",
              destination: member.destination,
              templateCode: "manual-campaign",
              templateVersion: 1,
              renderedSubject: campaign.subject,
              renderedTitle: campaign.subject ?? campaign.name,
              renderedBody: campaign.body,
              status:
                campaign.channel === NotificationChannel.IN_APP
                  ? NotificationDeliveryStatus.DELIVERED
                  : NotificationDeliveryStatus.PENDING,
              scheduledAt: new Date(),
              sentAt:
                campaign.channel === NotificationChannel.IN_APP
                  ? new Date()
                  : undefined,
              deliveredAt:
                campaign.channel === NotificationChannel.IN_APP
                  ? new Date()
                  : undefined,
              idempotencyKey: key,
            },
          });
        });
        await this.prisma.communicationCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            deliveryId: delivery.id,
            status:
              campaign.channel === NotificationChannel.IN_APP
                ? CampaignRecipientStatus.DELIVERED
                : CampaignRecipientStatus.QUEUED,
          },
        });
        if (delivery.status === NotificationDeliveryStatus.PENDING) {
          await this.communication.enqueueDelivery(delivery);
        }
      }
      await this.prisma.communicationCampaign.update({
        where: { id: campaignId },
        data: {
          status: CommunicationCampaignStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.communicationCampaign.update({
        where: { id: campaignId },
        data: { status: CommunicationCampaignStatus.FAILED },
      });
      throw error;
    }
  }

  private async resolveAudience(
    campaign: Prisma.CommunicationCampaignGetPayload<{
      include: { tenant: { select: { name: true } } };
    }>,
  ): Promise<AudienceMember[]> {
    const filter =
      campaign.audienceFilter &&
      typeof campaign.audienceFilter === "object" &&
      !Array.isArray(campaign.audienceFilter)
        ? (campaign.audienceFilter as Record<string, unknown>)
        : {};
    if (campaign.audienceType === CommunicationAudienceType.INSTRUCTORS) {
      const instructors = await this.prisma.instructor.findMany({
        where: {
          tenantId: campaign.tenantId,
          status: RegistryStatus.ACTIVE,
          email: { not: null },
        },
        select: { id: true, name: true, email: true },
      });
      return this.attachUsers(
        campaign.tenantId,
        instructors.map((item) => ({
          instructorId: item.id,
          name: item.name,
          destination: item.email!,
        })),
        campaign.channel,
      );
    }
    const studentWhere: Prisma.StudentWhereInput = {
      tenantId: campaign.tenantId,
      email: { not: null },
      status:
        campaign.audienceType === CommunicationAudienceType.ACTIVE_STUDENTS
          ? RegistryStatus.ACTIVE
          : undefined,
      id:
        campaign.audienceType === CommunicationAudienceType.MANUAL_SELECTION &&
        Array.isArray(filter.studentIds)
          ? {
              in: filter.studentIds.filter(
                (id): id is string => typeof id === "string",
              ),
            }
          : undefined,
      receivables:
        campaign.audienceType === CommunicationAudienceType.OVERDUE_STUDENTS
          ? { some: { status: "OVERDUE", balanceCents: { gt: 0 } } }
          : undefined,
      licenseProcesses:
        campaign.audienceType === CommunicationAudienceType.PROCESS_STAGE &&
        typeof filter.stageType === "string"
          ? { some: { stages: { some: { type: filter.stageType as never } } } }
          : undefined,
    };
    const students = await this.prisma.student.findMany({
      where: studentWhere,
      select: { id: true, name: true, email: true },
    });
    return this.attachUsers(
      campaign.tenantId,
      students.map((student) => ({
        studentId: student.id,
        name: student.name,
        destination: student.email!,
      })),
      campaign.channel,
    );
  }

  private async attachUsers(
    tenantId: string,
    members: AudienceMember[],
    channel: NotificationChannel,
  ): Promise<AudienceMember[]> {
    const users = await this.prisma.user.findMany({
      where: {
        email: { in: members.map(({ destination }) => destination) },
        memberships: { some: { tenantId, active: true } },
      },
      select: { id: true, email: true },
    });
    const userByEmail = new Map(
      users.map((user) => [user.email.toLowerCase(), user.id]),
    );
    if (channel === NotificationChannel.PUSH) {
      const tokens = await this.prisma.devicePushToken.findMany({
        where: {
          userId: { in: users.map(({ id }) => id) },
          active: true,
          OR: [{ tenantId }, { tenantId: null }],
        },
        orderBy: { lastUsedAt: "desc" },
      });
      const tokenByUser = new Map<string, string>();
      for (const token of tokens) {
        if (!tokenByUser.has(token.userId))
          tokenByUser.set(token.userId, token.token);
      }
      return members
        .map((member) => {
          const userId = userByEmail.get(member.destination.toLowerCase());
          return {
            ...member,
            userId,
            destination: userId ? (tokenByUser.get(userId) ?? "") : "",
          };
        })
        .filter(({ destination }) => Boolean(destination));
    }
    return members.map((member) => ({
      ...member,
      userId: userByEmail.get(member.destination.toLowerCase()),
      destination:
        channel === NotificationChannel.IN_APP
          ? (userByEmail.get(member.destination.toLowerCase()) ??
            member.destination)
          : member.destination,
    }));
  }
}
