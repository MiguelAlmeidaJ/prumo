import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ExamResult,
  ExamStatus,
  ExamType,
  MembershipRole,
  ProcessStageStatus,
  ProcessStageType,
  RegistryStatus,
  StudentDocumentType,
  TenantStatus,
} from "@prisma/client";
import type { AuthResponse } from "@prumo/contracts";
import { hash } from "bcrypt";
import { unlink } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
import { cwd } from "node:process";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const EMAIL = "processes-e2e@prumo.local";
const PASSWORD = "ProcessesE2E@123";
const SLUGS = ["processes-e2e-primary", "processes-e2e-secondary"];

describe("Processos de habilitação e exames (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let tenantId: string;
  let otherTenantId: string;
  let token: string;
  let otherToken: string;
  let userId: string;
  let studentId: string;
  let otherStudentId: string;
  let unitId: string;
  let otherUnitId: string;

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
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    const [primary, secondary] = await Promise.all(
      SLUGS.map((slug, index) =>
        prisma.tenant.create({
          data: {
            slug,
            name: `Processos ${index + 1}`,
            status: TenantStatus.ACTIVE,
          },
        }),
      ),
    );
    tenantId = primary.id;
    otherTenantId = secondary.id;
    const user = await prisma.user.create({
      data: {
        name: "Processos E2E",
        email: EMAIL,
        passwordHash: await hash(PASSWORD, 10),
        memberships: {
          create: [
            {
              tenantId,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2025-01-01T00:00:00.000Z"),
            },
            {
              tenantId: otherTenantId,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2025-01-02T00:00:00.000Z"),
            },
          ],
        },
      },
    });
    userId = user.id;
    for (const category of ["ACC", "A", "B", "C", "D", "E"]) {
      await prisma.licenseCategory.upsert({
        where: { code: category },
        create: { code: category, name: `Categoria ${category}` },
        update: { active: true },
      });
    }
  }, 30_000);

  beforeEach(async () => {
    const where = { tenantId: { in: [tenantId, otherTenantId] } };
    await prisma.auditLog.deleteMany({ where });
    await prisma.exam.deleteMany({ where });
    await prisma.processDocumentRequirement.deleteMany({ where });
    await prisma.processStageDependency.deleteMany({ where });
    await prisma.processStage.deleteMany({ where });
    await prisma.studentProcessCategory.deleteMany({ where });
    await prisma.lesson.deleteMany({ where });
    await prisma.theoreticalClassStudent.deleteMany({ where });
    await prisma.theoreticalClass.deleteMany({ where });
    await prisma.studentLicenseProcess.deleteMany({ where });
    await prisma.studentDocument.deleteMany({ where });
    await prisma.classroom.deleteMany({ where });
    await prisma.schoolUnit.deleteMany({ where });
    await prisma.student.deleteMany({ where });

    const [unit, otherUnit] = await Promise.all([
      prisma.schoolUnit.create({
        data: {
          tenantId,
          name: "Unidade Processos",
          phone: "1133330000",
          email: "processos@e2e.local",
          address: "Rua Principal, 1",
          openingTime: "07:00",
          closingTime: "22:00",
        },
      }),
      prisma.schoolUnit.create({
        data: {
          tenantId: otherTenantId,
          name: "Unidade Externa",
          phone: "1133339999",
          email: "externa@e2e.local",
          address: "Rua Externa, 2",
          openingTime: "07:00",
          closingTime: "22:00",
        },
      }),
    ]);
    unitId = unit.id;
    otherUnitId = otherUnit.id;
    const [student, otherStudent] = await Promise.all([
      prisma.student.create({
        data: {
          tenantId,
          name: "Aluno Processo",
          cpf: "30000000001",
          status: RegistryStatus.ACTIVE,
        },
      }),
      prisma.student.create({
        data: {
          tenantId: otherTenantId,
          name: "Aluno Externo",
          cpf: "30000000002",
          status: RegistryStatus.ACTIVE,
        },
      }),
    ]);
    studentId = student.id;
    otherStudentId = otherStudent.id;
    await prisma.studentDocument.createMany({
      data: [
        {
          tenantId,
          studentId,
          type: StudentDocumentType.RG,
          number: "RG-E2E",
        },
        {
          tenantId,
          studentId,
          type: StudentDocumentType.PROOF_OF_ADDRESS,
          number: "END-E2E",
        },
        {
          tenantId,
          studentId,
          type: StudentDocumentType.CNH,
          number: "CNH-E2E",
        },
      ],
    });

    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(HttpStatus.OK);
    const session = login.body as AuthResponse;
    token = session.accessToken;
    const selected = await request(app.getHttpServer())
      .post("/api/auth/select-tenant")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        tenantId: otherTenantId,
        refreshToken: session.refreshToken,
      })
      .expect(HttpStatus.OK);
    otherToken = (selected.body as AuthResponse).accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
      await prisma.user.deleteMany({ where: { email: EMAIL } });
    }
    if (app) await app.close();
  });

  const auth = (accessToken = token) => ({
    Authorization: `Bearer ${accessToken}`,
  });
  const future = (hours = 0) =>
    new Date(Date.now() + (30 * 24 + hours) * 60 * 60_000).toISOString();

  async function createProcess(type = "FIRST_LICENSE", categoryCodes = ["B"]) {
    const response = await request(app.getHttpServer())
      .post(`/api/students/${studentId}/processes`)
      .set(auth())
      .send({ unitId, processType: type, categoryCodes })
      .expect(HttpStatus.CREATED);
    return response.body as {
      id: string;
      status: string;
      stages: Array<{ id: string; type: string; status: string }>;
      documents: Array<{ id: string; documentType: string }>;
    };
  }

  async function startAndWaiveDocuments(processId: string) {
    const started = await request(app.getHttpServer())
      .post(`/api/processes/${processId}/start`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    const documents = (started.body as { documents: Array<{ id: string }> })
      .documents;
    for (const document of documents) {
      await request(app.getHttpServer())
        .post(`/api/processes/${processId}/documents/${document.id}/waive`)
        .set(auth())
        .send({ reason: "Dispensa administrativa para o teste." })
        .expect(HttpStatus.CREATED);
    }
    return request(app.getHttpServer())
      .get(`/api/processes/${processId}`)
      .set(auth())
      .expect(HttpStatus.OK);
  }

  async function updateStage(
    processId: string,
    type: ProcessStageType,
    status = ProcessStageStatus.COMPLETED,
  ) {
    const process = await request(app.getHttpServer())
      .get(`/api/processes/${processId}`)
      .set(auth())
      .expect(HttpStatus.OK);
    const stage = (
      process.body as {
        stages: Array<{ id: string; type: ProcessStageType }>;
      }
    ).stages.find((item) => item.type === type);
    expect(stage).toBeDefined();
    await request(app.getHttpServer())
      .patch(`/api/processes/${processId}/stages/${stage!.id}`)
      .set(auth())
      .send({ status })
      .expect(HttpStatus.OK);
  }

  it("rejeita aluno ou unidade de outro tenant e bloqueia acesso cruzado", async () => {
    await request(app.getHttpServer())
      .post(`/api/students/${studentId}/processes`)
      .set(auth())
      .send({
        unitId: otherUnitId,
        processType: "FIRST_LICENSE",
        categoryCodes: ["B"],
      })
      .expect(HttpStatus.NOT_FOUND);
    await request(app.getHttpServer())
      .post(`/api/students/${otherStudentId}/processes`)
      .set(auth())
      .send({
        unitId,
        processType: "FIRST_LICENSE",
        categoryCodes: ["B"],
      })
      .expect(HttpStatus.NOT_FOUND);

    const foreign = await request(app.getHttpServer())
      .post(`/api/students/${otherStudentId}/processes`)
      .set(auth(otherToken))
      .send({
        unitId: otherUnitId,
        processType: "FIRST_LICENSE",
        categoryCodes: ["B"],
      })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .get(`/api/processes/${(foreign.body as { id: string }).id}`)
      .set(auth())
      .expect(HttpStatus.NOT_FOUND);
  });

  it("impede processo ativo incompatível e gera etapas com dependências", async () => {
    const process = await createProcess();
    expect(process.stages).toHaveLength(9);
    expect(process.stages[0]).toMatchObject({
      type: "REGISTRATION",
      status: "AVAILABLE",
    });
    expect(process.stages[1]).toMatchObject({
      type: "DOCUMENT_REVIEW",
      status: "BLOCKED",
    });
    await request(app.getHttpServer())
      .post(`/api/students/${studentId}/processes`)
      .set(auth())
      .send({
        unitId,
        processType: "CATEGORY_ADDITION",
        categoryCodes: ["B"],
      })
      .expect(HttpStatus.CONFLICT);
  });

  it("bloqueia progressão e conclusão enquanto há etapas pendentes", async () => {
    const process = await createProcess();
    await request(app.getHttpServer())
      .patch(`/api/processes/${process.id}/stages/${process.stages[1].id}`)
      .set(auth())
      .send({ status: "IN_PROGRESS" })
      .expect(HttpStatus.CONFLICT);
    await request(app.getHttpServer())
      .post(`/api/processes/${process.id}/start`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/processes/${process.id}/complete`)
      .set(auth())
      .expect(HttpStatus.CONFLICT);
  });

  it("aprova e rejeita documentos preservando a auditoria", async () => {
    const process = await createProcess();
    await request(app.getHttpServer())
      .post(`/api/processes/${process.id}/start`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    const documents = await prisma.studentDocument.findMany({
      where: { tenantId, studentId },
    });
    const rgRequirement = process.documents.find(
      (item) => item.documentType === "RG",
    )!;
    const proofRequirement = process.documents.find(
      (item) => item.documentType === "PROOF_OF_ADDRESS",
    )!;
    const rg = documents.find((item) => item.type === "RG")!;
    const proof = documents.find((item) => item.type === "PROOF_OF_ADDRESS")!;

    for (const [requirement, document] of [
      [rgRequirement, rg],
      [proofRequirement, proof],
    ] as const) {
      await request(app.getHttpServer())
        .post(`/api/processes/${process.id}/documents/${requirement.id}/link`)
        .set(auth())
        .send({ studentDocumentId: document.id })
        .expect(HttpStatus.CREATED);
      await request(app.getHttpServer())
        .post(`/api/processes/${process.id}/documents/${requirement.id}/submit`)
        .set(auth())
        .expect(HttpStatus.CREATED);
    }
    await request(app.getHttpServer())
      .post(
        `/api/processes/${process.id}/documents/${proofRequirement.id}/reject`,
      )
      .set(auth())
      .send({ reason: "Documento ilegível." })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(
        `/api/processes/${process.id}/documents/${rgRequirement.id}/approve`,
      )
      .set(auth())
      .expect(HttpStatus.CREATED);
    expect(
      await prisma.auditLog.count({
        where: {
          tenantId,
          entityType: "ProcessDocumentRequirement",
        },
      }),
    ).toBeGreaterThanOrEqual(5);
  });

  it("envia, vincula e lê arquivo sem permitir acesso cruzado", async () => {
    const process = await createProcess();
    const requirement = process.documents.find(
      (item) => item.documentType === "RG",
    )!;
    const content = Buffer.from("%PDF-1.4\n%%EOF\n");
    const response = await request(app.getHttpServer())
      .post(`/api/processes/${process.id}/documents/${requirement.id}/upload`)
      .set(auth())
      .send({
        fileName: "rg-e2e.pdf",
        mimeType: "application/pdf",
        sizeBytes: content.length,
        contentBase64: content.toString("base64"),
      })
      .expect(HttpStatus.CREATED);
    expect(response.body).toMatchObject({
      tenantId,
      processId: process.id,
      status: "SUBMITTED",
      studentDocument: { fileName: "rg-e2e.pdf" },
    });

    const fileResponse = await request(app.getHttpServer())
      .get(`/api/processes/${process.id}/documents/${requirement.id}/file`)
      .set(auth())
      .expect(HttpStatus.OK);
    const downloaded = fileResponse.body as { contentBase64: string };
    expect(Buffer.from(downloaded.contentBase64, "base64")).toEqual(content);
    await request(app.getHttpServer())
      .get(`/api/processes/${process.id}/documents/${requirement.id}/file`)
      .set(auth(otherToken))
      .expect(HttpStatus.NOT_FOUND);

    const stored = await prisma.studentDocument.findFirstOrThrow({
      where: { tenantId, studentId, fileName: "rg-e2e.pdf" },
      select: { storageKey: true },
    });
    if (stored.storageKey) {
      await unlink(
        join(cwd(), "var", "uploads", ...stored.storageKey.split("/")),
      ).catch(() => undefined);
    }
  });

  it("impede exame teórico e prático sem cargas e aprovação prévias", async () => {
    const process = await createProcess();
    await startAndWaiveDocuments(process.id);
    await updateStage(process.id, ProcessStageType.MEDICAL_EXAM);
    await updateStage(process.id, ProcessStageType.PSYCHOLOGICAL_EXAM);

    await request(app.getHttpServer())
      .post("/api/exams")
      .set(auth())
      .send({
        processId: process.id,
        unitId,
        type: "THEORETICAL",
        scheduledAt: future(),
      })
      .expect(HttpStatus.CONFLICT);
    await request(app.getHttpServer())
      .post("/api/exams")
      .set(auth())
      .send({
        processId: process.id,
        unitId,
        type: "PRACTICAL",
        scheduledAt: future(2),
      })
      .expect(HttpStatus.CONFLICT);

    await prisma.processStage.updateMany({
      where: {
        tenantId,
        processId: process.id,
        type: {
          in: [
            ProcessStageType.THEORETICAL_COURSE,
            ProcessStageType.THEORETICAL_EXAM,
          ],
        },
      },
      data: {
        status: ProcessStageStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await prisma.exam.create({
      data: {
        tenantId,
        processId: process.id,
        studentId,
        unitId,
        type: ExamType.THEORETICAL,
        status: ExamStatus.COMPLETED,
        result: ExamResult.APPROVED,
        scheduledAt: new Date(future(-4)),
        attemptNumber: 1,
        createdByUserId: userId,
        completedAt: new Date(),
      },
    });
    await request(app.getHttpServer())
      .post("/api/exams")
      .set(auth())
      .send({
        processId: process.id,
        unitId,
        type: "PRACTICAL",
        scheduledAt: future(4),
      })
      .expect(HttpStatus.CONFLICT);
  });

  it("impede exame quando o processo está suspenso", async () => {
    const process = await createProcess("RENEWAL");
    await startAndWaiveDocuments(process.id);
    await request(app.getHttpServer())
      .post(`/api/processes/${process.id}/suspend`)
      .set(auth())
      .send({ reason: "Pendência administrativa." })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post("/api/exams")
      .set(auth())
      .send({
        processId: process.id,
        unitId,
        type: "MEDICAL",
        scheduledAt: future(),
      })
      .expect(HttpStatus.CONFLICT);
  });

  it("cria nova tentativa, preserva reprovação e aprovação desbloqueia etapa", async () => {
    const process = await createProcess("RENEWAL");
    await startAndWaiveDocuments(process.id);
    const first = await request(app.getHttpServer())
      .post("/api/exams")
      .set(auth())
      .send({
        processId: process.id,
        unitId,
        type: "MEDICAL",
        scheduledAt: future(),
      })
      .expect(HttpStatus.CREATED);
    const firstId = (first.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/api/exams/${firstId}/confirm`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/exams/${firstId}/complete`)
      .set(auth())
      .send({ result: "FAILED", score: 30 })
      .expect(HttpStatus.CREATED);

    const second = await request(app.getHttpServer())
      .post("/api/exams")
      .set(auth())
      .send({
        processId: process.id,
        unitId,
        type: "MEDICAL",
        scheduledAt: future(3),
      })
      .expect(HttpStatus.CREATED);
    expect(second.body).toMatchObject({ attemptNumber: 2 });
    const secondId = (second.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/api/exams/${secondId}/confirm`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/exams/${secondId}/complete`)
      .set(auth())
      .send({ result: "APPROVED", score: 90 })
      .expect(HttpStatus.CREATED);

    expect(
      await prisma.exam.findUniqueOrThrow({ where: { id: firstId } }),
    ).toMatchObject({ result: ExamResult.FAILED, attemptNumber: 1 });
    const psychological = await prisma.processStage.findFirstOrThrow({
      where: {
        tenantId,
        processId: process.id,
        type: ProcessStageType.PSYCHOLOGICAL_EXAM,
      },
    });
    expect(psychological.status).toBe(ProcessStageStatus.AVAILABLE);
  });

  it("inclui exames na agenda, aplica filtros e gera timeline", async () => {
    const process = await createProcess("RENEWAL");
    await startAndWaiveDocuments(process.id);
    const exam = await request(app.getHttpServer())
      .post("/api/exams")
      .set(auth())
      .send({
        processId: process.id,
        unitId,
        type: "MEDICAL",
        scheduledAt: future(),
      })
      .expect(HttpStatus.CREATED);
    const examId = (exam.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/api/exams/${examId}/confirm`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/exams/${examId}/complete`)
      .set(auth())
      .send({ result: "APPROVED" })
      .expect(HttpStatus.CREATED);

    const schedule = await request(app.getHttpServer())
      .get("/api/schedule")
      .query({
        from: new Date(Date.now() + 29 * 24 * 60 * 60_000).toISOString(),
        to: new Date(Date.now() + 32 * 24 * 60 * 60_000).toISOString(),
        type: "EXAM",
        examType: "MEDICAL",
        result: "APPROVED",
      })
      .set(auth())
      .expect(HttpStatus.OK);
    expect(
      (schedule.body as { events: Array<{ type: string }> }).events,
    ).toEqual([expect.objectContaining({ type: "EXAM", result: "APPROVED" })]);
    const timeline = await request(app.getHttpServer())
      .get(`/api/processes/${process.id}/timeline`)
      .set(auth())
      .expect(HttpStatus.OK);
    expect((timeline.body as unknown[]).length).toBeGreaterThan(3);
  });
});
