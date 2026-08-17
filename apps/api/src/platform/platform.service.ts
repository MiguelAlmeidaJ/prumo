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
  isPrismaKnownRequestError,
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
} from "@prumo/database";
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
  SubscriptionActionDto,
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

const CONTRACT_VALUE_STATUSES: TenantSubscriptionStatus[] = [
  TenantSubscriptionStatus.TRIALING,
  TenantSubscriptionStatus.ACTIVE,
];

const CURRENT_SUBSCRIPTION_STATUSES: TenantSubscriptionStatus[] = [
  ...CONTRACT_VALUE_STATUSES,
  TenantSubscriptionStatus.SUSPENDED,
];

function billingCycleMonths(cycle: BillingCycle): number {
  switch (cycle) {
    case BillingCycle.QUARTERLY:
      return 3;
    case BillingCycle.SEMIANNUAL:
      return 6;
    case BillingCycle.ANNUAL:
      return 12;
    default:
      return 1;
  }
}

function periodEnd(startsAt: Date, cycle: BillingCycle): Date {
  const end = new Date(startsAt);
  end.setUTCMonth(end.getUTCMonth() + billingCycleMonths(cycle));
  return end;
}

function monthlyEquivalent(priceCents: number, cycle: BillingCycle): number {
  return Math.round(priceCents / billingCycleMonths(cycle));
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
              contractedPriceCents: plan.monthlyPriceCents,
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
        isPrismaKnownRequestError(error) &&
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
        isPrismaKnownRequestError(error) &&
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
    const where: Prisma.PlatformPlanWhereInput = {
      status: query.status,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { code: { contains: query.search, mode: "insensitive" } },
              {
                description: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };
    const [plans, total, activePlans, currentSubscriptions] = await Promise.all(
      [
        this.prisma.platformPlan.findMany({
          where,
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            status: true,
            featured: true,
            displayOrder: true,
            defaultBillingCycle: true,
            monthlyPriceCents: true,
            annualPriceCents: true,
            maxUsers: true,
            maxStudents: true,
            maxUnits: true,
            maxInstructors: true,
            maxVehicles: true,
            maxStorageBytes: true,
            features: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { subscriptions: true } },
            subscriptions: {
              where: { status: { in: CURRENT_SUBSCRIPTION_STATUSES } },
              select: { tenantId: true, status: true },
            },
          },
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.platformPlan.count({ where }),
        this.prisma.platformPlan.count({
          where: { status: PlatformPlanStatus.ACTIVE },
        }),
        this.prisma.tenantSubscription.findMany({
          where: { status: { in: CONTRACT_VALUE_STATUSES } },
          select: {
            tenantId: true,
            contractedPriceCents: true,
            billingCycle: true,
          },
        }),
      ],
    );
    const data = plans.map(({ subscriptions, _count, ...plan }) => ({
      ...plan,
      maxStorageBytes: plan.maxStorageBytes?.toString() ?? null,
      subscriberCount: new Set(subscriptions.map(({ tenantId }) => tenantId))
        .size,
      activeSubscriberCount: new Set(
        subscriptions
          .filter(({ status }) => CONTRACT_VALUE_STATUSES.includes(status))
          .map(({ tenantId }) => tenantId),
      ).size,
      historicalSubscriptionCount: _count.subscriptions,
    }));
    const contractedMonthlyValueCents = currentSubscriptions.reduce(
      (sum, subscription) =>
        sum +
        monthlyEquivalent(
          subscription.contractedPriceCents,
          subscription.billingCycle,
        ),
      0,
    );
    const subscribingTenants = new Set(
      currentSubscriptions.map(({ tenantId }) => tenantId),
    ).size;
    return {
      ...pageResult(data, total, query.page, query.pageSize),
      summary: {
        activePlans,
        subscribingTenants,
        contractedMonthlyValueCents,
        averageTicketCents:
          subscribingTenants > 0
            ? Math.round(contractedMonthlyValueCents / subscribingTenants)
            : 0,
      },
    };
  }

  async getPlan(id: string) {
    const plan = await this.prisma.platformPlan.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: { status: { in: CURRENT_SUBSCRIPTION_STATUSES } },
          select: { tenantId: true, status: true },
        },
      },
    });
    if (!plan) throw new NotFoundException("Plano não encontrado.");
    const { subscriptions, ...fields } = plan;
    return {
      ...fields,
      maxStorageBytes: plan.maxStorageBytes?.toString() ?? null,
      subscriberCount: new Set(subscriptions.map(({ tenantId }) => tenantId))
        .size,
      activeSubscriberCount: new Set(
        subscriptions
          .filter(({ status }) => CONTRACT_VALUE_STATUSES.includes(status))
          .map(({ tenantId }) => tenantId),
      ).size,
    };
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
          name: input.name.trim(),
          description: input.description?.trim(),
          status: input.status ?? PlatformPlanStatus.DRAFT,
          defaultBillingCycle:
            input.defaultBillingCycle ?? BillingCycle.MONTHLY,
          maxStorageBytes: input.maxStorageBytes
            ? BigInt(input.maxStorageBytes)
            : undefined,
          features: input.features,
        },
      });
      const response = {
        ...plan,
        maxStorageBytes: plan.maxStorageBytes?.toString() ?? null,
        subscriberCount: 0,
        activeSubscriberCount: 0,
      };
      await this.audit.record({
        platformUserId: actor.id,
        entityType: "PlatformPlan",
        entityId: plan.id,
        action: "PLATFORM_PLAN_CREATED",
        ...requestContext,
        after: response,
      });
      return response;
    } catch (error) {
      if (
        isPrismaKnownRequestError(error) &&
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
    const beforeSnapshot = {
      ...before,
      maxStorageBytes: before.maxStorageBytes?.toString() ?? null,
    };
    const after = await this.prisma.platformPlan.update({
      where: { id },
      data: {
        ...input,
        name: input.name?.trim(),
        description: input.description?.trim(),
        maxStorageBytes:
          input.maxStorageBytes === undefined
            ? undefined
            : input.maxStorageBytes === null
              ? null
              : BigInt(input.maxStorageBytes),
        features: input.features,
      },
    });
    const response = {
      ...after,
      maxStorageBytes: after.maxStorageBytes?.toString() ?? null,
    };
    await this.audit.record({
      platformUserId: actor.id,
      entityType: "PlatformPlan",
      entityId: id,
      action: "PLATFORM_PLAN_UPDATED",
      ...requestContext,
      before: beforeSnapshot,
      after: response,
    });
    return this.getPlan(id);
  }

  async listSubscriptions(query: SubscriptionListQueryDto) {
    const where: Prisma.TenantSubscriptionWhereInput = {
      tenantId: query.tenantId,
      planId: query.planId,
      status: query.status,
      billingCycle: query.billingCycle,
      ...(query.search
        ? {
            tenant: {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { slug: { contains: query.search, mode: "insensitive" } },
                { document: { contains: query.search } },
              ],
            },
          }
        : {}),
    };
    const [data, total, currentSubscriptions, groupedStatuses] =
      await Promise.all([
        this.prisma.tenantSubscription.findMany({
          where,
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                document: true,
                status: true,
              },
            },
            plan: {
              select: {
                id: true,
                code: true,
                name: true,
                status: true,
                monthlyPriceCents: true,
                annualPriceCents: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.tenantSubscription.count({ where }),
        this.prisma.tenantSubscription.findMany({
          where: { status: { in: CONTRACT_VALUE_STATUSES } },
          select: { contractedPriceCents: true, billingCycle: true },
        }),
        this.prisma.tenantSubscription.groupBy({
          by: ["status"],
          _count: true,
        }),
      ]);
    const statusCount = new Map(
      groupedStatuses.map(({ status, _count }) => [status, _count]),
    );
    return {
      ...pageResult(data, total, query.page, query.pageSize),
      summary: {
        activeSubscriptions:
          statusCount.get(TenantSubscriptionStatus.ACTIVE) ?? 0,
        trialingSubscriptions:
          statusCount.get(TenantSubscriptionStatus.TRIALING) ?? 0,
        suspendedSubscriptions:
          statusCount.get(TenantSubscriptionStatus.SUSPENDED) ?? 0,
        contractedMonthlyValueCents: currentSubscriptions.reduce(
          (sum, subscription) =>
            sum +
            monthlyEquivalent(
              subscription.contractedPriceCents,
              subscription.billingCycle,
            ),
          0,
        ),
      },
    };
  }

  async getSubscription(id: string) {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            document: true,
            status: true,
          },
        },
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            monthlyPriceCents: true,
            annualPriceCents: true,
            maxUsers: true,
            maxStudents: true,
            maxUnits: true,
            maxInstructors: true,
            maxVehicles: true,
          },
        },
      },
    });
    if (!subscription) {
      throw new NotFoundException("Assinatura não encontrada.");
    }
    const [units, users, instructors, activeStudents, history] =
      await Promise.all([
        this.prisma.schoolUnit.count({
          where: { tenantId: subscription.tenantId, active: true },
        }),
        this.prisma.membership.count({
          where: { tenantId: subscription.tenantId, active: true },
        }),
        this.prisma.instructor.count({
          where: { tenantId: subscription.tenantId, status: "ACTIVE" },
        }),
        this.prisma.student.count({
          where: { tenantId: subscription.tenantId, status: "ACTIVE" },
        }),
        this.prisma.auditLog.findMany({
          where: { entityType: "TenantSubscription", entityId: id },
          select: {
            id: true,
            action: true,
            reason: true,
            before: true,
            after: true,
            createdAt: true,
            platformUser: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);
    return {
      ...subscription,
      usage: { units, users, instructors, activeStudents },
      history,
    };
  }

  async createSubscription(
    input: CreateSubscriptionDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    const [tenant, plan, existing] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: input.tenantId } }),
      this.prisma.platformPlan.findUnique({ where: { id: input.planId } }),
      this.prisma.tenantSubscription.findFirst({
        where: {
          tenantId: input.tenantId,
          status: {
            in: [
              TenantSubscriptionStatus.DRAFT,
              ...CURRENT_SUBSCRIPTION_STATUSES,
            ],
          },
        },
      }),
    ]);
    if (!tenant) throw new NotFoundException("Autoescola não encontrada.");
    if (!plan) throw new NotFoundException("Plano não encontrado.");
    if (plan.status !== PlatformPlanStatus.ACTIVE) {
      throw new ConflictException(
        "Somente planos ativos podem receber novas assinaturas.",
      );
    }
    if (existing) {
      throw new ConflictException(
        "A autoescola já possui uma assinatura em aberto.",
      );
    }
    const startsAt = toDate(input.startsAt, "startsAt") as Date;
    const endsAt = toDate(input.endsAt, "endsAt");
    if (endsAt && endsAt < startsAt) {
      throw new BadRequestException(
        "A data final deve ser posterior à data de início.",
      );
    }
    const currentPeriodStartsAt =
      toDate(input.currentPeriodStartsAt, "currentPeriodStartsAt") ?? startsAt;
    const currentPeriodEndsAt =
      toDate(input.currentPeriodEndsAt, "currentPeriodEndsAt") ??
      periodEnd(currentPeriodStartsAt, input.billingCycle);
    return this.prisma.$transaction(async (transaction) => {
      const subscription = await transaction.tenantSubscription.create({
        data: {
          tenantId: input.tenantId,
          planId: input.planId,
          status: input.status ?? TenantSubscriptionStatus.DRAFT,
          billingCycle: input.billingCycle,
          contractedPriceCents: input.contractedPriceCents,
          startsAt,
          endsAt,
          trialEndsAt: toDate(input.trialEndsAt, "trialEndsAt"),
          currentPeriodStartsAt,
          currentPeriodEndsAt,
          contractNumber: input.contractNumber?.trim(),
          notes: input.notes?.trim(),
        },
        include: { plan: true, tenant: true },
      });
      await transaction.tenant.update({
        where: { id: input.tenantId },
        data: { planCode: subscription.plan.code },
      });
      await this.audit.record(
        {
          platformUserId: actor.id,
          tenantId: input.tenantId,
          entityType: "TenantSubscription",
          entityId: subscription.id,
          action: "PLATFORM_SUBSCRIPTION_CREATED",
          ...requestContext,
          after: subscription,
        },
        transaction,
      );
      return subscription;
    });
  }

  async updateSubscription(
    id: string,
    input: UpdateSubscriptionDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    const before = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!before) throw new NotFoundException("Assinatura não encontrada.");
    if (input.planId && input.planId !== before.planId) {
      const plan = await this.prisma.platformPlan.findUnique({
        where: { id: input.planId },
      });
      if (!plan) throw new NotFoundException("Plano não encontrado.");
      if (plan.status !== PlatformPlanStatus.ACTIVE) {
        throw new ConflictException("O novo plano precisa estar ativo.");
      }
      if (input.contractedPriceCents === undefined) {
        throw new BadRequestException(
          "Informe o novo valor contratado ao alterar o plano.",
        );
      }
    }
    const startsAt = toDate(input.startsAt, "startsAt");
    const endsAt = toDate(input.endsAt ?? undefined, "endsAt");
    const effectiveStart = startsAt ?? before.startsAt;
    if (endsAt && endsAt < effectiveStart) {
      throw new BadRequestException(
        "A data final deve ser posterior à data de início.",
      );
    }
    const requestedEndsAt = input.endsAt === null ? null : endsAt;
    const termChanged =
      input.endsAt !== undefined &&
      (before.endsAt?.getTime() ?? null) !==
        (requestedEndsAt?.getTime() ?? null);
    const effectivePeriodStart =
      toDate(input.currentPeriodStartsAt, "currentPeriodStartsAt") ??
      startsAt ??
      before.currentPeriodStartsAt;
    const effectiveCycle = input.billingCycle ?? before.billingCycle;
    const effectivePeriodEnd =
      toDate(input.currentPeriodEndsAt, "currentPeriodEndsAt") ??
      (input.billingCycle || startsAt
        ? periodEnd(effectivePeriodStart, effectiveCycle)
        : undefined);
    const action =
      input.planId && input.planId !== before.planId
        ? "PLATFORM_SUBSCRIPTION_PLAN_CHANGED"
        : input.contractedPriceCents !== undefined &&
            input.contractedPriceCents !== before.contractedPriceCents
          ? "PLATFORM_SUBSCRIPTION_PRICE_CHANGED"
          : termChanged
            ? "PLATFORM_SUBSCRIPTION_TERM_CHANGED"
            : "PLATFORM_SUBSCRIPTION_UPDATED";
    return this.prisma.$transaction(async (transaction) => {
      const after = await transaction.tenantSubscription.update({
        where: { id },
        data: {
          planId: input.planId,
          status: input.status,
          billingCycle: input.billingCycle,
          contractedPriceCents: input.contractedPriceCents,
          startsAt,
          endsAt: input.endsAt === null ? null : endsAt,
          currentPeriodStartsAt:
            input.currentPeriodStartsAt || startsAt
              ? effectivePeriodStart
              : undefined,
          currentPeriodEndsAt: effectivePeriodEnd,
          contractNumber:
            input.contractNumber === null ? null : input.contractNumber?.trim(),
          notes: input.notes === null ? null : input.notes?.trim(),
          cancelledAt:
            input.status === TenantSubscriptionStatus.CANCELLED
              ? new Date()
              : undefined,
        },
        include: { plan: true, tenant: true },
      });
      if (input.planId && input.planId !== before.planId) {
        await transaction.tenant.update({
          where: { id: before.tenantId },
          data: { planCode: after.plan.code },
        });
      }
      await this.audit.record(
        {
          platformUserId: actor.id,
          tenantId: before.tenantId,
          entityType: "TenantSubscription",
          entityId: id,
          action,
          ...requestContext,
          before,
          after,
        },
        transaction,
      );
      return after;
    });
  }

  async changeSubscriptionStatus(
    id: string,
    action: "suspend" | "reactivate" | "cancel",
    input: SubscriptionActionDto,
    actor: AuthenticatedPrincipal,
    requestContext: RequestAuditContext,
  ) {
    const before = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: { plan: true, tenant: true },
    });
    if (!before) throw new NotFoundException("Assinatura não encontrada.");
    const transitions = {
      suspend: {
        from: [
          TenantSubscriptionStatus.ACTIVE,
          TenantSubscriptionStatus.TRIALING,
        ],
        to: TenantSubscriptionStatus.SUSPENDED,
        audit: "PLATFORM_SUBSCRIPTION_SUSPENDED",
      },
      reactivate: {
        from: [TenantSubscriptionStatus.SUSPENDED],
        to: TenantSubscriptionStatus.ACTIVE,
        audit: "PLATFORM_SUBSCRIPTION_REACTIVATED",
      },
      cancel: {
        from: [
          TenantSubscriptionStatus.DRAFT,
          TenantSubscriptionStatus.TRIALING,
          TenantSubscriptionStatus.ACTIVE,
          TenantSubscriptionStatus.SUSPENDED,
        ],
        to: TenantSubscriptionStatus.CANCELLED,
        audit: "PLATFORM_SUBSCRIPTION_CANCELLED",
      },
    } satisfies Record<
      typeof action,
      {
        from: TenantSubscriptionStatus[];
        to: TenantSubscriptionStatus;
        audit: string;
      }
    >;
    const transition = transitions[action];
    if (
      !(transition.from as TenantSubscriptionStatus[]).includes(before.status)
    ) {
      throw new ConflictException(
        "O status atual não permite executar esta ação.",
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      const after = await transaction.tenantSubscription.update({
        where: { id },
        data: {
          status: transition.to,
          cancelledAt: action === "cancel" ? new Date() : undefined,
        },
        include: { plan: true, tenant: true },
      });
      await this.audit.record(
        {
          platformUserId: actor.id,
          tenantId: before.tenantId,
          entityType: "TenantSubscription",
          entityId: id,
          action: transition.audit,
          reason: input.reason,
          ...requestContext,
          before,
          after,
        },
        transaction,
      );
      return after;
    });
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
