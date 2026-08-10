import type { AuthResponse } from "@prumo/contracts";
import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AttendanceStatus,
  LessonStatus,
  MembershipRole,
  RegistryStatus,
  TenantStatus,
} from "@prisma/client";
import { hash } from "bcrypt";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const PASSWORD = "MobileE2E@123";
const SLUG = "mobile-strengthening-e2e";
const STUDENT_EMAIL = "mobile-student-e2e@prumo.local";
const INSTRUCTOR_EMAIL = "mobile-instructor-e2e@prumo.local";

describe("Aplicativo mobile (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let tenantId: string;
  let studentToken: string;
  let instructorToken: string;
  let studentId: string;
  let unlinkedStudentId: string;
  let lessonId: string;
  let theoreticalClassId: string;
  let vehicleId: string;
  let uploadDir: string;

  const auth = (token: string) => ({
    Authorization: `Bearer ${token}`,
  });

  beforeAll(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), "prumo-mobile-e2e-"));
    process.env.MOBILE_UPLOAD_DIR = uploadDir;
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

    await prisma.tenant.deleteMany({ where: { slug: SLUG } });
    await prisma.user.deleteMany({
      where: { email: { in: [STUDENT_EMAIL, INSTRUCTOR_EMAIL] } },
    });

    const tenant = await prisma.tenant.create({
      data: {
        name: "Mobile E2E",
        slug: SLUG,
        status: TenantStatus.ACTIVE,
      },
    });
    tenantId = tenant.id;
    const passwordHash = await hash(PASSWORD, 10);
    const [studentUser, instructorUser] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Aluno Mobile",
          email: STUDENT_EMAIL,
          passwordHash,
          memberships: {
            create: { tenantId, role: MembershipRole.STUDENT },
          },
        },
      }),
      prisma.user.create({
        data: {
          name: "Instrutor Mobile",
          email: INSTRUCTOR_EMAIL,
          passwordHash,
          memberships: {
            create: { tenantId, role: MembershipRole.INSTRUCTOR },
          },
        },
      }),
    ]);
    const unit = await prisma.schoolUnit.create({
      data: {
        tenantId,
        name: "Unidade Mobile",
        phone: "11999999999",
        email: "mobile-unit@prumo.local",
        address: "Rua Mobile, 1",
        openingTime: "07:00",
        closingTime: "22:00",
      },
    });
    const classroom = await prisma.classroom.create({
      data: {
        tenantId,
        unitId: unit.id,
        name: "Sala Mobile",
        capacity: 20,
      },
    });
    const [student, unlinkedStudent, instructor, vehicle] = await Promise.all([
      prisma.student.create({
        data: {
          tenantId,
          userId: studentUser.id,
          name: "Aluno Mobile",
          cpf: "11111111111",
          email: STUDENT_EMAIL,
          status: RegistryStatus.ACTIVE,
        },
      }),
      prisma.student.create({
        data: {
          tenantId,
          name: "Aluno Não Vinculado",
          cpf: "22222222222",
          status: RegistryStatus.ACTIVE,
        },
      }),
      prisma.instructor.create({
        data: {
          tenantId,
          userId: instructorUser.id,
          name: "Instrutor Mobile",
          cpf: "33333333333",
          email: INSTRUCTOR_EMAIL,
          status: RegistryStatus.ACTIVE,
        },
      }),
      prisma.vehicle.create({
        data: {
          tenantId,
          plate: "MOB1A23",
          model: "Veículo Mobile",
          status: RegistryStatus.ACTIVE,
        },
      }),
    ]);
    studentId = student.id;
    unlinkedStudentId = unlinkedStudent.id;
    vehicleId = vehicle.id;
    const lesson = await prisma.lesson.create({
      data: {
        tenantId,
        unitId: unit.id,
        studentId: student.id,
        instructorId: instructor.id,
        vehicleId: vehicle.id,
        status: LessonStatus.CONFIRMED,
        startsAt: new Date("2036-03-10T12:00:00.000Z"),
        endsAt: new Date("2036-03-10T13:00:00.000Z"),
        notes: "OBSERVAÇÃO INTERNA",
        studentNotes: "Observação visível",
        createdByUserId: instructorUser.id,
      },
    });
    lessonId = lesson.id;
    const theoreticalClass = await prisma.theoreticalClass.create({
      data: {
        tenantId,
        unitId: unit.id,
        classroomId: classroom.id,
        instructorId: instructor.id,
        title: "Turma Mobile",
        startsAt: new Date("2036-03-11T12:00:00.000Z"),
        endsAt: new Date("2036-03-11T14:00:00.000Z"),
        capacity: 20,
        status: LessonStatus.CONFIRMED,
        createdByUserId: instructorUser.id,
        students: {
          create: {
            studentId: student.id,
          },
        },
      },
    });
    theoreticalClassId = theoreticalClass.id;

    const [studentLogin, instructorLogin] = await Promise.all([
      request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: STUDENT_EMAIL, password: PASSWORD }),
      request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: INSTRUCTOR_EMAIL, password: PASSWORD }),
    ]);
    studentToken = (studentLogin.body as AuthResponse).accessToken;
    instructorToken = (instructorLogin.body as AuthResponse).accessToken;
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.tenant.deleteMany({ where: { slug: SLUG } });
      await prisma.user.deleteMany({
        where: { email: { in: [STUDENT_EMAIL, INSTRUCTOR_EMAIL] } },
      });
    }
    if (app) await app.close();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
    delete process.env.MOBILE_UPLOAD_DIR;
  });

  it("entrega homes por perfil e bloqueia a rota incompatível", async () => {
    const home = await request(app.getHttpServer())
      .get("/api/mobile/student/home")
      .set(auth(studentToken))
      .expect(HttpStatus.OK);
    const homeBody = home.body as {
      profile: { id: string };
      nextLesson: { id: string };
    };
    expect(homeBody.profile).toMatchObject({ id: studentId });
    expect(homeBody.nextLesson).toMatchObject({ id: lessonId });

    await request(app.getHttpServer())
      .get("/api/mobile/instructor/home")
      .set(auth(studentToken))
      .expect(HttpStatus.FORBIDDEN);
    await request(app.getHttpServer())
      .get("/api/mobile/student/schedule?status=INVALID")
      .set(auth(studentToken))
      .expect(HttpStatus.BAD_REQUEST);
  });

  it("bloqueia o instrutor nos endpoints administrativos gerais", async () => {
    const session = await request(app.getHttpServer())
      .get("/api/mobile/session")
      .set(auth(instructorToken))
      .expect(HttpStatus.OK);

    expect((session.body as { permissions: string[] }).permissions).not.toEqual(
      expect.arrayContaining([
        "students.read",
        "schedule.read",
        "financial.dashboard.read",
        "practical-lessons.status",
      ]),
    );
    await request(app.getHttpServer())
      .get("/api/students")
      .set(auth(instructorToken))
      .expect(HttpStatus.FORBIDDEN);
    await request(app.getHttpServer())
      .get("/api/financial/dashboard")
      .set(auth(instructorToken))
      .expect(HttpStatus.FORBIDDEN);
  });

  it("não expõe observação interna e cria solicitação sem reagendar", async () => {
    const lesson = await request(app.getHttpServer())
      .get(`/api/mobile/student/lessons/${lessonId}`)
      .set(auth(studentToken))
      .expect(HttpStatus.OK);
    const lessonBody = lesson.body as {
      notes?: string;
      studentNotes: string;
    };
    expect(lessonBody.notes).toBeUndefined();
    expect(lessonBody.studentNotes).toBe("Observação visível");

    await request(app.getHttpServer())
      .post(`/api/mobile/student/lessons/${lessonId}/change-requests`)
      .set(auth(studentToken))
      .send({ type: "CANCEL", reason: "Não poderei comparecer." })
      .expect(HttpStatus.CREATED);
    expect(
      await prisma.lessonChangeRequest.count({
        where: { tenantId, lessonId },
      }),
    ).toBe(1);
    expect(
      await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } }),
    ).toMatchObject({ status: LessonStatus.CONFIRMED });
  });

  it("consome um token de upload uma única vez sob concorrência", async () => {
    const content = Buffer.from("%PDF-1.4\narquivo e2e");
    const ticket = await request(app.getHttpServer())
      .post("/api/mobile/student/documents/upload-url")
      .set(auth(studentToken))
      .send({
        documentType: "OTHER",
        fileName: "arquivo-e2e.pdf",
        mimeType: "application/pdf",
        sizeBytes: content.length,
      })
      .expect(HttpStatus.CREATED);
    const uploadPath = (ticket.body as { uploadUrl: string }).uploadUrl;

    const responses = await Promise.all([
      request(app.getHttpServer())
        .put(`/api${uploadPath}`)
        .set(auth(studentToken))
        .send({ contentBase64: content.toString("base64") }),
      request(app.getHttpServer())
        .put(`/api${uploadPath}`)
        .set(auth(studentToken))
        .send({ contentBase64: content.toString("base64") }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([
      HttpStatus.OK,
      HttpStatus.CONFLICT,
    ]);
    expect(
      await prisma.studentDocument.count({
        where: {
          tenantId,
          studentId,
          fileName: "arquivo-e2e.pdf",
        },
      }),
    ).toBe(1);
  });

  it("inicia, conclui e avalia aula com idempotência", async () => {
    const key = "mobile-e2e-start-idempotent";
    const first = await request(app.getHttpServer())
      .post(`/api/mobile/instructor/lessons/${lessonId}/start`)
      .set({ ...auth(instructorToken), "Idempotency-Key": key })
      .send({ odometerKm: 100 })
      .expect(HttpStatus.CREATED);
    const duplicate = await request(app.getHttpServer())
      .post(`/api/mobile/instructor/lessons/${lessonId}/start`)
      .set({ ...auth(instructorToken), "Idempotency-Key": key })
      .send({ odometerKm: 100 })
      .expect(HttpStatus.CREATED);
    expect((duplicate.body as { id: string }).id).toBe(
      (first.body as { id: string }).id,
    );
    expect(
      await prisma.mobileOperation.count({
        where: { tenantId, idempotencyKey: key },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .post(`/api/mobile/instructor/lessons/${lessonId}/complete`)
      .set({
        ...auth(instructorToken),
        "Idempotency-Key": "mobile-e2e-complete",
      })
      .send({ odometerKm: 115, studentNotes: "Boa evolução." })
      .expect(HttpStatus.CREATED);

    const evaluation = {
      control: "GOOD",
      attention: "GOOD",
      signaling: "GOOD",
      parking: "SATISFACTORY",
      gearShift: "GOOD",
      trafficRules: "GOOD",
      confidence: "SATISFACTORY",
      overallRating: "GOOD",
      notes: "Continuar praticando baliza.",
      visibleToStudent: true,
    };
    await request(app.getHttpServer())
      .put(`/api/mobile/instructor/lessons/${lessonId}/evaluation`)
      .set({
        ...auth(instructorToken),
        "Idempotency-Key": "mobile-e2e-evaluation",
      })
      .send(evaluation)
      .expect(HttpStatus.OK);
    expect(
      await prisma.lessonEvaluation.count({
        where: { tenantId, lessonId },
      }),
    ).toBe(1);
  });

  it("registra presença em lote e conclui turma teórica", async () => {
    await request(app.getHttpServer())
      .post(
        `/api/mobile/instructor/theoretical-classes/${theoreticalClassId}/start`,
      )
      .set({
        ...auth(instructorToken),
        "Idempotency-Key": "mobile-e2e-theoretical-start",
      })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .put(
        `/api/mobile/instructor/theoretical-classes/${theoreticalClassId}/attendance`,
      )
      .set({
        ...auth(instructorToken),
        "Idempotency-Key": "mobile-e2e-attendance",
      })
      .send({
        attendance: [{ studentId, status: AttendanceStatus.PRESENT }],
      })
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .post(
        `/api/mobile/instructor/theoretical-classes/${theoreticalClassId}/complete`,
      )
      .set({
        ...auth(instructorToken),
        "Idempotency-Key": "mobile-e2e-theoretical-complete",
      })
      .expect(HttpStatus.CREATED);
  });

  it("restringe alunos vinculados e registra ocorrência do veículo", async () => {
    await request(app.getHttpServer())
      .get(`/api/mobile/instructor/students/${unlinkedStudentId}`)
      .set(auth(instructorToken))
      .expect(HttpStatus.NOT_FOUND);

    await request(app.getHttpServer())
      .post(`/api/mobile/instructor/vehicles/${vehicleId}/occurrences`)
      .set({
        ...auth(instructorToken),
        "Idempotency-Key": "mobile-e2e-occurrence",
      })
      .send({
        type: "MECHANICAL_PROBLEM",
        description: "Ruído durante a condução.",
        occurredAt: "2036-03-10T13:00:00.000Z",
        lessonId,
      })
      .expect(HttpStatus.CREATED);
    expect(
      await prisma.vehicleOccurrence.count({
        where: { tenantId, vehicleId },
      }),
    ).toBe(1);
  });
});
