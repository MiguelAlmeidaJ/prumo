import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  MembershipRole,
  RegistryStatus,
  TenantStatus,
  Weekday,
} from "@prumo/database";
import type { AuthResponse } from "@prumo/contracts";
import { hash } from "bcrypt";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

const EMAIL = "schedule-e2e@prumo.local";
const LIMITED_EMAIL = "schedule-limited-e2e@prumo.local";
const PASSWORD = "ScheduleE2E@123";
const SLUGS = ["schedule-e2e-primary", "schedule-e2e-secondary"];
const DAY = "2035-01-08";

describe("Agenda operacional multi-tenant (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let tenantId: string;
  let otherTenantId: string;
  let token: string;
  let unitId: string;
  let classroomId: string;
  let instructorId: string;
  let instructor2Id: string;
  let vehicleId: string;
  let vehicle2Id: string;
  let studentId: string;
  let student2Id: string;
  let foreignUnitId: string;

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
      where: { email: { in: [EMAIL, LIMITED_EMAIL] } },
    });
    const [tenant, other] = await Promise.all(
      SLUGS.map((slug, index) =>
        prisma.tenant.create({
          data: {
            name: `Agenda ${index}`,
            slug,
            status: TenantStatus.ACTIVE,
          },
        }),
      ),
    );
    tenantId = tenant.id;
    otherTenantId = other.id;
    await prisma.user.create({
      data: {
        name: "Agenda E2E",
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
    await prisma.user.create({
      data: {
        name: "Agenda sem passado",
        email: LIMITED_EMAIL,
        passwordHash: await hash(PASSWORD, 10),
        memberships: {
          create: {
            tenantId,
            role: MembershipRole.SECRETARY,
          },
        },
      },
    });
  }, 30_000);

  beforeEach(async () => {
    const tenantFilter = {
      tenantId: { in: [tenantId, otherTenantId] },
    };
    await prisma.auditLog.deleteMany({ where: tenantFilter });
    await prisma.theoreticalClassStudent.deleteMany({ where: tenantFilter });
    await prisma.theoreticalClass.deleteMany({ where: tenantFilter });
    await prisma.lesson.deleteMany({ where: tenantFilter });
    await prisma.scheduleBlock.deleteMany({ where: tenantFilter });
    await prisma.instructorAvailability.deleteMany({ where: tenantFilter });
    await prisma.classroom.deleteMany({ where: tenantFilter });
    await prisma.schoolUnit.deleteMany({ where: tenantFilter });
    await prisma.student.deleteMany({ where: tenantFilter });
    await prisma.instructor.deleteMany({ where: tenantFilter });
    await prisma.vehicle.deleteMany({ where: tenantFilter });

    const authenticated = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(HttpStatus.OK);
    token = (authenticated.body as AuthResponse).accessToken;

    const unit = await prisma.schoolUnit.create({
      data: {
        tenantId,
        name: "Centro",
        phone: "1133330000",
        email: "centro@test.local",
        address: "Rua Teste, 10",
        openingTime: "07:00",
        closingTime: "20:00",
      },
    });
    unitId = unit.id;
    const classrooms = await Promise.all(
      ["Sala 1", "Sala 2"].map((name) =>
        prisma.classroom.create({
          data: {
            tenantId,
            unitId,
            name,
            capacity: name === "Sala 1" ? 1 : 20,
          },
        }),
      ),
    );
    classroomId = classrooms[0].id;
    const instructors = await Promise.all(
      [1, 2].map((number) =>
        prisma.instructor.create({
          data: {
            tenantId,
            name: `Instrutor ${number}`,
            cpf: `1000000000${number}`,
            license: `LIC${number}`,
            licenseCategory: "B",
            status: RegistryStatus.ACTIVE,
          },
        }),
      ),
    );
    [instructorId, instructor2Id] = instructors.map(({ id }) => id);
    const vehicles = await Promise.all(
      [1, 2].map((number) =>
        prisma.vehicle.create({
          data: {
            tenantId,
            plate: `E2E${number}A00`,
            brand: "Marca",
            model: `Modelo ${number}`,
            year: 2030,
            category: "B",
            status: RegistryStatus.ACTIVE,
          },
        }),
      ),
    );
    [vehicleId, vehicle2Id] = vehicles.map(({ id }) => id);
    const students = await Promise.all(
      [1, 2].map((number) =>
        prisma.student.create({
          data: {
            tenantId,
            name: `Aluno ${number}`,
            cpf: `2000000000${number}`,
            status: RegistryStatus.ACTIVE,
          },
        }),
      ),
    );
    [studentId, student2Id] = students.map(({ id }) => id);
    await prisma.instructorAvailability.createMany({
      data: [instructorId, instructor2Id].map((id) => ({
        tenantId,
        instructorId: id,
        weekday: Weekday.MONDAY,
        startsAt: "08:00",
        endsAt: "18:00",
      })),
    });
    foreignUnitId = (
      await prisma.schoolUnit.create({
        data: {
          tenantId: otherTenantId,
          name: "Outra",
          phone: "1133339999",
          email: "outra@test.local",
          address: "Rua Outro tenant",
          openingTime: "07:00",
          closingTime: "20:00",
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
      await prisma.user.deleteMany({
        where: { email: { in: [EMAIL, LIMITED_EMAIL] } },
      });
    }
    if (app) await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const practical = (overrides: Record<string, unknown> = {}) => ({
    unitId,
    studentId,
    instructorId,
    vehicleId,
    startsAt: `${DAY}T09:00:00.000Z`,
    endsAt: `${DAY}T10:00:00.000Z`,
    ...overrides,
  });
  const theoretical = (overrides: Record<string, unknown> = {}) => ({
    unitId,
    classroomId,
    instructorId,
    title: "Legislação",
    startsAt: `${DAY}T14:00:00.000Z`,
    endsAt: `${DAY}T15:00:00.000Z`,
    capacity: 1,
    ...overrides,
  });

  it("faz CRUD, busca, paginação e status de unidades e salas", async () => {
    const createdUnit = await request(app.getHttpServer())
      .post("/api/units")
      .set(auth())
      .send({
        name: "Unidade Norte",
        phone: "1133334444",
        email: "norte@test.local",
        address: "Rua Norte, 20",
        openingTime: "08:00",
        closingTime: "19:00",
      })
      .expect(HttpStatus.CREATED);
    const newUnitId = (createdUnit.body as { id: string }).id;
    const listed = await request(app.getHttpServer())
      .get("/api/units")
      .query({ search: "Norte", page: 1, pageSize: 1 })
      .set(auth())
      .expect(HttpStatus.OK);
    expect((listed.body as { data: unknown[] }).data).toHaveLength(1);
    await request(app.getHttpServer())
      .patch(`/api/units/${newUnitId}/status`)
      .set(auth())
      .send({ active: false })
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .patch(`/api/units/${newUnitId}`)
      .set(auth())
      .send({ phone: "1199990000" })
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .delete(`/api/units/${newUnitId}`)
      .set(auth())
      .expect(HttpStatus.NO_CONTENT);

    const room = await request(app.getHttpServer())
      .post("/api/classrooms")
      .set(auth())
      .send({ unitId, name: "Laboratório", capacity: 12 })
      .expect(HttpStatus.CREATED);
    const roomId = (room.body as { id: string }).id;
    await request(app.getHttpServer())
      .get("/api/classrooms")
      .query({ unitId, search: "Labor", page: 1, pageSize: 1 })
      .set(auth())
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .patch(`/api/classrooms/${roomId}/status`)
      .set(auth())
      .send({ active: false })
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .delete(`/api/classrooms/${roomId}`)
      .set(auth())
      .expect(HttpStatus.NO_CONTENT);
    await request(app.getHttpServer())
      .post("/api/classrooms")
      .set(auth())
      .send({ unitId: foreignUnitId, name: "Inválida", capacity: 10 })
      .expect(HttpStatus.NOT_FOUND);
  });

  it("aceita múltiplas disponibilidades e rejeita faixa inválida ou sobreposta", async () => {
    await request(app.getHttpServer())
      .post("/api/instructor-availabilities")
      .set(auth())
      .send({
        instructorId,
        weekday: "MONDAY",
        startsAt: "18:00",
        endsAt: "19:00",
      })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post("/api/instructor-availabilities")
      .set(auth())
      .send({
        instructorId,
        weekday: "MONDAY",
        startsAt: "17:30",
        endsAt: "18:30",
      })
      .expect(HttpStatus.CONFLICT);
    await request(app.getHttpServer())
      .post("/api/instructor-availabilities")
      .set(auth())
      .send({
        instructorId,
        weekday: "TUESDAY",
        startsAt: "12:00",
        endsAt: "11:00",
      })
      .expect(HttpStatus.CONFLICT);
  });

  it("exige exatamente o recurso do tipo do bloqueio", async () => {
    await request(app.getHttpServer())
      .post("/api/schedule-blocks")
      .set(auth())
      .send({
        resourceType: "VEHICLE",
        vehicleId,
        instructorId,
        startsAt: `${DAY}T08:00:00.000Z`,
        endsAt: `${DAY}T09:00:00.000Z`,
        reason: "Inválido",
      })
      .expect(HttpStatus.BAD_REQUEST);
    await request(app.getHttpServer())
      .post("/api/schedule-blocks")
      .set(auth())
      .send({
        resourceType: "UNIT",
        unitId: foreignUnitId,
        startsAt: `${DAY}T08:00:00.000Z`,
        endsAt: `${DAY}T09:00:00.000Z`,
        reason: "Outro tenant",
      })
      .expect(HttpStatus.NOT_FOUND);
  });

  it("permite passado apenas a quem possui a permissão explícita", async () => {
    const past = practical({
      startsAt: "2025-01-06T09:00:00.000Z",
      endsAt: "2025-01-06T10:00:00.000Z",
    });
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(past)
      .expect(HttpStatus.CREATED);
    const limitedLogin = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: LIMITED_EMAIL, password: PASSWORD })
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(
        "Authorization",
        `Bearer ${(limitedLogin.body as AuthResponse).accessToken}`,
      )
      .send(
        practical({
          studentId: student2Id,
          instructorId: instructor2Id,
          vehicleId: vehicle2Id,
          startsAt: "2025-01-06T10:00:00.000Z",
          endsAt: "2025-01-06T11:00:00.000Z",
        }),
      )
      .expect(HttpStatus.FORBIDDEN);
  });

  it.each([
    ["aluno", () => ({ instructorId: instructor2Id, vehicleId: vehicle2Id })],
    ["instrutor", () => ({ studentId: student2Id, vehicleId: vehicle2Id })],
    ["veículo", () => ({ studentId: student2Id, instructorId: instructor2Id })],
  ])("rejeita conflito de %s", async (_resource, changes) => {
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(practical())
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(practical(changes()))
      .expect(HttpStatus.CONFLICT);
  });

  it("aceita somente uma de duas reservas concorrentes", async () => {
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post("/api/practical-lessons")
        .set(auth())
        .send(practical()),
      request(app.getHttpServer())
        .post("/api/practical-lessons")
        .set(auth())
        .send(practical()),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    expect(
      await prisma.lesson.count({
        where: {
          tenantId,
          studentId,
          startsAt: new Date(`${DAY}T09:00:00.000Z`),
        },
      }),
    ).toBe(1);
  });

  it("rejeita conflito de sala em turma teórica", async () => {
    await request(app.getHttpServer())
      .post("/api/theoretical-classes")
      .set(auth())
      .send(theoretical())
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post("/api/theoretical-classes")
      .set(auth())
      .send(
        theoretical({
          instructorId: instructor2Id,
          title: "Direção defensiva",
        }),
      )
      .expect(HttpStatus.CONFLICT);
  });

  it("respeita bloqueio exato de recurso", async () => {
    await request(app.getHttpServer())
      .post("/api/schedule-blocks")
      .set(auth())
      .send({
        resourceType: "VEHICLE",
        vehicleId,
        startsAt: `${DAY}T08:30:00.000Z`,
        endsAt: `${DAY}T10:30:00.000Z`,
        reason: "Manutenção",
      })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(practical())
      .expect(HttpStatus.CONFLICT);
  });

  it("rejeita indisponibilidade do instrutor e horário da unidade", async () => {
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(
        practical({
          startsAt: `${DAY}T07:00:00.000Z`,
          endsAt: `${DAY}T08:00:00.000Z`,
        }),
      )
      .expect(HttpStatus.CONFLICT);
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(
        practical({
          startsAt: `${DAY}T20:00:00.000Z`,
          endsAt: `${DAY}T21:00:00.000Z`,
        }),
      )
      .expect(HttpStatus.CONFLICT);
  });

  it("impede recurso e leitura entre tenants", async () => {
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(practical({ unitId: foreignUnitId }))
      .expect(HttpStatus.NOT_FOUND);
    await request(app.getHttpServer())
      .get(`/api/units/${foreignUnitId}`)
      .set(auth())
      .expect(HttpStatus.NOT_FOUND);
  });

  it("valida transições e reagenda em transação", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(practical())
      .expect(HttpStatus.CREATED);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/api/practical-lessons/${id}/complete`)
      .set(auth())
      .expect(HttpStatus.CONFLICT);
    const response = await request(app.getHttpServer())
      .post(`/api/practical-lessons/${id}/reschedule`)
      .set(auth())
      .send({
        startsAt: `${DAY}T10:00:00.000Z`,
        endsAt: `${DAY}T11:00:00.000Z`,
      })
      .expect(HttpStatus.CREATED);
    expect(response.body).toMatchObject({ status: "PENDING" });
    expect(
      await prisma.lesson.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ status: "RESCHEDULED" });
  });

  it("impede duas transições concorrentes sobre a mesma aula", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(practical())
      .expect(HttpStatus.CREATED);
    const id = (created.body as { id: string }).id;

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/practical-lessons/${id}/confirm`)
        .set(auth()),
      request(app.getHttpServer())
        .post(`/api/practical-lessons/${id}/confirm`)
        .set(auth()),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    const final = await prisma.lesson.findUniqueOrThrow({ where: { id } });
    expect(final.status).toBe("CONFIRMED");
  });

  it("valida capacidade, duplicidade e conflito simultâneo de aluno", async () => {
    await request(app.getHttpServer())
      .post("/api/theoretical-classes")
      .set(auth())
      .send(theoretical({ capacity: 2 }))
      .expect(HttpStatus.CONFLICT);
    const created = await request(app.getHttpServer())
      .post("/api/theoretical-classes")
      .set(auth())
      .send(theoretical({ studentIds: [studentId] }))
      .expect(HttpStatus.CREATED);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/api/theoretical-classes/${id}/students`)
      .set(auth())
      .send({ studentId })
      .expect(HttpStatus.CONFLICT);
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(
        practical({
          studentId,
          instructorId: instructor2Id,
          vehicleId: vehicle2Id,
          startsAt: `${DAY}T14:30:00.000Z`,
          endsAt: `${DAY}T15:30:00.000Z`,
        }),
      )
      .expect(HttpStatus.CONFLICT);
  });

  it("filtra a agenda unificada e omite slots ocupados", async () => {
    await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(practical())
      .expect(HttpStatus.CREATED);
    const schedule = await request(app.getHttpServer())
      .get("/api/schedule")
      .query({
        from: `${DAY}T08:00:00.000Z`,
        to: `${DAY}T18:00:00.000Z`,
        type: "PRACTICAL_LESSON",
        studentId,
      })
      .set(auth())
      .expect(HttpStatus.OK);
    const scheduleBody = schedule.body as {
      events: { type: string }[];
    };
    expect(scheduleBody.events).toHaveLength(1);
    expect(scheduleBody.events[0]).toMatchObject({
      type: "PRACTICAL_LESSON",
    });

    const availability = await request(app.getHttpServer())
      .get("/api/schedule/availability")
      .query({
        from: `${DAY}T08:00:00.000Z`,
        to: `${DAY}T12:00:00.000Z`,
        durationMinutes: 60,
        unitId,
        instructorId,
        vehicleId,
      })
      .set(auth())
      .expect(HttpStatus.OK);
    const availabilityBody = availability.body as {
      slots: { startsAt: string }[];
    };
    const starts = availabilityBody.slots.map(({ startsAt }) => startsAt);
    expect(starts).not.toContain(`${DAY}T09:00:00.000Z`);
    expect(starts).toContain(`${DAY}T10:00:00.000Z`);
  });

  it("audita criação e mudanças de estado", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/practical-lessons")
      .set(auth())
      .send(practical())
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(
        `/api/practical-lessons/${(created.body as { id: string }).id}/confirm`,
      )
      .set(auth())
      .expect(HttpStatus.CREATED);
    expect(
      await prisma.auditLog.count({
        where: { tenantId, entityType: "PracticalLesson" },
      }),
    ).toBe(2);
  });
});
