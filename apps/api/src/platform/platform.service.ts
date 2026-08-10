import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AuditActorType,
  BillingCycle,
  DomainEventStatus,
  DomainEventType,
  LessonStatus,
  MembershipRole,
  NotificationChannel,
  NotificationDeliveryStatus,
  PaymentStatus,
  PlatformPlanStatus,
  PlatformRole,
  Prisma,
  RegistryStatus,
  SupportSessionStatus,
  TenantStatus,
  TenantSubscriptionStatus,
} from "@prisma/client";
import { compare, hash } from "bcrypt";
import { PrismaService } from "../database/prisma.service";
import { AuthService } from "../auth/auth.service";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { IdentityService } from "../identity/identity.service";
import { PlatformAuditService } from "./platform-audit.service";
import {
  PLATFORM_FEATURES,
  PlatformEntitlementService,
  type PlatformFeature,
} from "./platform-entitlement.service";
import type {
  AuditQueryDto,
  ChangePlatformRoleDto,
  CreatePlatformPlanDto,
  CreateSubscriptionDto,
  CreateTenantDto,
  EndSupportSessionDto,
  PlanListQueryDto,
  StartSupportSessionDto,
  SubscriptionListQueryDto,
  SupportSessionQueryDto,
  TenantListQueryDto,
  UpdatePlatformPlanDto,
  UpdateSettingsDto,
  UpdateSubscriptionDto,
  UpdateTenantDto,
  UserListQueryDto,
} from "./platform.dto";

export interface RequestAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

const TENANT_SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  document: true,
  status: true,
  planCode: true,
  trialStartsAt: true,
  trialEndsAt: true,
  activatedAt: true,
  suspendedAt: true,
  suspensionReason: true,
  cancelledAt: true,
  cancellationReason: true,
  archivedAt: true,
  provisioningKey: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantSelect;

function toDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} deve ser uma data válida.`);
  }
  return parsed;
}

function pageResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly auth: AuthService,
    private readonly entitlements: PlatformEntitlementService,
    private readonly identity: IdentityService,
  ) {}

  async dashboard(from?: string, to?: string) {
    const periodStart =
      toDate(from, "from") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const periodEnd = toDate(to, "to") ?? new Date();
    const [
      tenantsByStatus,
      newTenants,
      activeUsers,
      activeStudents,
      scheduledLessons,
      completedLessons,
      exams,
      activeContracts,
      processedPayments,
      sentNotifications,
      failedDeliveries,
      failedJobs,
    ] = await Promise.all([
      this.prisma.tenant.groupBy({ by: ["status"], _count: true }),
      this.prisma.tenant.count({
        where: { createdAt: { gte: periodStart, lte: periodEnd } },
      }),
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.student.count({ where: { status: RegistryStatus.ACTIVE } }),
      this.prisma.lesson.count({
        where: {
          status: {
            in: [LessonStatus.PENDING, LessonStatus.CONFIRMED],
          },
          startsAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      this.prisma.lesson.count({
        where: {
          status: LessonStatus.COMPLETED,
          startsAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      this.prisma.exam.count({
        where: { scheduledAt: { gte: periodStart, lte: periodEnd } },
      }),
      this.prisma.studentContract.count({ where: { status: "ACTIVE" } }),
      this.prisma.payment.aggregate({
        where: {
          status: {
            in: [PaymentStatus.CONFIRMED, PaymentStatus.PARTIALLY_REFUNDED],
          },
          receivedAt: { gte: periodStart, lte: periodEnd },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.notificationDelivery.count({
        where: {
          status: {
            in: [
              NotificationDeliveryStatus.SENT,
              NotificationDeliveryStatus.DELIVERED,
            ],
          },
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      this.prisma.notificationDelivery.count({
        where: {
          status: NotificationDeliveryStatus.FAILED,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      this.prisma.scheduledTaskExecution.count({
        where: {
          status: "FAILED",
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      }),
    ]);
    return {
      period: { from: periodStart, to: periodEnd },
      tenants: Object.fromEntries(
        tenantsByStatus.map((entry) => [entry.status, entry._count]),
      ),
      newTenants,
      activeUsers,
      activeStudents,
      lessons: {
        scheduled: scheduledLessons,
        completed: completedLessons,
      },
      exams,
      activeContracts,
      processedVolumeCents: processedPayments._sum.amountCents ?? 0,
      notifications: {
        sent: sentNotifications,
        failed: failedDeliveries,
      },
      storageBytes: null,
      failedJobs,
      services: await this.health(),
    };
  }

  async listTenants(query: TenantListQueryDto) {
    const where: Prisma.TenantWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { slug: { contains: query.search, mode: "insensitive" } },
              { document: { contains: query.search } },
            ],
          }
        : {}),
      status: query.status,
      planCode: query.planCode,
      createdAt:
        query.createdFrom || query.createdTo
          ? {
              gte: toDate(query.createdFrom, "createdFrom"),
              lte: toDate(query.createdTo, "createdTo"),
            }
          : undefined,
      trialEndsAt:
        query.trialFrom || query.trialTo
          ? {
              gte: toDate(query.trialFrom, "trialFrom"),
              lte: toDate(query.trialTo, "trialTo"),
            }
          : undefined,
      ...(query.subscriptionExpired
        ? {
            subscriptions: {
              some: {
                currentPeriodEndsAt: { lt: new Date() },
                status: { not: TenantSubscriptionStatus.CANCELLED },
              },
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        select: {
          ...TENANT_SUMMARY_SELECT,
          _count: { select: { memberships: true, students: true } },
          subscriptions: {
            select: {
              id: true,
              status: true,
              currentPeriodEndsAt: true,
              plan: { select: { code: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return pageResult(data, total, query.page, query.pageSize);
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        ...TENANT_SUMMARY_SELECT,
        settings: true,
        financialSettings: true,
        subscriptions: {
          select: {
            id: true,
            status: true,
            billingCycle: true,
            startsAt: true,
            trialEndsAt: true,
            currentPeriodStartsAt: true,
            currentPeriodEndsAt: true,
            cancelledAt: true,
            plan: {
              select: {
                id: true,
                code: true,
                name: true,
                features: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            memberships: true,
            students: true,
            instructors: true,
            vehicles: true,
            schoolUnits: true,
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException("Tenant não encontrado.");
    return tenant;
  }

  async createTenant(
    input: CreateTenantDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    if (input.provisioningKey) {
      const existing = await this.prisma.tenant.findUnique({
        where: { provisioningKey: input.provisioningKey },
        select: TENANT_SUMMARY_SELECT,
      });
      if (existing) return { ...existing, idempotentReplay: true };
    }
    const slug = normalizeSlug(input.slug);
    if (!slug) throw new BadRequestException("Slug inválido.");
    const plan = input.planCode
      ? await this.prisma.platformPlan.findUnique({
          where: { code: input.planCode },
        })
      : null;
    if (input.planCode && !plan) {
      throw new NotFoundException("Plano não encontrado.");
    }
    const status = input.status ?? TenantStatus.TRIAL;
    if (status !== TenantStatus.TRIAL && status !== TenantStatus.ACTIVE) {
      throw new BadRequestException(
        "Um tenant novo deve iniciar em TRIAL ou ACTIVE.",
      );
    }
    const trialEndsAt =
      toDate(input.trialEndsAt, "trialEndsAt") ??
      (status === TenantStatus.TRIAL
        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        : undefined);
    const ownerPasswordHash = input.owner
      ? await hash(input.owner.password ?? crypto.randomUUID(), 12)
      : undefined;
    const now = new Date();
    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.create({
          data: {
            name: input.name.trim(),
            slug,
            document: input.document?.trim(),
            status,
            planCode: plan?.code,
            trialStartsAt: status === TenantStatus.TRIAL ? now : undefined,
            trialEndsAt,
            activatedAt: status === TenantStatus.ACTIVE ? now : undefined,
            createdByPlatformUserId: actor.id,
            provisioningKey: input.provisioningKey,
            settings: { create: {} },
            financialSettings: { create: {} },
          },
          select: TENANT_SUMMARY_SELECT,
        });
        let owner: { id: string; email: string } | null = null;
        if (input.owner && ownerPasswordHash) {
          owner = await transaction.user.upsert({
            where: { email: input.owner.email.toLowerCase() },
            update: { active: true },
            create: {
              name: input.owner.name.trim(),
              email: input.owner.email.toLowerCase(),
              passwordHash: ownerPasswordHash,
              passwordSetAt: input.owner.password ? now : null,
              communicationSettings: { create: {} },
            },
            select: { id: true, email: true },
          });
          await transaction.membership.upsert({
            where: {
              tenantId_userId: {
                tenantId: tenant.id,
                userId: owner.id,
              },
            },
            update: { active: true, role: MembershipRole.TENANT_OWNER },
            create: {
              tenantId: tenant.id,
              userId: owner.id,
              role: MembershipRole.TENANT_OWNER,
            },
          });
          await transaction.notificationPreference.upsert({
            where: {
              tenantId_userId_eventType: {
                tenantId: tenant.id,
                userId: owner.id,
                eventType: DomainEventType.PRACTICAL_LESSON_CREATED,
              },
            },
            update: {
              inAppEnabled: true,
              emailEnabled: true,
              pushEnabled: true,
            },
            create: {
              tenantId: tenant.id,
              userId: owner.id,
              eventType: DomainEventType.PRACTICAL_LESSON_CREATED,
              inAppEnabled: true,
              emailEnabled: true,
              pushEnabled: true,
            },
          });
        }
        const template = await transaction.notificationTemplate.create({
          data: {
            tenantId: tenant.id,
            code: "PRACTICAL_LESSON_REMINDER",
            channel: NotificationChannel.IN_APP,
            title: "Lembrete de aula prática",
            body: "Sua aula prática está próxima.",
            allowedVariables: [],
          },
        });
        await transaction.reminderRule.create({
          data: {
            tenantId: tenant.id,
            eventType: DomainEventType.PRACTICAL_LESSON_CREATED,
            channel: NotificationChannel.IN_APP,
            minutesBefore: 60,
            templateId: template.id,
          },
        });
        if (plan) {
          const endsAt =
            trialEndsAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          await transaction.tenantSubscription.create({
            data: {
              tenantId: tenant.id,
              planId: plan.id,
              status:
                status === TenantStatus.TRIAL
                  ? TenantSubscriptionStatus.TRIALING
                  : TenantSubscriptionStatus.ACTIVE,
              billingCycle: BillingCycle.MANUAL,
              startsAt: now,
              trialEndsAt,
              currentPeriodStartsAt: now,
              currentPeriodEndsAt: endsAt,
            },
          });
        }
        await this.audit.record(
          {
            platformUserId: actor.id,
            tenantId: tenant.id,
            entityType: "Tenant",
            entityId: tenant.id,
            action: "PLATFORM_TENANT_CREATED",
            ...requestContext,
            after: tenant,
          },
          transaction,
        );
        return {
          ...tenant,
          owner: owner
            ? { ...owner, invitationPrepared: !input.owner?.password }
            : null,
          idempotentReplay: false,
        };
      });
      if (created.owner?.invitationPrepared) {
        const emailSent = await this.identity.issuePlatformOwnerInvitation(
          created.owner.id,
          created.id,
        );
        return { ...created, owner: { ...created.owner, emailSent } };
      }
      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Slug, documento ou chave de provisionamento já utilizado.",
        );
      }
      throw error;
    }
  }

  async updateTenant(
    id: string,
    input: UpdateTenantDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    const before = await this.getTenant(id);
    const data: Prisma.TenantUpdateInput = {
      name: input.name?.trim(),
      slug: input.slug ? normalizeSlug(input.slug) : undefined,
      document: input.document?.trim(),
      planCode: input.planCode,
    };
    if (input.planCode) {
      const exists = await this.prisma.platformPlan.findUnique({
        where: { code: input.planCode },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException("Plano não encontrado.");
    }
    try {
      const after = await this.prisma.tenant.update({
        where: { id },
        data,
        select: TENANT_SUMMARY_SELECT,
      });
      await this.audit.record({
        platformUserId: actor.id,
        tenantId: id,
        entityType: "Tenant",
        entityId: id,
        action: "PLATFORM_TENANT_UPDATED",
        ...requestContext,
        before,
        after,
      });
      return after;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Slug ou documento já utilizado.");
      }
      throw error;
    }
  }

  async changeTenantStatus(
    id: string,
    action: "activate" | "suspend" | "reactivate" | "cancel" | "archive",
    reason: string,
    currentPassword: string,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    await this.assertReauthenticated(actor.id, currentPassword);
    const before = await this.prisma.tenant.findUnique({
      where: { id },
      select: TENANT_SUMMARY_SELECT,
    });
    if (!before) throw new NotFoundException("Tenant não encontrado.");
    const transitions: Record<
      typeof action,
      { from: TenantStatus[]; to: TenantStatus }
    > = {
      activate: { from: [TenantStatus.TRIAL], to: TenantStatus.ACTIVE },
      suspend: {
        from: [TenantStatus.TRIAL, TenantStatus.ACTIVE, TenantStatus.PAST_DUE],
        to: TenantStatus.SUSPENDED,
      },
      reactivate: {
        from: [TenantStatus.SUSPENDED],
        to: TenantStatus.ACTIVE,
      },
      cancel: {
        from: [
          TenantStatus.TRIAL,
          TenantStatus.ACTIVE,
          TenantStatus.PAST_DUE,
          TenantStatus.SUSPENDED,
        ],
        to: TenantStatus.CANCELLED,
      },
      archive: {
        from: [TenantStatus.CANCELLED],
        to: TenantStatus.ARCHIVED,
      },
    };
    const transition = transitions[action];
    if (!transition.from.includes(before.status)) {
      throw new ConflictException(
        `Transição inválida: ${before.status} -> ${transition.to}.`,
      );
    }
    const now = new Date();
    const data: Prisma.TenantUpdateInput = {
      status: transition.to,
      ...(action === "activate"
        ? { activatedAt: now }
        : action === "suspend"
          ? { suspendedAt: now, suspensionReason: reason }
          : action === "reactivate"
            ? {
                activatedAt: now,
                suspendedAt: null,
                suspensionReason: null,
              }
            : action === "cancel"
              ? { cancelledAt: now, cancellationReason: reason }
              : { archivedAt: now }),
    };
    const after = await this.prisma.tenant.update({
      where: { id },
      data,
      select: TENANT_SUMMARY_SELECT,
    });
    await this.audit.record({
      platformUserId: actor.id,
      tenantId: id,
      entityType: "Tenant",
      entityId: id,
      action: `PLATFORM_TENANT_${action.toUpperCase()}`,
      reason,
      ...requestContext,
      before,
      after,
    });
    return after;
  }

  async extendTrial(
    id: string,
    days: number,
    reason: string,
    currentPassword: string,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    await this.assertReauthenticated(actor.id, currentPassword);
    const before = await this.prisma.tenant.findUnique({
      where: { id },
      select: TENANT_SUMMARY_SELECT,
    });
    if (!before) throw new NotFoundException("Tenant não encontrado.");
    if (before.status !== TenantStatus.TRIAL) {
      throw new ConflictException(
        "Somente tenants em TRIAL podem ter o teste prorrogado.",
      );
    }
    const base =
      before.trialEndsAt && before.trialEndsAt > new Date()
        ? before.trialEndsAt
        : new Date();
    const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    const after = await this.prisma.tenant.update({
      where: { id },
      data: { trialEndsAt },
      select: TENANT_SUMMARY_SELECT,
    });
    await this.audit.record({
      platformUserId: actor.id,
      tenantId: id,
      entityType: "Tenant",
      entityId: id,
      action: "PLATFORM_TENANT_TRIAL_EXTENDED",
      reason,
      ...requestContext,
      before,
      after,
    });
    return after;
  }

  async tenantMetrics(id: string, from?: string, to?: string) {
    await this.ensureTenant(id);
    const periodStart =
      toDate(from, "from") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const periodEnd = toDate(to, "to") ?? new Date();
    const wherePeriod = { gte: periodStart, lte: periodEnd };
    const [
      users,
      students,
      instructors,
      vehicles,
      units,
      lessons,
      exams,
      contracts,
      payments,
      overdue,
      lastAccess,
      failures,
      notifications,
    ] = await Promise.all([
      this.prisma.membership.count({ where: { tenantId: id, active: true } }),
      this.prisma.student.count({ where: { tenantId: id } }),
      this.prisma.instructor.count({ where: { tenantId: id } }),
      this.prisma.vehicle.count({ where: { tenantId: id } }),
      this.prisma.schoolUnit.count({ where: { tenantId: id } }),
      this.prisma.lesson.groupBy({
        by: ["status"],
        where: { tenantId: id, startsAt: wherePeriod },
        _count: true,
      }),
      this.prisma.exam.count({
        where: { tenantId: id, scheduledAt: wherePeriod },
      }),
      this.prisma.studentContract.count({
        where: { tenantId: id, createdAt: wherePeriod },
      }),
      this.prisma.payment.aggregate({
        where: {
          tenantId: id,
          status: PaymentStatus.CONFIRMED,
          receivedAt: wherePeriod,
        },
        _sum: { amountCents: true },
        _count: true,
      }),
      this.prisma.receivableInstallment.aggregate({
        where: {
          tenantId: id,
          status: "OVERDUE",
          dueDate: { lte: periodEnd },
        },
        _sum: { balanceCents: true },
        _count: true,
      }),
      this.prisma.user.aggregate({
        where: { memberships: { some: { tenantId: id, active: true } } },
        _max: { lastLoginAt: true },
      }),
      this.prisma.domainEvent.count({
        where: {
          tenantId: id,
          status: {
            in: [DomainEventStatus.FAILED, DomainEventStatus.DEAD_LETTER],
          },
          createdAt: wherePeriod,
        },
      }),
      this.prisma.notificationDelivery.groupBy({
        by: ["status"],
        where: { tenantId: id, createdAt: wherePeriod },
        _count: true,
      }),
    ]);
    return {
      tenantId: id,
      period: { from: periodStart, to: periodEnd },
      users,
      students,
      instructors,
      vehicles,
      units,
      lessons: Object.fromEntries(
        lessons.map((entry) => [entry.status, entry._count]),
      ),
      exams,
      contracts,
      receipts: {
        count: payments._count,
        amountCents: payments._sum.amountCents ?? 0,
      },
      delinquency: {
        count: overdue._count,
        amountCents: overdue._sum.balanceCents ?? 0,
      },
      storageBytes: null,
      lastAccessAt: lastAccess._max.lastLoginAt,
      recentFailures: failures,
      notifications: Object.fromEntries(
        notifications.map((entry) => [entry.status, entry._count]),
      ),
    };
  }

  async listUsers(query: UserListQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      platformRole: query.platformRole,
      active: query.active,
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          platformRole: true,
          mfaEnabled: true,
          lockedUntil: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { memberships: true, refreshSessions: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(data, total, query.page, query.pageSize);
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        platformRole: true,
        mfaEnabled: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            active: true,
            tenant: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        },
        refreshSessions: {
          select: {
            id: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    return user;
  }

  async setUserActive(
    id: string,
    active: boolean,
    reason: string,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
    currentPassword?: string,
  ) {
    if (!active) {
      if (!currentPassword) {
        throw new UnauthorizedException("Reautenticação obrigatória.");
      }
      await this.assertReauthenticated(actor.id, currentPassword);
    }
    const before = await this.getUser(id);
    if (!active && id === actor.id) {
      throw new ConflictException("Não é permitido desativar a si próprio.");
    }
    if (!active && before.platformRole === PlatformRole.PLATFORM_OWNER) {
      await this.assertNotLastOwner(id);
    }
    const after = await this.prisma.user.update({
      where: { id },
      data: {
        active,
        ...(active ? { failedLoginAttempts: 0, lockedUntil: null } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        platformRole: true,
      },
    });
    if (!active) await this.auth.revokeAllUserSessions(id);
    await this.audit.record({
      platformUserId: actor.id,
      entityType: "User",
      entityId: id,
      action: active ? "PLATFORM_USER_ENABLED" : "PLATFORM_USER_DISABLED",
      reason,
      ...requestContext,
      before,
      after,
    });
    return after;
  }

  async resetUserSessions(
    id: string,
    reason: string,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
    currentPassword: string,
  ) {
    await this.assertReauthenticated(actor.id, currentPassword);
    await this.ensureUser(id);
    await this.auth.revokeAllUserSessions(id);
    await this.audit.record({
      platformUserId: actor.id,
      entityType: "User",
      entityId: id,
      action: "PLATFORM_USER_SESSIONS_REVOKED",
      reason,
      ...requestContext,
    });
    return { revoked: true };
  }

  async changePlatformRole(
    id: string,
    input: ChangePlatformRoleDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    await this.assertReauthenticated(actor.id, input.currentPassword);
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, platformRole: true, active: true },
    });
    if (!target) throw new NotFoundException("Usuário não encontrado.");
    if (
      input.role === PlatformRole.PLATFORM_OWNER &&
      actor.platformRole !== PlatformRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException(
        "Somente PLATFORM_OWNER pode atribuir PLATFORM_OWNER.",
      );
    }
    if (
      actor.platformRole === PlatformRole.PLATFORM_ADMIN &&
      actor.id === id &&
      input.role !== target.platformRole
    ) {
      throw new ForbiddenException(
        "PLATFORM_ADMIN não pode alterar o próprio papel.",
      );
    }
    if (
      target.platformRole === PlatformRole.PLATFORM_OWNER &&
      input.role !== PlatformRole.PLATFORM_OWNER
    ) {
      await this.assertNotLastOwner(id);
    }
    const after = await this.prisma.user.update({
      where: { id },
      data: { platformRole: input.role },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        platformRole: true,
      },
    });
    await this.auth.revokeAllUserSessions(id);
    await this.audit.record({
      platformUserId: actor.id,
      entityType: "User",
      entityId: id,
      action: "PLATFORM_USER_ROLE_CHANGED",
      reason: input.reason,
      ...requestContext,
      before: target,
      after,
    });
    return after;
  }

  async startSupportSession(
    input: StartSupportSessionDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        settings: { select: { supportAccessEnabled: true } },
      },
    });
    if (!tenant) throw new NotFoundException("Tenant não encontrado.");
    if (
      tenant.status === TenantStatus.ARCHIVED ||
      tenant.settings?.supportAccessEnabled === false
    ) {
      throw new ForbiddenException("Acesso de suporte indisponível.");
    }
    const configured = await this.prisma.platformSetting.findUnique({
      where: { key: "support.maxDurationMinutes" },
    });
    const configuredMinutes =
      typeof configured?.value === "number" ? configured.value : 30;
    const duration = Math.min(
      input.durationMinutes ?? configuredMinutes,
      configuredMinutes,
      120,
    );
    const session = await this.prisma.supportSession.create({
      data: {
        platformUserId: actor.id,
        tenantId: tenant.id,
        reason: input.reason.trim(),
        ticketReference: input.ticketReference?.trim(),
        expiresAt: new Date(Date.now() + duration * 60 * 1000),
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
      },
      select: {
        id: true,
        tenantId: true,
        platformUserId: true,
        reason: true,
        ticketReference: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        tenant: { select: { name: true, slug: true } },
      },
    });
    await this.audit.record({
      platformUserId: actor.id,
      tenantId: tenant.id,
      supportSessionId: session.id,
      entityType: "SupportSession",
      entityId: session.id,
      action: "PLATFORM_SUPPORT_STARTED",
      reason: input.reason,
      ...requestContext,
      after: session,
    });
    return session;
  }

  async listSupportSessions(query: SupportSessionQueryDto) {
    const where: Prisma.SupportSessionWhereInput = {
      tenantId: query.tenantId,
      status: query.status,
    };
    const [data, total] = await Promise.all([
      this.prisma.supportSession.findMany({
        where,
        select: {
          id: true,
          reason: true,
          ticketReference: true,
          status: true,
          startedAt: true,
          expiresAt: true,
          endedAt: true,
          tenant: { select: { id: true, name: true, slug: true } },
          platformUser: {
            select: { id: true, name: true, email: true, platformRole: true },
          },
          endedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supportSession.count({ where }),
    ]);
    return pageResult(data, total, query.page, query.pageSize);
  }

  async getSupportSession(id: string) {
    const session = await this.prisma.supportSession.findUnique({
      where: { id },
      select: {
        id: true,
        reason: true,
        ticketReference: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        endedAt: true,
        ipAddress: true,
        userAgent: true,
        tenant: { select: { id: true, name: true, slug: true, status: true } },
        platformUser: {
          select: { id: true, name: true, email: true, platformRole: true },
        },
        endedBy: { select: { id: true, name: true } },
        auditLogs: {
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!session) {
      throw new NotFoundException("Sessão de suporte não encontrada.");
    }
    return session;
  }

  async closeSupportSession(
    id: string,
    status: "ENDED" | "REVOKED",
    input: EndSupportSessionDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    const before = await this.prisma.supportSession.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException("Sessão de suporte não encontrada.");
    }
    if (before.status !== SupportSessionStatus.ACTIVE) {
      throw new ConflictException("Sessão de suporte já finalizada.");
    }
    if (
      status === "ENDED" &&
      before.platformUserId !== actor.id &&
      actor.platformRole === PlatformRole.PLATFORM_SUPPORT
    ) {
      throw new ForbiddenException(
        "Suporte somente pode encerrar a própria sessão.",
      );
    }
    const after = await this.prisma.supportSession.update({
      where: { id },
      data: {
        status:
          status === "ENDED"
            ? SupportSessionStatus.ENDED
            : SupportSessionStatus.REVOKED,
        endedAt: new Date(),
        endedByUserId: actor.id,
      },
    });
    await this.audit.record({
      platformUserId: actor.id,
      tenantId: before.tenantId,
      supportSessionId: id,
      entityType: "SupportSession",
      entityId: id,
      action:
        status === "ENDED"
          ? "PLATFORM_SUPPORT_ENDED"
          : "PLATFORM_SUPPORT_REVOKED",
      reason: input.reason ?? before.reason,
      ...requestContext,
      before,
      after,
    });
    return after;
  }

  async supportContext(
    tenantId: string,
    actor: AuthenticatedPrincipal,
    supportSessionId: string,
    requestContext: RequestAuditContext,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        settings: true,
      },
    });
    if (!tenant) throw new NotFoundException("Tenant não encontrado.");
    await this.audit.record({
      platformUserId: actor.id,
      tenantId,
      supportSessionId,
      entityType: "Tenant",
      entityId: tenantId,
      action: "PLATFORM_SUPPORT_DATA_ACCESSED",
      ...requestContext,
    });
    return tenant;
  }

  async listPlans(query: PlanListQueryDto) {
    const where: Prisma.PlatformPlanWhereInput = { status: query.status };
    const [data, total] = await Promise.all([
      this.prisma.platformPlan.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          status: true,
          monthlyPriceCents: true,
          annualPriceCents: true,
          maxUsers: true,
          maxStudents: true,
          maxUnits: true,
          maxStorageBytes: true,
          features: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { subscriptions: true } },
        },
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.platformPlan.count({ where }),
    ]);
    return pageResult(
      data.map((plan) => ({
        ...plan,
        maxStorageBytes: plan.maxStorageBytes?.toString() ?? null,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async createPlan(
    input: CreatePlatformPlanDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    this.validateFeatures(input.features);
    try {
      const plan = await this.prisma.platformPlan.create({
        data: {
          ...input,
          code: input.code.trim().toUpperCase(),
          status: input.status ?? PlatformPlanStatus.DRAFT,
          maxStorageBytes: input.maxStorageBytes
            ? BigInt(input.maxStorageBytes)
            : undefined,
          features: input.features,
        },
      });
      await this.audit.record({
        platformUserId: actor.id,
        entityType: "PlatformPlan",
        entityId: plan.id,
        action: "PLATFORM_PLAN_CREATED",
        ...requestContext,
        after: plan,
      });
      return {
        ...plan,
        maxStorageBytes: plan.maxStorageBytes?.toString() ?? null,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Código de plano já utilizado.");
      }
      throw error;
    }
  }

  async updatePlan(
    id: string,
    input: UpdatePlatformPlanDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    if (input.features) this.validateFeatures(input.features);
    const before = await this.prisma.platformPlan.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException("Plano não encontrado.");
    const after = await this.prisma.platformPlan.update({
      where: { id },
      data: {
        ...input,
        maxStorageBytes:
          input.maxStorageBytes === undefined
            ? undefined
            : BigInt(input.maxStorageBytes),
        features: input.features,
      },
    });
    await this.audit.record({
      platformUserId: actor.id,
      entityType: "PlatformPlan",
      entityId: id,
      action: "PLATFORM_PLAN_UPDATED",
      ...requestContext,
      before,
      after,
    });
    return {
      ...after,
      maxStorageBytes: after.maxStorageBytes?.toString() ?? null,
    };
  }

  async listSubscriptions(query: SubscriptionListQueryDto) {
    const where: Prisma.TenantSubscriptionWhereInput = {
      tenantId: query.tenantId,
      status: query.status,
    };
    const [data, total] = await Promise.all([
      this.prisma.tenantSubscription.findMany({
        where,
        include: {
          tenant: {
            select: { id: true, name: true, slug: true, status: true },
          },
          plan: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tenantSubscription.count({ where }),
    ]);
    return pageResult(data, total, query.page, query.pageSize);
  }

  async createSubscription(
    input: CreateSubscriptionDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    await Promise.all([
      this.ensureTenant(input.tenantId),
      this.ensurePlan(input.planId),
    ]);
    const subscription = await this.prisma.tenantSubscription.create({
      data: {
        tenantId: input.tenantId,
        planId: input.planId,
        status: input.status,
        billingCycle: input.billingCycle,
        startsAt: toDate(input.startsAt, "startsAt") as Date,
        trialEndsAt: toDate(input.trialEndsAt, "trialEndsAt"),
        currentPeriodStartsAt: toDate(
          input.currentPeriodStartsAt,
          "currentPeriodStartsAt",
        ) as Date,
        currentPeriodEndsAt: toDate(
          input.currentPeriodEndsAt,
          "currentPeriodEndsAt",
        ) as Date,
      },
      include: { plan: true, tenant: true },
    });
    await this.prisma.tenant.update({
      where: { id: input.tenantId },
      data: { planCode: subscription.plan.code },
    });
    await this.audit.record({
      platformUserId: actor.id,
      tenantId: input.tenantId,
      entityType: "TenantSubscription",
      entityId: subscription.id,
      action: "PLATFORM_SUBSCRIPTION_CREATED",
      ...requestContext,
      after: subscription,
    });
    return subscription;
  }

  async updateSubscription(
    id: string,
    input: UpdateSubscriptionDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    const before = await this.prisma.tenantSubscription.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException("Assinatura não encontrada.");
    if (input.planId) await this.ensurePlan(input.planId);
    const after = await this.prisma.tenantSubscription.update({
      where: { id },
      data: {
        planId: input.planId,
        status: input.status,
        billingCycle: input.billingCycle,
        currentPeriodStartsAt: toDate(
          input.currentPeriodStartsAt,
          "currentPeriodStartsAt",
        ),
        currentPeriodEndsAt: toDate(
          input.currentPeriodEndsAt,
          "currentPeriodEndsAt",
        ),
        cancelledAt:
          input.status === TenantSubscriptionStatus.CANCELLED
            ? new Date()
            : undefined,
      },
      include: { plan: true },
    });
    if (input.planId) {
      await this.prisma.tenant.update({
        where: { id: before.tenantId },
        data: { planCode: after.plan.code },
      });
    }
    await this.audit.record({
      platformUserId: actor.id,
      tenantId: before.tenantId,
      entityType: "TenantSubscription",
      entityId: id,
      action: input.planId
        ? "PLATFORM_SUBSCRIPTION_PLAN_CHANGED"
        : "PLATFORM_SUBSCRIPTION_UPDATED",
      ...requestContext,
      before,
      after,
    });
    return after;
  }

  async listAudit(query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: query.tenantId,
      platformUserId: query.platformUserId,
      action: query.action
        ? { contains: query.action, mode: "insensitive" }
        : undefined,
      actorType: {
        in: [AuditActorType.PLATFORM_USER, AuditActorType.SUPPORT],
      },
    };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          entityType: true,
          entityId: true,
          action: true,
          actorType: true,
          platformUserId: true,
          supportSessionId: true,
          reason: true,
          ipAddress: true,
          before: true,
          after: true,
          createdAt: true,
          platformUser: {
            select: { id: true, name: true, email: true },
          },
          tenant: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return pageResult(data, total, query.page, query.pageSize);
  }

  async health() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        checkedAt: new Date(),
        services: {
          api: { status: "ok" },
          database: {
            status: "ok",
            latencyMs: Date.now() - startedAt,
          },
          storage: { status: "not_configured" },
          queue: { status: "not_configured" },
        },
      };
    } catch {
      return {
        status: "degraded",
        checkedAt: new Date(),
        services: {
          api: { status: "ok" },
          database: { status: "error" },
          storage: { status: "not_configured" },
          queue: { status: "not_configured" },
        },
      };
    }
  }

  listSettings() {
    return this.prisma.platformSetting.findMany({
      orderBy: { key: "asc" },
    });
  }

  async updateSettings(
    input: UpdateSettingsDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const updated = [];
      for (const setting of input.settings) {
        updated.push(
          await transaction.platformSetting.upsert({
            where: { key: setting.key },
            update: {
              value: setting.value as Prisma.InputJsonValue,
              description: setting.description,
              updatedById: actor.id,
            },
            create: {
              key: setting.key,
              value: setting.value as Prisma.InputJsonValue,
              description: setting.description,
              updatedById: actor.id,
            },
          }),
        );
      }
      await this.audit.record(
        {
          platformUserId: actor.id,
          entityType: "PlatformSetting",
          entityId: "global",
          action: "PLATFORM_SETTINGS_UPDATED",
          ...requestContext,
          after: updated,
        },
        transaction,
      );
      return updated;
    });
    return result;
  }

  entitlementUsage(tenantId: string) {
    return this.entitlements.getUsage(tenantId);
  }

  async featureEnabled(tenantId: string, feature: string) {
    if (!PLATFORM_FEATURES.includes(feature as PlatformFeature)) {
      throw new BadRequestException("Feature desconhecida.");
    }
    return {
      tenantId,
      feature,
      enabled: await this.entitlements.hasFeature(
        tenantId,
        feature as PlatformFeature,
      ),
    };
  }

  private async assertReauthenticated(
    userId: string,
    currentPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, active: true },
    });
    if (
      !user ||
      !user.active ||
      !(await compare(currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException(
        "Reautenticação obrigatória para esta ação.",
      );
    }
  }

  private async assertNotLastOwner(excludedUserId: string): Promise<void> {
    const owners = await this.prisma.user.count({
      where: {
        id: { not: excludedUserId },
        platformRole: PlatformRole.PLATFORM_OWNER,
        active: true,
      },
    });
    if (owners === 0) {
      throw new ConflictException(
        "Não é permitido remover o último PLATFORM_OWNER.",
      );
    }
  }

  private async ensureTenant(id: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException("Tenant não encontrado.");
  }

  private async ensureUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
  }

  private async ensurePlan(id: string): Promise<void> {
    const plan = await this.prisma.platformPlan.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException("Plano não encontrado.");
  }

  private validateFeatures(features: Record<string, boolean>): void {
    const invalid = Object.keys(features).filter(
      (feature) => !PLATFORM_FEATURES.includes(feature as PlatformFeature),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Features desconhecidas: ${invalid.join(", ")}.`,
      );
    }
  }
}
