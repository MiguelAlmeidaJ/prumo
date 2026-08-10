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
} from "@prisma/client";
import { hash } from "bcrypt";
import type { Server } from "node:http";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
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

describe.sequential("Platform console (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let baseTenantId: string;
  let foreignTenantId: string;
  let commonUserId: string;
  let ownerUserId: string;
  let seededOwnerOriginalRole: PlatformRole | null = null;
  let provisionedTenantId: string | null = null;

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
    await prisma.platformPlan.deleteMany({ where: { code: PLAN_CODE } });

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
        startsAt: new Date(),
        currentPeriodStartsAt: new Date(),
        currentPeriodEndsAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ),
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
          OR: [
            { platformUserId: { in: ids } },
            { actorUserId: { in: ids } },
          ],
        },
      });
      await prisma.supportSession.deleteMany({
        where: {
          OR: [
            { platformUserId: { in: ids } },
            { endedByUserId: { in: ids } },
          ],
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
    await prisma.platformPlan.deleteMany({ where: { code: PLAN_CODE } });
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
      expect.arrayContaining([
        expect.objectContaining({ id: baseTenantId }),
      ]),
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
    expect(stored.memberships[0]?.role).toBe(
      MembershipRole.TENANT_OWNER,
    );
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
        platformRole:
          seededOwnerOriginalRole ?? PlatformRole.PLATFORM_OWNER,
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
