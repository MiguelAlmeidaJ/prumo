import type { AuthResponse } from "@prumo/contracts";
import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  MembershipRole,
  PlatformPlanStatus,
  PlatformRole,
  SupportSessionStatus,
  TenantStatus,
} from "@prumo/database";
import { hash } from "bcrypt";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const PASSWORD = "SenhaPlatform@123";
const EMAILS = {
  common: "platform-common-e2e@prumo.local",
  support: "platform-support-e2e@prumo.local",
  admin: "platform-admin-e2e@prumo.local",
  owner: "platform-owner-e2e@prumo.local",
  tenantOwner: "tenant-owner-platform-e2e@prumo.local",
};
const BASE_SLUG = "platform-e2e-base";
const FOREIGN_SLUG = "platform-e2e-foreign";
const PROVISIONED_SLUG = "platform-e2e-provisioned";
const PLAN_CODE = "E2E_PLATFORM";
const COMMERCIAL_PLAN_CODES = ["E2E_COMMERCIAL", "E2E_COMMERCIAL_PLUS"];

describe.sequential("Platform console (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let baseTenantId: string;
  let foreignTenantId: string;
  let commonUserId: string;
  let ownerUserId: string;
  let seededOwnerOriginalRole: PlatformRole | null = null;
  let provisionedTenantId: string | null = null;
  let commercialPlanId: string;
  let commercialPlusPlanId: string;
  let commercialSubscriptionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const staleUsers = await prisma.user.findMany({
      where: { email: { in: Object.values(EMAILS) } },
      select: { id: true },
    });
    const staleIds = staleUsers.map(({ id }) => id);
    if (staleIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { platformUserId: { in: staleIds } },
            { actorUserId: { in: staleIds } },
          ],
        },
      });
      await prisma.supportSession.deleteMany({
        where: {
          OR: [
            { platformUserId: { in: staleIds } },
            { endedByUserId: { in: staleIds } },
          ],
        },
      });
      await prisma.user.deleteMany({ where: { id: { in: staleIds } } });
    }
    await prisma.tenant.deleteMany({
      where: {
        slug: {
          in: [BASE_SLUG, FOREIGN_SLUG, PROVISIONED_SLUG],
        },
      },
    });
    await prisma.platformPlan.deleteMany({
      where: { code: { in: [PLAN_CODE, ...COMMERCIAL_PLAN_CODES] } },
    });

    const [base, foreign, plan] = await Promise.all([
      prisma.tenant.create({
        data: {
          name: "Platform E2E Base",
          slug: BASE_SLUG,
          status: TenantStatus.ACTIVE,
          settings: { create: {} },
          financialSettings: { create: {} },
        },
      }),
      prisma.tenant.create({
        data: {
          name: "Platform E2E Foreign",
          slug: FOREIGN_SLUG,
          status: TenantStatus.ACTIVE,
          settings: { create: {} },
          financialSettings: { create: {} },
        },
      }),
      prisma.platformPlan.create({
        data: {
          code: PLAN_CODE,
          name: "Plano E2E",
          status: PlatformPlanStatus.ACTIVE,
          monthlyPriceCents: 10000,
          maxUsers: 2,
          maxStudents: 2,
          maxUnits: 1,
          features: {
            FINANCIAL: true,
            MOBILE_APP: false,
          },
        },
      }),
    ]);
    baseTenantId = base.id;
    foreignTenantId = foreign.id;
    const passwordHash = await hash(PASSWORD, 10);
    const [common, , , owner] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Comum E2E",
          email: EMAILS.common,
          passwordHash,
          memberships: {
            create: {
              tenantId: base.id,
              role: MembershipRole.TENANT_OWNER,
            },
          },
        },
      }),
      prisma.user.create({
        data: {
          name: "Suporte E2E",
          email: EMAILS.support,
          passwordHash,
          platformRole: PlatformRole.PLATFORM_SUPPORT,
        },
      }),
      prisma.user.create({
        data: {
          name: "Admin E2E",
          email: EMAILS.admin,
          passwordHash,
          platformRole: PlatformRole.PLATFORM_ADMIN,
        },
      }),
      prisma.user.create({
        data: {
          name: "Owner E2E",
          email: EMAILS.owner,
          passwordHash,
          platformRole: PlatformRole.PLATFORM_OWNER,
        },
      }),
    ]);
    commonUserId = common.id;
    ownerUserId = owner.id;

    await prisma.tenantSubscription.create({
      data: {
        tenantId: base.id,
        planId: plan.id,
        status: "ACTIVE",
        billingCycle: "MANUAL",
        contractedPriceCents: plan.monthlyPriceCents,
        startsAt: new Date(),
        currentPeriodStartsAt: new Date(),
        currentPeriodEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }, 40_000);

  afterAll(async () => {
    if (!prisma) return;
    if (seededOwnerOriginalRole) {
      await prisma.user.updateMany({
        where: { email: "platform@prumo.local" },
        data: { platformRole: seededOwnerOriginalRole },
      });
    }
    const users = await prisma.user.findMany({
      where: { email: { in: Object.values(EMAILS) } },
      select: { id: true },
    });
    const ids = users.map(({ id }) => id);
    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ platformUserId: { in: ids } }, { actorUserId: { in: ids } }],
        },
      });
      await prisma.supportSession.deleteMany({
        where: {
          OR: [{ platformUserId: { in: ids } }, { endedByUserId: { in: ids } }],
        },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.tenant.deleteMany({
      where: {
        slug: {
          in: [BASE_SLUG, FOREIGN_SLUG, PROVISIONED_SLUG],
        },
      },
    });
    await prisma.platformPlan.deleteMany({
      where: { code: { in: [PLAN_CODE, ...COMMERCIAL_PLAN_CODES] } },
    });
    await app.close();
  });

  async function login(email: string): Promise<AuthResponse> {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD })
      .expect(HttpStatus.OK);
    return response.body as AuthResponse;
  }

  it("bloqueia usuário comum e não permite bypass dos módulos tenant", async () => {
    const common = await login(EMAILS.common);
    await request(app.getHttpServer())
      .get("/api/platform/dashboard")
      .set("Authorization", `Bearer ${common.accessToken}`)
      .expect(HttpStatus.FORBIDDEN);
    await request(app.getHttpServer())
      .get("/api/platform/plans")
      .set("Authorization", `Bearer ${common.accessToken}`)
      .expect(HttpStatus.FORBIDDEN);

    const admin = await login(EMAILS.admin);
    await request(app.getHttpServer())
      .get("/api/students")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it("restringe PLATFORM_SUPPORT e permite PLATFORM_ADMIN listar tenants", async () => {
    const support = await login(EMAILS.support);
    await request(app.getHttpServer())
      .post("/api/platform/tenants")
      .set("Authorization", `Bearer ${support.accessToken}`)
      .send({ name: "Negado", slug: "platform-negado" })
      .expect(HttpStatus.FORBIDDEN);

    const admin = await login(EMAILS.admin);
    const response = await request(app.getHttpServer())
      .get("/api/platform/tenants")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(HttpStatus.OK);
    const list = response.body as { data: Array<{ id: string }> };
    expect(list.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: baseTenantId })]),
    );
  });

  it("provisiona tenant de forma idempotente com defaults e owner", async () => {
    const admin = await login(EMAILS.admin);
    const body = {
      name: "Platform E2E Provisioned",
      slug: PROVISIONED_SLUG,
      planCode: PLAN_CODE,
      provisioningKey: "platform-e2e-key",
      owner: {
        name: "Owner Tenant E2E",
        email: EMAILS.tenantOwner,
        password: "OwnerTenant@123",
      },
    };
    const first = await request(app.getHttpServer())
      .post("/api/platform/tenants")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(body)
      .expect(HttpStatus.CREATED);
    const firstBody = first.body as { id: string };
    provisionedTenantId = firstBody.id;
    const replay = await request(app.getHttpServer())
      .post("/api/platform/tenants")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send(body)
      .expect(HttpStatus.CREATED);
    expect(replay.body).toMatchObject({
      id: provisionedTenantId,
      idempotentReplay: true,
    });
    const stored = await prisma.tenant.findUniqueOrThrow({
      where: { id: provisionedTenantId },
      include: {
        settings: true,
        financialSettings: true,
        notificationTemplates: true,
        reminderRules: true,
        memberships: true,
        subscriptions: true,
      },
    });
    expect(stored.settings).toBeTruthy();
    expect(stored.financialSettings).toBeTruthy();
    expect(stored.notificationTemplates).toHaveLength(1);
    expect(stored.reminderRules).toHaveLength(1);
    expect(stored.memberships[0]?.role).toBe(MembershipRole.TENANT_OWNER);
    expect(stored.subscriptions).toHaveLength(1);
  });

  it("impede transição inválida e preserva dados ao suspender, cancelar e arquivar", async () => {
    const admin = await login(EMAILS.admin);
    const auth = { Authorization: `Bearer ${admin.accessToken}` };
    const critical = {
      reason: "Validação automatizada do ciclo de vida.",
      currentPassword: PASSWORD,
    };
    await request(app.getHttpServer())
      .post(`/api/platform/tenants/${baseTenantId}/archive`)
      .set(auth)
      .send(critical)
      .expect(HttpStatus.CONFLICT);
    await request(app.getHttpServer())
      .post(`/api/platform/tenants/${baseTenantId}/suspend`)
      .set(auth)
      .send(critical)
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAILS.common, password: PASSWORD })
      .expect(HttpStatus.FORBIDDEN);
    await request(app.getHttpServer())
      .post(`/api/platform/tenants/${baseTenantId}/cancel`)
      .set(auth)
      .send(critical)
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/platform/tenants/${baseTenantId}/archive`)
      .set(auth)
      .send(critical)
      .expect(HttpStatus.CREATED);
    expect(
      await prisma.membership.count({
        where: { tenantId: baseTenantId, userId: commonUserId },
      }),
    ).toBe(1);
  });

  it("retorna métricas agregadas sem PII", async () => {
    const admin = await login(EMAILS.admin);
    const response = await request(app.getHttpServer())
      .get(`/api/platform/tenants/${foreignTenantId}/metrics`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(HttpStatus.OK);
    const metrics = response.body as {
      tenantId: string;
      students: number;
      receipts: { amountCents: number };
    };
    expect(metrics.tenantId).toBe(foreignTenantId);
    expect(typeof metrics.students).toBe("number");
    expect(typeof metrics.receipts.amountCents).toBe("number");
    expect(JSON.stringify(metrics)).not.toContain("cpf");
    expect(JSON.stringify(metrics)).not.toContain("passwordHash");
  });

  it("protege atribuição e remoção do último PLATFORM_OWNER", async () => {
    const seeded = await prisma.user.findUnique({
      where: { email: "platform@prumo.local" },
      select: { platformRole: true },
    });
    seededOwnerOriginalRole = seeded?.platformRole ?? null;
    await prisma.user.updateMany({
      where: {
        email: "platform@prumo.local",
      },
      data: { platformRole: PlatformRole.USER },
    });
    const owner = await login(EMAILS.owner);
    await request(app.getHttpServer())
      .patch(`/api/platform/users/${ownerUserId}/platform-role`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        role: PlatformRole.PLATFORM_ADMIN,
        reason: "Tentativa de remover o último owner.",
        currentPassword: PASSWORD,
      })
      .expect(HttpStatus.CONFLICT);
    await prisma.user.updateMany({
      where: { email: "platform@prumo.local" },
      data: {
        platformRole: seededOwnerOriginalRole ?? PlatformRole.PLATFORM_OWNER,
      },
    });
    seededOwnerOriginalRole = null;
  });

  it("valida tenant, expiração e auditoria da sessão de suporte", async () => {
    const support = await login(EMAILS.support);
    const created = await request(app.getHttpServer())
      .post("/api/platform/support-sessions")
      .set("Authorization", `Bearer ${support.accessToken}`)
      .send({
        tenantId: foreignTenantId,
        reason: "Investigação do ticket E2E.",
        ticketReference: "E2E-42",
        durationMinutes: 5,
      })
      .expect(HttpStatus.CREATED);
    const sessionId = (created.body as { id: string }).id;

    await request(app.getHttpServer())
      .get(`/api/platform/tenants/${baseTenantId}/support-context`)
      .set("Authorization", `Bearer ${support.accessToken}`)
      .set("x-support-session-id", sessionId)
      .expect(HttpStatus.FORBIDDEN);
    await request(app.getHttpServer())
      .get(`/api/platform/tenants/${foreignTenantId}/support-context`)
      .set("Authorization", `Bearer ${support.accessToken}`)
      .set("x-support-session-id", sessionId)
      .expect(HttpStatus.OK);
    expect(
      await prisma.auditLog.count({
        where: {
          supportSessionId: sessionId,
          action: "PLATFORM_SUPPORT_DATA_ACCESSED",
        },
      }),
    ).toBe(1);

    await prisma.supportSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .get(`/api/platform/tenants/${foreignTenantId}/support-context`)
      .set("Authorization", `Bearer ${support.accessToken}`)
      .set("x-support-session-id", sessionId)
      .expect(HttpStatus.FORBIDDEN);
    const expired = await prisma.supportSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(expired.status).toBe(SupportSessionStatus.EXPIRED);
  });

  it("expõe limites e feature flags do plano", async () => {
    const admin = await login(EMAILS.admin);
    const auth = `Bearer ${admin.accessToken}`;
    const [usage, feature] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/platform/tenants/${baseTenantId}/entitlements`)
        .set("Authorization", auth)
        .expect(HttpStatus.OK),
      request(app.getHttpServer())
        .get(`/api/platform/tenants/${baseTenantId}/features/FINANCIAL`)
        .set("Authorization", auth)
        .expect(HttpStatus.OK),
    ]);
    const usageBody = usage.body as {
      resources: { users: { limit: number | null } };
    };
    expect(usageBody.resources.users.limit).toBe(2);
    expect(feature.body as Record<string, unknown>).toMatchObject({
      feature: "FINANCIAL",
      enabled: true,
    });
  });

  it("restringe planos e assinaturas ao PLATFORM_OWNER", async () => {
    const [support, admin, owner] = await Promise.all([
      login(EMAILS.support),
      login(EMAILS.admin),
      login(EMAILS.owner),
    ]);
    for (const token of [support.accessToken, admin.accessToken]) {
      await request(app.getHttpServer())
        .get("/api/platform/plans")
        .set("Authorization", `Bearer ${token}`)
        .expect(HttpStatus.FORBIDDEN);
      await request(app.getHttpServer())
        .get("/api/platform/subscriptions")
        .set("Authorization", `Bearer ${token}`)
        .expect(HttpStatus.FORBIDDEN);
    }

    const response = await request(app.getHttpServer())
      .post("/api/platform/plans")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        code: COMMERCIAL_PLAN_CODES[0],
        name: "Prumo Comercial E2E",
        description: "Plano criado para validar o catálogo comercial.",
        status: "ACTIVE",
        featured: true,
        displayOrder: 1,
        defaultBillingCycle: "MONTHLY",
        monthlyPriceCents: 44_900,
        annualPriceCents: 480_000,
        maxUsers: 10,
        maxStudents: 500,
        maxUnits: 5,
        maxInstructors: 30,
        maxVehicles: 20,
        features: {
          STUDENT_MANAGEMENT: true,
          ENROLLMENTS: true,
          SCHEDULE: true,
          FINANCIAL: true,
        },
      })
      .expect(HttpStatus.CREATED);
    commercialPlanId = (response.body as { id: string }).id;

    const plan = await prisma.platformPlan.findUniqueOrThrow({
      where: { id: commercialPlanId },
    });
    expect(plan).toMatchObject({
      featured: true,
      monthlyPriceCents: 44_900,
      maxInstructors: 30,
      maxVehicles: 20,
    });
  });

  it("cria assinatura amigável e preserva o valor contratado", async () => {
    const owner = await login(EMAILS.owner);
    const auth = `Bearer ${owner.accessToken}`;
    const startsAt = "2026-08-01T00:00:00.000Z";
    const response = await request(app.getHttpServer())
      .post("/api/platform/subscriptions")
      .set("Authorization", auth)
      .send({
        tenantId: foreignTenantId,
        planId: commercialPlanId,
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        contractedPriceCents: 39_900,
        startsAt,
        contractNumber: "E2E-2026-001",
        notes: "Condição comercial negociada.",
      })
      .expect(HttpStatus.CREATED);
    commercialSubscriptionId = (response.body as { id: string }).id;

    await request(app.getHttpServer())
      .patch(`/api/platform/plans/${commercialPlanId}`)
      .set("Authorization", auth)
      .send({ monthlyPriceCents: 59_900, description: "Plano editado." })
      .expect(HttpStatus.OK);

    const stored = await prisma.tenantSubscription.findUniqueOrThrow({
      where: { id: commercialSubscriptionId },
    });
    expect(stored.contractedPriceCents).toBe(39_900);

    const filtered = await request(app.getHttpServer())
      .get("/api/platform/subscriptions")
      .query({
        search: "Foreign",
        planId: commercialPlanId,
        status: "ACTIVE",
        billingCycle: "MONTHLY",
      })
      .set("Authorization", auth)
      .expect(HttpStatus.OK);
    expect(
      (filtered.body as { data: Array<{ id: string }> }).data.map(
        ({ id }) => id,
      ),
    ).toContain(commercialSubscriptionId);
  });

  it("altera plano e valor sem perder o histórico anterior", async () => {
    const owner = await login(EMAILS.owner);
    const auth = `Bearer ${owner.accessToken}`;
    const createdPlan = await request(app.getHttpServer())
      .post("/api/platform/plans")
      .set("Authorization", auth)
      .send({
        code: COMMERCIAL_PLAN_CODES[1],
        name: "Prumo Comercial Plus E2E",
        status: "ACTIVE",
        monthlyPriceCents: 69_900,
        features: { ADVANCED_REPORTS: true, MULTI_UNIT: true },
      })
      .expect(HttpStatus.CREATED);
    commercialPlusPlanId = (createdPlan.body as { id: string }).id;

    await request(app.getHttpServer())
      .patch(`/api/platform/subscriptions/${commercialSubscriptionId}`)
      .set("Authorization", auth)
      .send({
        planId: commercialPlusPlanId,
        contractedPriceCents: 62_900,
        billingCycle: "MONTHLY",
        endsAt: "2027-07-31T23:59:59.999Z",
      })
      .expect(HttpStatus.OK);

    const detail = await request(app.getHttpServer())
      .get(`/api/platform/subscriptions/${commercialSubscriptionId}`)
      .set("Authorization", auth)
      .expect(HttpStatus.OK);
    const body = detail.body as {
      plan: { id: string };
      contractedPriceCents: number;
      history: Array<{ action: string; before: unknown; after: unknown }>;
    };
    expect(body.plan.id).toBe(commercialPlusPlanId);
    expect(body.contractedPriceCents).toBe(62_900);
    const planChange = body.history.find(
      ({ action }) => action === "PLATFORM_SUBSCRIPTION_PLAN_CHANGED",
    );
    expect(planChange?.before).toMatchObject({ planId: commercialPlanId });
    expect(planChange?.after).toMatchObject({ planId: commercialPlusPlanId });
    expect(
      body.history.some(
        ({ action }) => action === "PLATFORM_SUBSCRIPTION_CREATED",
      ),
    ).toBe(true);
  });

  it("desativa plano sem alterar o contrato e controla o ciclo da assinatura", async () => {
    const owner = await login(EMAILS.owner);
    const auth = `Bearer ${owner.accessToken}`;
    await request(app.getHttpServer())
      .patch(`/api/platform/plans/${commercialPlusPlanId}`)
      .set("Authorization", auth)
      .send({ status: "INACTIVE" })
      .expect(HttpStatus.OK);

    const beforeActions = await prisma.tenantSubscription.findUniqueOrThrow({
      where: { id: commercialSubscriptionId },
    });
    expect(beforeActions).toMatchObject({
      status: "ACTIVE",
      contractedPriceCents: 62_900,
    });

    await request(app.getHttpServer())
      .post(`/api/platform/subscriptions/${commercialSubscriptionId}/suspend`)
      .set("Authorization", auth)
      .send({ reason: "Pausa comercial solicitada." })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(
        `/api/platform/subscriptions/${commercialSubscriptionId}/reactivate`,
      )
      .set("Authorization", auth)
      .send({ reason: "Contrato retomado." })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/platform/subscriptions/${commercialSubscriptionId}/cancel`)
      .set("Authorization", auth)
      .send({ reason: "Encerramento contratual confirmado." })
      .expect(HttpStatus.CREATED);

    const cancelled = await prisma.tenantSubscription.findUniqueOrThrow({
      where: { id: commercialSubscriptionId },
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).toBeTruthy();
    const actions = await prisma.auditLog.findMany({
      where: {
        entityType: "TenantSubscription",
        entityId: commercialSubscriptionId,
      },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "PLATFORM_SUBSCRIPTION_SUSPENDED",
        "PLATFORM_SUBSCRIPTION_REACTIVATED",
        "PLATFORM_SUBSCRIPTION_CANCELLED",
      ]),
    );
  });

  it("omite hashes, tokens e segredos da gestão de usuários", async () => {
    const admin = await login(EMAILS.admin);
    const response = await request(app.getHttpServer())
      .get(`/api/platform/users/${commonUserId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(HttpStatus.OK);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("refreshToken");
  });
});
