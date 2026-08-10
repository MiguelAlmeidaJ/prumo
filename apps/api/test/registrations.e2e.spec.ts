import type {
  AuthResponse,
  InstructorSummary,
  PaginatedResponse,
  StudentDetail,
  StudentSummary,
  VehicleSummary,
} from "@prumo/contracts";
import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MembershipRole, TenantStatus } from "@prisma/client";
import { hash } from "bcrypt";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const TEST_EMAIL = "registrations-e2e@prumo.local";
const TEST_PASSWORD = "CadastrosE2E@123";
const PRIMARY_SLUG = "cadastros-e2e-principal";
const SECONDARY_SLUG = "cadastros-e2e-secundario";

function bodyAs<T>(response: { body: unknown }): T {
  return response.body as T;
}

describe("Cadastros base multi-tenant (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let primaryTenantId: string;
  let secondaryTenantId: string;

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

    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.tenant.deleteMany({
      where: { slug: { in: [PRIMARY_SLUG, SECONDARY_SLUG] } },
    });

    const [primary, secondary] = await Promise.all([
      prisma.tenant.create({
        data: {
          name: "Cadastros Principal",
          slug: PRIMARY_SLUG,
          status: TenantStatus.ACTIVE,
        },
      }),
      prisma.tenant.create({
        data: {
          name: "Cadastros Secundário",
          slug: SECONDARY_SLUG,
          status: TenantStatus.ACTIVE,
        },
      }),
    ]);
    primaryTenantId = primary.id;
    secondaryTenantId = secondary.id;

    await prisma.user.create({
      data: {
        name: "Usuário Cadastros E2E",
        email: TEST_EMAIL,
        passwordHash: await hash(TEST_PASSWORD, 10),
        memberships: {
          create: [
            {
              tenantId: primary.id,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2025-01-01T00:00:00.000Z"),
            },
            {
              tenantId: secondary.id,
              role: MembershipRole.TENANT_ADMIN,
              createdAt: new Date("2025-01-02T00:00:00.000Z"),
            },
          ],
        },
      },
    });
  }, 30_000);

  beforeEach(async () => {
    await Promise.all([
      prisma.student.deleteMany({
        where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } },
      }),
      prisma.instructor.deleteMany({
        where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } },
      }),
      prisma.vehicle.deleteMany({
        where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } },
      }),
    ]);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
      await prisma.tenant.deleteMany({
        where: { slug: { in: [PRIMARY_SLUG, SECONDARY_SLUG] } },
      });
    }
    if (app) await app.close();
  });

  async function login(): Promise<AuthResponse> {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(HttpStatus.OK);
    return response.body as AuthResponse;
  }

  async function secondarySession(): Promise<AuthResponse> {
    const authenticated = await login();
    const response = await request(app.getHttpServer())
      .post("/api/auth/select-tenant")
      .set("Authorization", `Bearer ${authenticated.accessToken}`)
      .send({
        tenantId: secondaryTenantId,
        refreshToken: authenticated.refreshToken,
      })
      .expect(HttpStatus.OK);
    return response.body as AuthResponse;
  }

  const studentPayload = {
    name: "Maria da Silva",
    cpf: "529.982.247-25",
    email: "maria@prumo.local",
    phone: "(11) 99999-0001",
    birthDate: "1998-04-15",
    address: {
      zipCode: "01310-100",
      street: "Avenida Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "sp",
    },
    documents: [
      {
        type: "RG",
        number: "123456789",
        issuingAuthority: "SSP/SP",
      },
    ],
    notes: [{ content: "Cadastro criado no teste e2e." }],
    processes: [{ category: "b", renach: "E2E00001" }],
  };

  describe("alunos", () => {
    it("cria aluno e seus cadastros relacionados", async () => {
      const authenticated = await login();
      const created = await request(app.getHttpServer())
        .post("/api/students")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(studentPayload)
        .expect(HttpStatus.CREATED);

      expect(created.body).toMatchObject({
        name: studentPayload.name,
        cpf: "52998224725",
        status: "ACTIVE",
      });
      const createdBody = bodyAs<StudentSummary>(created);

      const detail = await request(app.getHttpServer())
        .get(`/api/students/${createdBody.id}`)
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .expect(HttpStatus.OK);

      const detailBody = bodyAs<StudentDetail>(detail);
      expect(detailBody.address).toMatchObject({
        zipCode: "01310100",
        state: "SP",
      });
      expect(detailBody.documents).toHaveLength(1);
      expect(detailBody.notes).toHaveLength(1);
      expect(detailBody.processes).toHaveLength(1);
    });

    it("lista e busca por nome, CPF, e-mail e telefone", async () => {
      const authenticated = await login();
      await request(app.getHttpServer())
        .post("/api/students")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(studentPayload)
        .expect(HttpStatus.CREATED);

      for (const search of [
        "Maria",
        "529.982",
        "maria@prumo",
        "99999-0001",
      ]) {
        const response = await request(app.getHttpServer())
          .get("/api/students")
          .query({ search })
          .set("Authorization", `Bearer ${authenticated.accessToken}`)
          .expect(HttpStatus.OK);
        expect(
          bodyAs<PaginatedResponse<StudentSummary>>(response).data,
        ).toHaveLength(1);
      }
    });

    it("pagina resultados de forma determinística", async () => {
      const authenticated = await login();
      for (let index = 0; index < 5; index += 1) {
        await prisma.student.create({
          data: {
            tenantId: primaryTenantId,
            name: `Aluno ${index}`,
            cpf: `0000000000${index}`,
          },
        });
      }

      const response = await request(app.getHttpServer())
        .get("/api/students")
        .query({ page: 2, pageSize: 2 })
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .expect(HttpStatus.OK);

      const responseBody = bodyAs<PaginatedResponse<StudentSummary>>(response);
      expect(responseBody.data).toHaveLength(2);
      expect(responseBody.meta).toEqual({
        page: 2,
        pageSize: 2,
        total: 5,
        totalPages: 3,
      });
    });

    it("rejeita CPF duplicado no mesmo tenant", async () => {
      const authenticated = await login();
      await request(app.getHttpServer())
        .post("/api/students")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(studentPayload)
        .expect(HttpStatus.CREATED);
      await request(app.getHttpServer())
        .post("/api/students")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send({ ...studentPayload, name: "Outra Maria" })
        .expect(HttpStatus.CONFLICT);
    });

    it("permite o mesmo CPF em tenants diferentes", async () => {
      const primary = await login();
      await request(app.getHttpServer())
        .post("/api/students")
        .set("Authorization", `Bearer ${primary.accessToken}`)
        .send(studentPayload)
        .expect(HttpStatus.CREATED);

      const secondary = await secondarySession();
      await request(app.getHttpServer())
        .post("/api/students")
        .set("Authorization", `Bearer ${secondary.accessToken}`)
        .send(studentPayload)
        .expect(HttpStatus.CREATED);
    });

    it("bloqueia acesso a aluno de outro tenant", async () => {
      const primary = await login();
      const created = await request(app.getHttpServer())
        .post("/api/students")
        .set("Authorization", `Bearer ${primary.accessToken}`)
        .send(studentPayload)
        .expect(HttpStatus.CREATED);
      const createdBody = bodyAs<StudentSummary>(created);
      const secondary = await secondarySession();

      await request(app.getHttpServer())
        .get(`/api/students/${createdBody.id}`)
        .set("Authorization", `Bearer ${secondary.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
      await request(app.getHttpServer())
        .patch(`/api/students/${createdBody.id}/status`)
        .set("Authorization", `Bearer ${secondary.accessToken}`)
        .send({ status: "INACTIVE" })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe("instrutores", () => {
    const payload = {
      name: "Carlos Oliveira",
      cpf: "111.444.777-35",
      email: "carlos@prumo.local",
      phone: "(11) 99999-0202",
      license: "01234567890",
      licenseCategory: "ab",
    };

    it("cria instrutor", async () => {
      const authenticated = await login();
      const response = await request(app.getHttpServer())
        .post("/api/instructors")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
      expect(response.body).toMatchObject({
        name: payload.name,
        cpf: "11144477735",
        licenseCategory: "AB",
      });
    });

    it("lista e busca instrutores", async () => {
      const authenticated = await login();
      await request(app.getHttpServer())
        .post("/api/instructors")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(payload);
      const response = await request(app.getHttpServer())
        .get("/api/instructors")
        .query({ search: "Carlos", page: 1, pageSize: 20 })
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .expect(HttpStatus.OK);
      expect(
        bodyAs<PaginatedResponse<InstructorSummary>>(response).data,
      ).toHaveLength(1);
    });

    it("pagina instrutores", async () => {
      const authenticated = await login();
      for (let index = 0; index < 3; index += 1) {
        await prisma.instructor.create({
          data: {
            tenantId: primaryTenantId,
            name: `Instrutor ${index}`,
            cpf: `1000000000${index}`,
          },
        });
      }
      const response = await request(app.getHttpServer())
        .get("/api/instructors")
        .query({ page: 2, pageSize: 2 })
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .expect(HttpStatus.OK);
      const responseBody =
        bodyAs<PaginatedResponse<InstructorSummary>>(response);
      expect(responseBody.meta).toMatchObject({ total: 3, totalPages: 2 });
      expect(responseBody.data).toHaveLength(1);
    });

    it("rejeita CPF de instrutor duplicado no mesmo tenant", async () => {
      const authenticated = await login();
      await request(app.getHttpServer())
        .post("/api/instructors")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
      await request(app.getHttpServer())
        .post("/api/instructors")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CONFLICT);
    });

    it("permite o mesmo CPF de instrutor em tenants diferentes", async () => {
      const primary = await login();
      await request(app.getHttpServer())
        .post("/api/instructors")
        .set("Authorization", `Bearer ${primary.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
      const secondary = await secondarySession();
      await request(app.getHttpServer())
        .post("/api/instructors")
        .set("Authorization", `Bearer ${secondary.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
    });

    it("bloqueia acesso a instrutor de outro tenant", async () => {
      const primary = await login();
      const created = await request(app.getHttpServer())
        .post("/api/instructors")
        .set("Authorization", `Bearer ${primary.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
      const createdBody = bodyAs<InstructorSummary>(created);
      const secondary = await secondarySession();
      await request(app.getHttpServer())
        .get(`/api/instructors/${createdBody.id}`)
        .set("Authorization", `Bearer ${secondary.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe("veículos", () => {
    const payload = {
      plate: "PRM-1A23",
      brand: "Volkswagen",
      model: "Polo",
      year: 2025,
      color: "Branco",
      renavam: "12345678901",
      category: "b",
    };

    it("cria veículo", async () => {
      const authenticated = await login();
      const response = await request(app.getHttpServer())
        .post("/api/vehicles")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
      expect(response.body).toMatchObject({
        plate: "PRM1A23",
        model: "Polo",
        category: "B",
      });
    });

    it("lista e busca veículos", async () => {
      const authenticated = await login();
      await request(app.getHttpServer())
        .post("/api/vehicles")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(payload);
      const response = await request(app.getHttpServer())
        .get("/api/vehicles")
        .query({ search: "Volkswagen" })
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .expect(HttpStatus.OK);
      expect(
        bodyAs<PaginatedResponse<VehicleSummary>>(response).data,
      ).toHaveLength(1);
    });

    it("pagina veículos", async () => {
      const authenticated = await login();
      for (let index = 0; index < 3; index += 1) {
        await prisma.vehicle.create({
          data: {
            tenantId: primaryTenantId,
            plate: `ABC${index}D0${index}`,
            model: `Veículo ${index}`,
          },
        });
      }
      const response = await request(app.getHttpServer())
        .get("/api/vehicles")
        .query({ page: 2, pageSize: 2 })
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .expect(HttpStatus.OK);
      const responseBody = bodyAs<PaginatedResponse<VehicleSummary>>(response);
      expect(responseBody.meta).toMatchObject({ total: 3, totalPages: 2 });
      expect(responseBody.data).toHaveLength(1);
    });

    it("rejeita placa duplicada no mesmo tenant", async () => {
      const authenticated = await login();
      await request(app.getHttpServer())
        .post("/api/vehicles")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
      await request(app.getHttpServer())
        .post("/api/vehicles")
        .set("Authorization", `Bearer ${authenticated.accessToken}`)
        .send({ ...payload, renavam: "99999999999" })
        .expect(HttpStatus.CONFLICT);
    });

    it("permite a mesma placa em tenants diferentes", async () => {
      const primary = await login();
      await request(app.getHttpServer())
        .post("/api/vehicles")
        .set("Authorization", `Bearer ${primary.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
      const secondary = await secondarySession();
      await request(app.getHttpServer())
        .post("/api/vehicles")
        .set("Authorization", `Bearer ${secondary.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
    });

    it("bloqueia acesso a veículo de outro tenant", async () => {
      const primary = await login();
      const created = await request(app.getHttpServer())
        .post("/api/vehicles")
        .set("Authorization", `Bearer ${primary.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
      const createdBody = bodyAs<VehicleSummary>(created);
      const secondary = await secondarySession();
      await request(app.getHttpServer())
        .get(`/api/vehicles/${createdBody.id}`)
        .set("Authorization", `Bearer ${secondary.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
