import type { AuthResponse } from "@prumo/contracts";
import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { MembershipRole, TenantStatus } from "@prisma/client";
import { hash } from "bcrypt";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import type { AccessTokenPayload } from "../src/auth/auth.types";
import { PrismaService } from "../src/database/prisma.service";

const TEST_EMAIL = "auth-e2e@prumo.local";
const INACTIVE_EMAIL = "auth-inactive-e2e@prumo.local";
const NO_TENANT_EMAIL = "auth-no-tenant-e2e@prumo.local";
const TEST_PASSWORD = "SenhaE2E@123";
const PRIMARY_SLUG = "auth-e2e-principal";
const SECONDARY_SLUG = "auth-e2e-secundario";
const UNAUTHORIZED_SLUG = "auth-e2e-nao-autorizado";

describe("Auth endpoints (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let primaryTenantId: string;
  let secondaryTenantId: string;
  let unauthorizedTenantId: string;
  let userId: string;

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
    jwtService = app.get(JwtService);

    await prisma.user.deleteMany({
      where: {
        email: { in: [TEST_EMAIL, INACTIVE_EMAIL, NO_TENANT_EMAIL] },
      },
    });
    await prisma.tenant.deleteMany({
      where: {
        slug: {
          in: [PRIMARY_SLUG, SECONDARY_SLUG, UNAUTHORIZED_SLUG],
        },
      },
    });

    const [primaryTenant, secondaryTenant, unauthorizedTenant] =
      await Promise.all([
        prisma.tenant.create({
          data: {
            name: "Tenant E2E Principal",
            slug: PRIMARY_SLUG,
            status: TenantStatus.ACTIVE,
          },
        }),
        prisma.tenant.create({
          data: {
            name: "Tenant E2E Secundário",
            slug: SECONDARY_SLUG,
            status: TenantStatus.ACTIVE,
          },
        }),
        prisma.tenant.create({
          data: {
            name: "Tenant E2E Não Autorizado",
            slug: UNAUTHORIZED_SLUG,
            status: TenantStatus.ACTIVE,
          },
        }),
      ]);
    primaryTenantId = primaryTenant.id;
    secondaryTenantId = secondaryTenant.id;
    unauthorizedTenantId = unauthorizedTenant.id;

    const user = await prisma.user.create({
      data: {
        name: "Usuário Auth E2E",
        email: TEST_EMAIL,
        passwordHash: await hash(TEST_PASSWORD, 10),
        memberships: {
          create: [
            {
              tenantId: primaryTenant.id,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2025-01-01T00:00:00.000Z"),
            },
            {
              tenantId: secondaryTenant.id,
              role: MembershipRole.TENANT_ADMIN,
              createdAt: new Date("2025-01-02T00:00:00.000Z"),
            },
          ],
        },
      },
    });
    userId = user.id;
    await prisma.user.createMany({
      data: [
        {
          name: "Usuário inativo E2E",
          email: INACTIVE_EMAIL,
          passwordHash: await hash(TEST_PASSWORD, 10),
          active: false,
        },
        {
          name: "Usuário sem tenant E2E",
          email: NO_TENANT_EMAIL,
          passwordHash: await hash(TEST_PASSWORD, 10),
        },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: {
          email: { in: [TEST_EMAIL, INACTIVE_EMAIL, NO_TENANT_EMAIL] },
        },
      });
      await prisma.tenant.deleteMany({
        where: {
          slug: {
            in: [PRIMARY_SLUG, SECONDARY_SLUG, UNAUTHORIZED_SLUG],
          },
        },
      });
    }

    if (app) {
      await app.close();
    }
  });

  async function login(): Promise<AuthResponse> {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      })
      .expect(HttpStatus.OK);

    return response.body as AuthResponse;
  }

  it("realiza login válido e armazena somente o hash do refresh token", async () => {
    const response = await login();
    const payload = jwtService.decode<AccessTokenPayload>(
      response.accessToken,
    );

    expect(response.user.email).toBe(TEST_EMAIL);
    expect(response.activeMembership?.tenant.id).toBe(primaryTenantId);
    expect(response.memberships).toHaveLength(2);
    expect(payload).toMatchObject({
      sub: userId,
      tenantId: primaryTenantId,
      membershipId: response.activeMembership?.id,
      role: MembershipRole.TENANT_OWNER,
    });
    expect(payload?.permissions).toEqual(
      expect.arrayContaining([
        "profile:read",
        "tenant:select",
        "memberships:read",
      ]),
    );
    expect(payload).not.toHaveProperty("platformRole");
    expect(payload).not.toHaveProperty("platformPermissions");

    const session = await prisma.refreshSession.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    expect(session.tokenHash).not.toBe(response.refreshToken);
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejeita login inválido", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        email: TEST_EMAIL,
        password: "senha-incorreta",
      })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it("rejeita usuário inativo sem revelar o estado da conta", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: INACTIVE_EMAIL, password: TEST_PASSWORD })
      .expect(HttpStatus.UNAUTHORIZED);

    expect(response.body).toMatchObject({
      message: "E-mail ou senha inválidos.",
    });
  });

  it("rejeita usuário sem membership ativa", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: NO_TENANT_EMAIL, password: TEST_PASSWORD })
      .expect(HttpStatus.FORBIDDEN);
  });

  it("não prolonga o bloqueio de uma conta já bloqueada", async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 5, lockedUntil },
    });

    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: "senha-incorreta" })
      .expect(HttpStatus.UNAUTHORIZED);

    const persisted = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { failedLoginAttempts: true, lockedUntil: true },
    });
    expect(persisted.failedLoginAttempts).toBe(5);
    expect(persisted.lockedUntil?.getTime()).toBe(lockedUntil.getTime());

    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });

  it("permite selecionar somente um tenant vinculado", async () => {
    const authenticated = await login();
    const response = await request(app.getHttpServer())
      .post("/api/auth/select-tenant")
      .set("Authorization", `Bearer ${authenticated.accessToken}`)
      .send({
        tenantId: secondaryTenantId,
        refreshToken: authenticated.refreshToken,
      })
      .expect(HttpStatus.OK);
    const body = response.body as AuthResponse;
    const payload = jwtService.decode<AccessTokenPayload>(body.accessToken);

    expect(body.activeMembership?.tenant.id).toBe(secondaryTenantId);
    expect(payload).toMatchObject({
      sub: userId,
      tenantId: secondaryTenantId,
      membershipId: body.activeMembership?.id,
      role: MembershipRole.TENANT_ADMIN,
    });
    expect(body.refreshToken).not.toBe(authenticated.refreshToken);
  });

  it("rejeita a seleção de tenant sem membership", async () => {
    const authenticated = await login();

    await request(app.getHttpServer())
      .post("/api/auth/select-tenant")
      .set("Authorization", `Bearer ${authenticated.accessToken}`)
      .send({
        tenantId: unauthorizedTenantId,
        refreshToken: authenticated.refreshToken,
      })
      .expect(HttpStatus.FORBIDDEN);
  });

  it("retorna usuário, tenant ativo e memberships", async () => {
    const authenticated = await login();
    const [meResponse, membershipsResponse] = await Promise.all([
      request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .expect(HttpStatus.OK),
      request(app.getHttpServer())
        .get("/api/auth/memberships")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .expect(HttpStatus.OK),
    ]);

    expect(meResponse.body).toMatchObject({
      user: {
        id: userId,
        email: TEST_EMAIL,
      },
      activeMembership: {
        tenant: {
          id: primaryTenantId,
        },
      },
    });
    expect(membershipsResponse.body).toHaveLength(2);
  });

  it("rotaciona refresh tokens e bloqueia reutilização", async () => {
    const authenticated = await login();
    const rotatedResponse = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: authenticated.refreshToken })
      .expect(HttpStatus.OK);
    const rotated = rotatedResponse.body as AuthResponse;

    expect(rotated.refreshToken).not.toBe(authenticated.refreshToken);

    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: authenticated.refreshToken })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it("revoga o refresh token no logout", async () => {
    const authenticated = await login();

    await request(app.getHttpServer())
      .post("/api/auth/logout")
      .send({ refreshToken: authenticated.refreshToken })
      .expect(HttpStatus.NO_CONTENT);

    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: authenticated.refreshToken })
      .expect(HttpStatus.UNAUTHORIZED);
  });
});
