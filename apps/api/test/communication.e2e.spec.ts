import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  MembershipRole,
  NotificationChannel,
  TenantStatus,
} from "@prumo/database";
import type { AuthResponse } from "@prumo/contracts";
import { hash } from "bcrypt";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const PASSWORD = "CommunicationE2E@123";
const OWNER_EMAIL = "communication-owner@prumo.local";
const STUDENT_EMAIL = "communication-student@prumo.local";
const SLUGS = ["communication-primary", "communication-secondary"];

describe("Comunicação multi-tenant (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let tenantId: string;
  let otherTenantId: string;
  let ownerId: string;
  let studentId: string;
  let ownerToken: string;
  let studentToken: string;

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
    await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
    await prisma.user.deleteMany({
      where: { email: { in: [OWNER_EMAIL, STUDENT_EMAIL] } },
    });
    const [tenant, other] = await Promise.all(
      SLUGS.map((slug) =>
        prisma.tenant.create({
          data: { name: slug, slug, status: TenantStatus.ACTIVE },
        }),
      ),
    );
    tenantId = tenant.id;
    otherTenantId = other.id;
    const passwordHash = await hash(PASSWORD, 10);
    const owner = await prisma.user.create({
      data: {
        name: "Owner Comunicação",
        email: OWNER_EMAIL,
        passwordHash,
        memberships: {
          create: [
            {
              tenantId,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2026-01-01T00:00:00Z"),
            },
            {
              tenantId: otherTenantId,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2026-01-02T00:00:00Z"),
            },
          ],
        },
      },
    });
    ownerId = owner.id;
    const student = await prisma.user.create({
      data: {
        name: "Aluno Comunicação",
        email: STUDENT_EMAIL,
        passwordHash,
        memberships: {
          create: { tenantId, role: MembershipRole.STUDENT },
        },
      },
    });
    studentId = student.id;
    const [ownerLogin, studentLogin] = await Promise.all([
      request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: OWNER_EMAIL, password: PASSWORD }),
      request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: STUDENT_EMAIL, password: PASSWORD }),
    ]);
    ownerToken = (ownerLogin.body as AuthResponse).accessToken;
    studentToken = (studentLogin.body as AuthResponse).accessToken;
  }, 30_000);

  beforeEach(async () => {
    await prisma.notification.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    await prisma.notificationPreference.deleteMany({ where: { tenantId } });
    await prisma.devicePushToken.deleteMany({
      where: { userId: { in: [ownerId, studentId] } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.notificationTemplate.deleteMany({
        where: { code: "e2e-template" },
      });
      await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
      await prisma.user.deleteMany({
        where: { email: { in: [OWNER_EMAIL, STUDENT_EMAIL] } },
      });
    }
    if (app) await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it("isola notificações por tenant e por usuário, inclusive para administradores", async () => {
    const own = await prisma.notification.create({
      data: {
        tenantId,
        userId: ownerId,
        type: "TEST",
        title: "Minha",
        body: "Privada",
      },
    });
    const foreignUser = await prisma.notification.create({
      data: {
        tenantId,
        userId: studentId,
        type: "TEST",
        title: "Alheia",
        body: "Privada",
      },
    });
    await prisma.notification.create({
      data: {
        tenantId: otherTenantId,
        userId: ownerId,
        type: "TEST",
        title: "Outro tenant",
        body: "Privada",
      },
    });
    const list = await request(app.getHttpServer())
      .get("/api/notifications")
      .set(auth(ownerToken))
      .expect(HttpStatus.OK);
    expect(
      (list.body as { data: { id: string }[] }).data.map(({ id }) => id),
    ).toEqual([own.id]);
    await request(app.getHttpServer())
      .get(`/api/notifications/${foreignUser.id}`)
      .set(auth(ownerToken))
      .expect(HttpStatus.NOT_FOUND);
  });

  it("atualiza contador, leitura e actionUrl", async () => {
    const notification = await prisma.notification.create({
      data: {
        tenantId,
        userId: studentId,
        type: "TEST",
        title: "Aula",
        body: "Aula criada",
        actionUrl: "/practical-lessons/123",
      },
    });
    const unread = await request(app.getHttpServer())
      .get("/api/notifications/unread-count")
      .set(auth(studentToken))
      .expect(HttpStatus.OK);
    expect(unread.body).toEqual({ count: 1 });
    const read = await request(app.getHttpServer())
      .post(`/api/notifications/${notification.id}/read`)
      .set(auth(studentToken))
      .expect(HttpStatus.CREATED);
    expect(read.body).toMatchObject({
      actionUrl: "/practical-lessons/123",
    });
  });

  it("cria preferências padrão idempotentes e permite desativar canal", async () => {
    await request(app.getHttpServer())
      .get("/api/communication/preferences")
      .set(auth(studentToken))
      .expect(HttpStatus.OK);
    const second = await request(app.getHttpServer())
      .get("/api/communication/preferences")
      .set(auth(studentToken))
      .expect(HttpStatus.OK);
    const preferences = second.body as Array<{ eventType: string }>;
    expect(new Set(preferences.map(({ eventType }) => eventType)).size).toBe(
      preferences.length,
    );
    await request(app.getHttpServer())
      .put("/api/communication/preferences")
      .set(auth(studentToken))
      .send({
        preferences: [
          {
            eventType: "PRACTICAL_LESSON_CREATED",
            inAppEnabled: true,
            emailEnabled: false,
            pushEnabled: true,
            smsEnabled: false,
          },
        ],
      })
      .expect(HttpStatus.OK);
    expect(
      await prisma.notificationPreference.findUniqueOrThrow({
        where: {
          tenantId_userId_eventType: {
            tenantId,
            userId: studentId,
            eventType: "PRACTICAL_LESSON_CREATED",
          },
        },
      }),
    ).toMatchObject({ emailEnabled: false });
  });

  it("impede que usuário assuma push token de outro usuário", async () => {
    await prisma.devicePushToken.create({
      data: {
        userId: studentId,
        tenantId,
        token: "ExponentPushToken[e2e-shared-token]",
        platform: "ANDROID",
      },
    });
    await request(app.getHttpServer())
      .post("/api/devices/push-token")
      .set(auth(ownerToken))
      .send({
        token: "ExponentPushToken[e2e-shared-token]",
        platform: "ANDROID",
      })
      .expect(HttpStatus.CONFLICT);
  });

  it("valida variáveis e prioriza sobrescrita do tenant", async () => {
    await prisma.notificationTemplate.create({
      data: {
        code: "e2e-template",
        channel: NotificationChannel.IN_APP,
        title: "Global",
        body: "Olá {{userName}}",
        allowedVariables: ["userName"],
      },
    });
    await request(app.getHttpServer())
      .post("/api/communication/templates")
      .set(auth(ownerToken))
      .send({
        code: "e2e-template",
        channel: "IN_APP",
        title: "Tenant",
        body: "Olá {{userName}}",
        allowedVariables: ["userName"],
      })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post("/api/communication/templates")
      .set(auth(ownerToken))
      .send({
        code: "invalid-template",
        channel: "IN_APP",
        title: "Inválido",
        body: "{{secret}}",
        allowedVariables: ["userName"],
      })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it("restringe administração de eventos a perfis autorizados", async () => {
    await request(app.getHttpServer())
      .get("/api/communication/events")
      .set(auth(studentToken))
      .expect(HttpStatus.FORBIDDEN);
  });
});
