import type {
  AuthResponse,
  CredentialTokenInfo,
  TeamMemberInviteResult,
  TeamMemberSummary,
  TenantDashboardResponse,
  TenantSettingsSummary,
} from "@prumo/contracts";
import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  MembershipRole,
  TenantStatus,
  UserCredentialTokenType,
} from "@prisma/client";
import { hash } from "bcrypt";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const OWNER_EMAIL = "identity-owner-e2e@prumo.local";
const INVITED_EMAIL = "identity-invited-e2e@prumo.local";
const OWNER_PASSWORD = "OwnerIdentity@123";
const INVITED_PASSWORD = "InvitedIdentity@123";
const PRIMARY_SLUG = "identity-e2e-primary";
const SECONDARY_SLUG = "identity-e2e-secondary";

describe("Identity and team endpoints (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let primaryTenantId: string;
  let secondaryTenantId: string;
  let primaryOwnerMembershipId: string;
  let invitedMembershipId: string;
  let invitedUserId: string;

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

    await prisma.tenant.deleteMany({
      where: { slug: { in: [PRIMARY_SLUG, SECONDARY_SLUG] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [OWNER_EMAIL, INVITED_EMAIL] } },
    });

    const [primary, secondary] = await Promise.all([
      prisma.tenant.create({
        data: {
          name: "Identity E2E Primary",
          slug: PRIMARY_SLUG,
          status: TenantStatus.ACTIVE,
        },
      }),
      prisma.tenant.create({
        data: {
          name: "Identity E2E Secondary",
          slug: SECONDARY_SLUG,
          status: TenantStatus.ACTIVE,
        },
      }),
    ]);
    primaryTenantId = primary.id;
    secondaryTenantId = secondary.id;

    const owner = await prisma.user.create({
      data: {
        name: "Identity Owner E2E",
        email: OWNER_EMAIL,
        passwordHash: await hash(OWNER_PASSWORD, 10),
        passwordSetAt: new Date(),
        memberships: {
          create: [
            {
              tenantId: primary.id,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            },
            {
              tenantId: secondary.id,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2026-01-02T00:00:00.000Z"),
            },
          ],
        },
      },
      include: { memberships: true },
    });
    primaryOwnerMembershipId = owner.memberships.find(
      (membership) => membership.tenantId === primary.id,
    )!.id;
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.tenant.deleteMany({
        where: { slug: { in: [PRIMARY_SLUG, SECONDARY_SLUG] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [OWNER_EMAIL, INVITED_EMAIL] } },
      });
    }
    if (app) await app.close();
  });

  async function loginOwner(): Promise<AuthResponse> {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
      .expect(HttpStatus.OK);
    return response.body as AuthResponse;
  }

  it("agrega a visão geral somente com dados do tenant ativo", async () => {
    await prisma.student.create({
      data: {
        tenantId: primaryTenantId,
        name: "Dashboard Student E2E",
        cpf: "90123456780",
      },
    });
    const owner = await loginOwner();
    const primaryResponse = await request(app.getHttpServer())
      .get("/api/dashboard")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(HttpStatus.OK);
    const primary = primaryResponse.body as TenantDashboardResponse;
    expect(
      primary.metrics.find((metric) => metric.key === "students")?.value,
    ).toBe(1);

    const selectedResponse = await request(app.getHttpServer())
      .post("/api/auth/select-tenant")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ tenantId: secondaryTenantId, refreshToken: owner.refreshToken })
      .expect(HttpStatus.OK);
    const secondary = selectedResponse.body as AuthResponse;
    const secondaryResponse = await request(app.getHttpServer())
      .get("/api/dashboard")
      .set("Authorization", `Bearer ${secondary.accessToken}`)
      .expect(HttpStatus.OK);
    const secondaryDashboard =
      secondaryResponse.body as TenantDashboardResponse;
    expect(
      secondaryDashboard.metrics.find((metric) => metric.key === "students")
        ?.value,
    ).toBe(0);
  });

  it("mantém configurações isoladas no tenant ativo", async () => {
    const owner = await loginOwner();
    const updatedResponse = await request(app.getHttpServer())
      .patch("/api/tenant/settings")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ timezone: "America/Manaus", supportAccessEnabled: false })
      .expect(HttpStatus.OK);
    expect(updatedResponse.body as TenantSettingsSummary).toMatchObject({
      timezone: "America/Manaus",
      supportAccessEnabled: false,
      tenant: { id: primaryTenantId },
    });

    const selectedResponse = await request(app.getHttpServer())
      .post("/api/auth/select-tenant")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ tenantId: secondaryTenantId, refreshToken: owner.refreshToken })
      .expect(HttpStatus.OK);
    const secondary = selectedResponse.body as AuthResponse;
    const settingsResponse = await request(app.getHttpServer())
      .get("/api/tenant/settings")
      .set("Authorization", `Bearer ${secondary.accessToken}`)
      .expect(HttpStatus.OK);
    expect(settingsResponse.body as TenantSettingsSummary).toMatchObject({
      timezone: "America/Sao_Paulo",
      supportAccessEnabled: true,
      tenant: { id: secondaryTenantId },
    });
  });

  it("convida um membro apenas para o tenant ativo", async () => {
    const owner = await loginOwner();
    const response = await request(app.getHttpServer())
      .post("/api/team/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        name: "Identity Invited E2E",
        email: INVITED_EMAIL,
        role: MembershipRole.SECRETARY,
      })
      .expect(HttpStatus.CREATED);
    const result = response.body as TeamMemberInviteResult;
    invitedMembershipId = result.member.id;

    const invited = await prisma.user.findUniqueOrThrow({
      where: { email: INVITED_EMAIL },
      include: { memberships: true, credentialTokens: true },
    });
    invitedUserId = invited.id;
    expect(invited.passwordSetAt).toBeNull();
    expect(invited.memberships).toEqual([
      expect.objectContaining({
        tenantId: primaryTenantId,
        role: MembershipRole.SECRETARY,
      }),
    ]);
    expect(invited.credentialTokens).toEqual([
      expect.objectContaining({
        tenantId: primaryTenantId,
        type: UserCredentialTokenType.INVITATION,
      }),
    ]);

    const listResponse = await request(app.getHttpServer())
      .get("/api/team/members")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(HttpStatus.OK);
    const members = listResponse.body as TeamMemberSummary[];
    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: invitedMembershipId,
          invitationPending: true,
        }),
      ]),
    );
  });

  it("bloqueia leitura e mutação cruzadas entre tenants", async () => {
    const owner = await loginOwner();
    const selectedResponse = await request(app.getHttpServer())
      .post("/api/auth/select-tenant")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        tenantId: secondaryTenantId,
        refreshToken: owner.refreshToken,
      })
      .expect(HttpStatus.OK);
    const secondary = selectedResponse.body as AuthResponse;

    const listResponse = await request(app.getHttpServer())
      .get("/api/team/members")
      .set("Authorization", `Bearer ${secondary.accessToken}`)
      .expect(HttpStatus.OK);
    const members = listResponse.body as TeamMemberSummary[];
    expect(members.some((member) => member.id === invitedMembershipId)).toBe(
      false,
    );

    await request(app.getHttpServer())
      .patch(`/api/team/members/${invitedMembershipId}`)
      .set("Authorization", `Bearer ${secondary.accessToken}`)
      .send({ active: false })
      .expect(HttpStatus.NOT_FOUND);
  });

  it("preserva ao menos um proprietário ativo no tenant", async () => {
    const owner = await loginOwner();
    await request(app.getHttpServer())
      .patch(`/api/team/members/${primaryOwnerMembershipId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ active: false })
      .expect(HttpStatus.CONFLICT);
  });

  it("define a senha com token de uso único e permite login", async () => {
    const rawToken = "identity-e2e-single-use-token-with-40-characters";
    await prisma.userCredentialToken.updateMany({
      where: { userId: invitedUserId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await prisma.userCredentialToken.create({
      data: {
        userId: invitedUserId,
        tenantId: primaryTenantId,
        type: UserCredentialTokenType.INVITATION,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const inspectResponse = await request(app.getHttpServer())
      .get("/api/auth/credential-token")
      .query({ token: rawToken })
      .expect(HttpStatus.OK);
    expect(inspectResponse.body as CredentialTokenInfo).toMatchObject({
      type: UserCredentialTokenType.INVITATION,
      email: INVITED_EMAIL,
      tenant: { id: primaryTenantId },
    });

    await request(app.getHttpServer())
      .post("/api/auth/set-password")
      .send({ token: rawToken, password: INVITED_PASSWORD })
      .expect(HttpStatus.OK);

    await request(app.getHttpServer())
      .post("/api/auth/set-password")
      .send({ token: rawToken, password: INVITED_PASSWORD })
      .expect(HttpStatus.NOT_FOUND);

    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: INVITED_EMAIL, password: INVITED_PASSWORD })
      .expect(HttpStatus.OK);
  });

  it("não revela se o e-mail existe na recuperação", async () => {
    const [known, unknown] = await Promise.all([
      request(app.getHttpServer())
        .post("/api/auth/forgot-password")
        .send({ email: OWNER_EMAIL })
        .expect(HttpStatus.OK),
      request(app.getHttpServer())
        .post("/api/auth/forgot-password")
        .send({ email: "identity-unknown-e2e@prumo.local" })
        .expect(HttpStatus.OK),
    ]);
    expect(known.body).toEqual(unknown.body);
  });
});
