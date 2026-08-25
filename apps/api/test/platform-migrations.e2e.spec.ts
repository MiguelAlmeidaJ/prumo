import type { AuthResponse } from "@prumo/contracts";
import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ImportEntityType,
  ImportJobStatus,
  PlatformRole,
  TenantStatus,
} from "@prumo/database";
import { hash } from "bcrypt";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const PASSWORD = "SenhaMigration@123";
const ADMIN_EMAIL = "migration-admin-e2e@prumo.local";
const SUPPORT_EMAIL = "migration-support-e2e@prumo.local";
const TENANT_SLUG = "migration-e2e";

describe.sequential("Central de migração da plataforma (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let tenantId: string;
  let adminToken: string;
  let supportToken: string;
  let jobId: string;
  let fileId: string;
  let importedStudentId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
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
    await cleanup();
    const passwordHash = await hash(PASSWORD, 10);
    const tenant = await prisma.tenant.create({
      data: {
        name: "Migration E2E",
        slug: TENANT_SLUG,
        status: TenantStatus.ACTIVE,
      },
    });
    tenantId = tenant.id;
    await prisma.user.createMany({
      data: [
        {
          name: "Migration Admin",
          email: ADMIN_EMAIL,
          passwordHash,
          platformRole: PlatformRole.PLATFORM_ADMIN,
        },
        {
          name: "Migration Support",
          email: SUPPORT_EMAIL,
          passwordHash,
          platformRole: PlatformRole.PLATFORM_SUPPORT,
        },
      ],
    });
    adminToken = await login(ADMIN_EMAIL);
    supportToken = await login(SUPPORT_EMAIL);
  }, 40_000);

  afterAll(async () => {
    if (prisma) await cleanup();
    if (app) await app.close();
  });

  async function cleanup() {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: TENANT_SLUG },
      select: { id: true },
    });
    if (tenant) {
      await prisma.importIssue.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.legacyImportMap.deleteMany({
        where: { tenantId: tenant.id },
      });
      await prisma.importMapping.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.importFile.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.importJob.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, SUPPORT_EMAIL] } },
      select: { id: true },
    });
    if (users.length) {
      const ids = users.map((user) => user.id);
      await prisma.auditLog.deleteMany({
        where: { platformUserId: { in: ids } },
      });
      await prisma.refreshSession.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD })
      .expect(HttpStatus.OK);
    return (response.body as AuthResponse).accessToken;
  }

  it("restringe a central a PLATFORM_ADMIN/OWNER", async () => {
    await request(app.getHttpServer())
      .get("/api/platform/migrations")
      .set("Authorization", `Bearer ${supportToken}`)
      .expect(HttpStatus.FORBIDDEN);
  });

  it("cria job, recebe CSV privado e salva mapeamento explícito", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/platform/migrations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tenantId,
        sourceSystem: "Sistema E2E",
        description: "Migração de teste",
        migrationType: "FULL",
        cutoverDate: "2026-08-31T23:59:59.000Z",
      })
      .expect(HttpStatus.CREATED);
    const createdBody = created.body as unknown as { id: string };
    jobId = createdBody.id;

    const csv = [
      "Codigo;NomeAluno;CPF;DtNasc;Email;Celular",
      "ALUNO-1598;João Migração;52998224725;20/05/1995;joao.migracao@example.com;11999990000",
    ].join("\r\n");
    const uploaded = await request(app.getHttpServer())
      .post(`/api/platform/migrations/${jobId}/files`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        entityType: ImportEntityType.STUDENTS,
        fileName: "alunos.csv",
        mimeType: "text/csv",
        contentBase64: Buffer.from(csv).toString("base64"),
      })
      .expect(HttpStatus.CREATED);
    const uploadedBody = uploaded.body as unknown as {
      id: string;
      storageKey: string;
    };
    fileId = uploadedBody.id;
    expect(uploadedBody.storageKey).toContain(
      `tenants/${tenantId}/migrations/${jobId}/files/`,
    );

    await request(app.getHttpServer())
      .put(`/api/platform/migrations/${jobId}/files/${fileId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        conflictPolicy: "ERROR",
        mappings: [
          { sourceColumn: "Codigo", targetField: "legacyId" },
          { sourceColumn: "NomeAluno", targetField: "name" },
          { sourceColumn: "CPF", targetField: "cpf" },
          { sourceColumn: "DtNasc", targetField: "birthDate" },
          { sourceColumn: "Email", targetField: "email" },
          { sourceColumn: "Celular", targetField: "phone" },
        ],
      })
      .expect(HttpStatus.OK);
  });

  it("executa dry-run sem gravar e importa de forma idempotente", async () => {
    const validated = await request(app.getHttpServer())
      .post(`/api/platform/migrations/${jobId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(HttpStatus.CREATED);
    const validatedBody = validated.body as unknown as {
      status: ImportJobStatus;
      preview: Record<string, unknown>;
    };
    expect(validatedBody.status).toBe(ImportJobStatus.READY);
    expect(validatedBody.preview).toMatchObject({
      newRecords: 1,
      failedRecords: 0,
      tenantId,
      zeroImpactOtherTenants: true,
    });
    expect(await prisma.student.count({ where: { tenantId } })).toBe(0);

    const executed = await request(app.getHttpServer())
      .post(`/api/platform/migrations/${jobId}/execute`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(HttpStatus.CREATED);
    expect(
      (executed.body as unknown as { status: ImportJobStatus }).status,
    ).toBe(ImportJobStatus.COMPLETED);
    const student = await prisma.student.findUniqueOrThrow({
      where: { tenantId_cpf: { tenantId, cpf: "52998224725" } },
    });
    importedStudentId = student.id;
    const map = await prisma.legacyImportMap.findUniqueOrThrow({
      where: {
        tenantId_sourceSystem_entityType_legacyId: {
          tenantId,
          sourceSystem: "Sistema E2E",
          entityType: ImportEntityType.STUDENTS,
          legacyId: "ALUNO-1598",
        },
      },
    });
    expect(map.entityId).toBe(student.id);
    expect(map.createdByImport).toBe(true);
    expect(
      await prisma.student.count({
        where: { tenantId, cpf: "52998224725" },
      }),
    ).toBe(1);
  });

  it("bloqueia rollback quando o dado importado já possui operação posterior", async () => {
    const note = await prisma.studentNote.create({
      data: {
        tenantId,
        studentId: importedStudentId,
        content: "Operação posterior",
      },
    });
    await request(app.getHttpServer())
      .post(`/api/platform/migrations/${jobId}/rollback`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Teste de proteção", confirmation: "ROLLBACK" })
      .expect(HttpStatus.CONFLICT);
    await prisma.studentNote.delete({ where: { id: note.id } });
  });

  it("executa rollback controlado quando o registro continua íntegro", async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/platform/migrations/${jobId}/rollback`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Encerramento do cenário E2E", confirmation: "ROLLBACK" })
      .expect(HttpStatus.CREATED);
    expect(
      (response.body as unknown as { status: ImportJobStatus }).status,
    ).toBe(ImportJobStatus.ROLLED_BACK);
    expect(
      await prisma.student.count({
        where: { id: importedStudentId, tenantId },
      }),
    ).toBe(0);
    expect(
      await prisma.legacyImportMap.count({ where: { importJobId: jobId } }),
    ).toBe(0);
  });
});
