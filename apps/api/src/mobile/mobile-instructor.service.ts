import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LessonStatus,
  LessonType,
  Prisma,
  VehicleOccurrenceStatus,
} from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../schedule/audit.service";
import { TheoreticalClassesService } from "../schedule/theoretical-classes.service";
import {
  BulkAttendanceDto,
  CompleteLessonMobileDto,
  LessonEvaluationDto,
  MobileRangeQueryDto,
  StartLessonMobileDto,
  VehicleOccurrenceDto,
} from "./dto/mobile.dto";
import { MobileAccessService } from "./mobile-access.service";

function range(query: MobileRangeQueryDto) {
  return {
    gte: query.from ? new Date(query.from) : undefined,
    lte: query.to ? new Date(query.to) : undefined,
  };
}

function lessonStatus(value?: string): LessonStatus | undefined {
  if (!value) return undefined;
  if (!Object.values(LessonStatus).includes(value as LessonStatus)) {
    throw new BadRequestException("Status de aula inválido.");
  }
  return value as LessonStatus;
}

const lessonSelect = {
  id: true,
  type: true,
  status: true,
  startsAt: true,
  endsAt: true,
  startOdometerKm: true,
  endOdometerKm: true,
  studentNotes: true,
  completedAt: true,
  student: { select: { id: true, name: true, socialName: true } },
  vehicle: {
    select: { id: true, plate: true, brand: true, model: true, category: true },
  },
  unit: { select: { id: true, name: true, address: true } },
  evaluation: true,
} satisfies Prisma.LessonSelect;

@Injectable()
export class MobileInstructorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MobileAccessService,
    private readonly audit: AuditService,
    private readonly theoreticalClasses: TheoreticalClassesService,
  ) {}

  async home(user: AuthenticatedUser) {
    const instructor = await this.access.instructor(user);
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const [lessons, classes, unreadNotifications] = await Promise.all([
      this.prisma.lesson.findMany({
        where: {
          tenantId: user.tenantId,
          instructorId: instructor.id,
          startsAt: { gte: start, lt: end },
        },
        select: lessonSelect,
        orderBy: { startsAt: "asc" },
      }),
      this.prisma.theoreticalClass.findMany({
        where: {
          tenantId: user.tenantId,
          instructorId: instructor.id,
          startsAt: { gte: start, lt: end },
        },
        select: {
          id: true,
          title: true,
          status: true,
          startsAt: true,
          endsAt: true,
          classroom: { select: { name: true } },
          unit: { select: { name: true, address: true } },
          _count: { select: { students: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
      this.prisma.notification.count({
        where: {
          tenantId: user.tenantId,
          userId: user.id,
          readAt: null,
          archivedAt: null,
        },
      }),
    ]);
    const agenda = [
      ...lessons.map((item) => ({
        ...item,
        kind: "PRACTICAL_LESSON" as const,
        title: `Aula com ${item.student.socialName ?? item.student.name}`,
      })),
      ...classes.map((item) => ({
        ...item,
        kind: "THEORETICAL_CLASS" as const,
      })),
    ].sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    return {
      profile: instructor,
      agenda,
      nextAppointment:
        agenda.find((item) => new Date(item.endsAt) >= new Date()) ?? null,
      summary: {
        total: agenda.length,
        completed: agenda.filter((item) => item.status === LessonStatus.COMPLETED)
          .length,
        pending: agenda.filter(
          (item) =>
            item.status === LessonStatus.PENDING ||
            item.status === LessonStatus.CONFIRMED,
        ).length,
      },
      unreadNotifications,
    };
  }

  async schedule(user: AuthenticatedUser, query: MobileRangeQueryDto) {
    const instructor = await this.access.instructor(user);
    const dates = range(query);
    const status = lessonStatus(query.status);
    const [lessons, classes] = await Promise.all([
      this.prisma.lesson.findMany({
        where: {
          tenantId: user.tenantId,
          instructorId: instructor.id,
          startsAt: dates,
          status,
        },
        select: lessonSelect,
      }),
      this.prisma.theoreticalClass.findMany({
        where: {
          tenantId: user.tenantId,
          instructorId: instructor.id,
          startsAt: dates,
          status,
        },
        select: {
          id: true,
          title: true,
          status: true,
          startsAt: true,
          endsAt: true,
          classroom: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, address: true } },
          _count: { select: { students: true } },
        },
      }),
    ]);
    return [
      ...lessons.map((item) => ({
        ...item,
        kind: "PRACTICAL_LESSON" as const,
        title: `Aula com ${item.student.socialName ?? item.student.name}`,
      })),
      ...classes.map((item) => ({
        ...item,
        kind: "THEORETICAL_CLASS" as const,
      })),
    ]
      .filter((item) => !query.type || item.kind === query.type)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
  }

  async scheduleItem(user: AuthenticatedUser, id: string) {
    const item = (await this.schedule(user, {})).find(
      (candidate) => candidate.id === id,
    );
    if (!item) throw new NotFoundException("Compromisso não encontrado.");
    return item;
  }

  async lessons(user: AuthenticatedUser, query: MobileRangeQueryDto) {
    const instructor = await this.access.instructor(user);
    return this.prisma.lesson.findMany({
      where: {
        tenantId: user.tenantId,
        instructorId: instructor.id,
        type: LessonType.PRACTICAL,
        startsAt: range(query),
        status: lessonStatus(query.status),
      },
      select: lessonSelect,
      orderBy: { startsAt: "desc" },
    });
  }

  async lesson(user: AuthenticatedUser, id: string) {
    const instructor = await this.access.instructor(user);
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        instructorId: instructor.id,
        type: LessonType.PRACTICAL,
      },
      select: lessonSelect,
    });
    if (!lesson) throw new NotFoundException("Aula não encontrada.");
    return lesson;
  }

  async startLesson(
    user: AuthenticatedUser,
    id: string,
    input: StartLessonMobileDto,
    idempotencyKey?: string,
  ) {
    await this.lesson(user, id);
    return this.access.idempotent(
      user,
      idempotencyKey,
      "INSTRUCTOR_START_LESSON",
      id,
      async () =>
        this.prisma.$transaction(async (tx) => {
          const current = await tx.lesson.findFirst({
            where: { id, tenantId: user.tenantId },
          });
          if (current?.status !== LessonStatus.CONFIRMED) {
            throw new ConflictException("A aula precisa estar confirmada.");
          }
          const updated = await tx.lesson.update({
            where: { id },
            data: {
              status: LessonStatus.IN_PROGRESS,
              startOdometerKm: input.odometerKm,
            },
            select: lessonSelect,
          });
          await this.audit.record(tx, {
            tenantId: user.tenantId,
            entityType: "PracticalLesson",
            entityId: id,
            action: "MOBILE_STARTED",
            actorUserId: user.id,
            before: current,
            after: updated,
          });
          return updated;
        }),
    );
  }

  async completeLesson(
    user: AuthenticatedUser,
    id: string,
    input: CompleteLessonMobileDto,
    idempotencyKey?: string,
  ) {
    const owned = await this.lesson(user, id);
    if (
      owned.startOdometerKm !== null &&
      input.odometerKm < owned.startOdometerKm
    ) {
      throw new ConflictException(
        "A quilometragem final não pode ser menor que a inicial.",
      );
    }
    return this.access.idempotent(
      user,
      idempotencyKey,
      "INSTRUCTOR_COMPLETE_LESSON",
      id,
      async () =>
        this.prisma.$transaction(async (tx) => {
          const current = await tx.lesson.findFirst({
            where: { id, tenantId: user.tenantId },
          });
          if (current?.status !== LessonStatus.IN_PROGRESS) {
            throw new ConflictException("A aula precisa estar em andamento.");
          }
          if (
            current.startOdometerKm !== null &&
            input.odometerKm < current.startOdometerKm
          ) {
            throw new ConflictException(
              "A quilometragem final não pode ser menor que a inicial.",
            );
          }
          const updated = await tx.lesson.update({
            where: { id },
            data: {
              status: LessonStatus.COMPLETED,
              completedAt: new Date(),
              endOdometerKm: input.odometerKm,
              studentNotes: input.studentNotes?.trim() || null,
            },
            select: lessonSelect,
          });
          await this.audit.record(tx, {
            tenantId: user.tenantId,
            entityType: "PracticalLesson",
            entityId: id,
            action: "MOBILE_COMPLETED",
            actorUserId: user.id,
            before: current,
            after: updated,
          });
          return updated;
        }),
    );
  }

  async noShow(
    user: AuthenticatedUser,
    id: string,
    idempotencyKey?: string,
  ) {
    await this.lesson(user, id);
    return this.access.idempotent(
      user,
      idempotencyKey,
      "INSTRUCTOR_LESSON_NO_SHOW",
      id,
      async () =>
        this.prisma.$transaction(async (tx) => {
          const current = await tx.lesson.findFirst({
            where: { id, tenantId: user.tenantId },
          });
          if (
            !current ||
            (current.status !== LessonStatus.CONFIRMED &&
              current.status !== LessonStatus.IN_PROGRESS)
          ) {
            throw new ConflictException(
              "A situação atual não permite registrar falta.",
            );
          }
          const updated = await tx.lesson.update({
            where: { id },
            data: { status: LessonStatus.NO_SHOW },
            select: lessonSelect,
          });
          await this.audit.record(tx, {
            tenantId: user.tenantId,
            entityType: "PracticalLesson",
            entityId: id,
            action: "MOBILE_NO_SHOW",
            actorUserId: user.id,
            before: current,
            after: updated,
          });
          return updated;
        }),
    );
  }

  async evaluate(
    user: AuthenticatedUser,
    id: string,
    input: LessonEvaluationDto,
    idempotencyKey?: string,
  ) {
    const instructor = await this.access.instructor(user);
    const lesson = await this.lesson(user, id);
    if (
      lesson.status !== LessonStatus.IN_PROGRESS &&
      lesson.status !== LessonStatus.COMPLETED
    ) {
      throw new ConflictException("A aula ainda não pode ser avaliada.");
    }
    if (
      lesson.completedAt &&
      Date.now() - lesson.completedAt.getTime() > 24 * 60 * 60_000
    ) {
      throw new ConflictException("O prazo de 24 horas para avaliação terminou.");
    }
    return this.access.idempotent(
      user,
      idempotencyKey,
      "INSTRUCTOR_EVALUATE_LESSON",
      id,
      async () =>
        this.prisma.$transaction(async (tx) => {
          const previous = await tx.lessonEvaluation.findUnique({
            where: { lessonId: id },
          });
          const evaluation = await tx.lessonEvaluation.upsert({
            where: { lessonId: id },
            create: {
              tenantId: user.tenantId,
              lessonId: id,
              studentId: lesson.student.id,
              instructorId: instructor.id,
              evaluatorUserId: user.id,
              ...input,
              notes: input.notes?.trim() || null,
            },
            update: {
              ...input,
              notes: input.notes?.trim() || null,
              evaluatorUserId: user.id,
            },
          });
          await this.audit.record(tx, {
            tenantId: user.tenantId,
            entityType: "LessonEvaluation",
            entityId: evaluation.id,
            action: previous ? "UPDATED" : "CREATED",
            actorUserId: user.id,
            before: previous,
            after: evaluation,
          });
          return evaluation;
        }),
    );
  }

  async theoretical(user: AuthenticatedUser, query: MobileRangeQueryDto) {
    const instructor = await this.access.instructor(user);
    return this.prisma.theoreticalClass.findMany({
      where: {
        tenantId: user.tenantId,
        instructorId: instructor.id,
        startsAt: range(query),
        status: lessonStatus(query.status),
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        unit: { select: { id: true, name: true, address: true } },
        classroom: { select: { id: true, name: true } },
        _count: { select: { students: true } },
      },
      orderBy: { startsAt: "desc" },
    });
  }

  async theoreticalClass(user: AuthenticatedUser, id: string) {
    const instructor = await this.access.instructor(user);
    const item = await this.prisma.theoreticalClass.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        instructorId: instructor.id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        completedAt: true,
        unit: { select: { id: true, name: true, address: true } },
        classroom: { select: { id: true, name: true } },
        students: {
          select: {
            studentId: true,
            attendanceStatus: true,
            checkInAt: true,
            notes: true,
            student: { select: { id: true, name: true, socialName: true } },
          },
          orderBy: { student: { name: "asc" } },
        },
      },
    });
    if (!item) throw new NotFoundException("Turma teórica não encontrada.");
    return item;
  }

  async startTheoretical(
    user: AuthenticatedUser,
    id: string,
    idempotencyKey?: string,
  ) {
    await this.theoreticalClass(user, id);
    return this.access.idempotent(
      user,
      idempotencyKey,
      "INSTRUCTOR_START_THEORETICAL",
      id,
      async () => {
        await this.theoreticalClasses.start(user.tenantId, user.id, id);
        return this.theoreticalClass(user, id);
      },
    );
  }

  async attendance(
    user: AuthenticatedUser,
    id: string,
    input: BulkAttendanceDto,
    idempotencyKey?: string,
  ) {
    const instructor = await this.access.instructor(user);
    const item = await this.theoreticalClass(user, id);
    const enrolled = new Set(item.students.map(({ studentId }) => studentId));
    if (
      new Set(input.attendance.map(({ studentId }) => studentId)).size !==
        input.attendance.length ||
      input.attendance.some(({ studentId }) => !enrolled.has(studentId))
    ) {
      throw new ConflictException(
        "A chamada contém aluno duplicado ou não matriculado.",
      );
    }
    return this.access.idempotent(
      user,
      idempotencyKey,
      "INSTRUCTOR_THEORETICAL_ATTENDANCE",
      id,
      async () => {
        await this.prisma.$transaction(async (tx) => {
          const currentClass = await tx.theoreticalClass.findFirst({
            where: {
              id,
              tenantId: user.tenantId,
              instructorId: instructor.id,
            },
          });
          if (currentClass?.status !== LessonStatus.IN_PROGRESS) {
            throw new ConflictException(
              "A turma precisa estar em andamento para registrar presença.",
            );
          }
          for (const attendance of input.attendance) {
            const previous = await tx.theoreticalClassStudent.findFirstOrThrow({
              where: {
                tenantId: user.tenantId,
                theoreticalClassId: id,
                studentId: attendance.studentId,
              },
            });
            const updated = await tx.theoreticalClassStudent.update({
              where: { id: previous.id },
              data: {
                attendanceStatus: attendance.status,
                checkInAt: attendance.status === "PRESENT" ? new Date() : null,
                notes: attendance.notes?.trim() || null,
              },
            });
            await this.audit.record(tx, {
              tenantId: user.tenantId,
              entityType: "TheoreticalClass",
              entityId: id,
              action: "MOBILE_ATTENDANCE_UPDATED",
              actorUserId: user.id,
              before: previous,
              after: updated,
            });
          }
        });
        return this.theoreticalClass(user, id);
      },
    );
  }

  async completeTheoretical(
    user: AuthenticatedUser,
    id: string,
    idempotencyKey?: string,
  ) {
    await this.theoreticalClass(user, id);
    return this.access.idempotent(
      user,
      idempotencyKey,
      "INSTRUCTOR_COMPLETE_THEORETICAL",
      id,
      async () => {
        await this.theoreticalClasses.complete(user.tenantId, user.id, id);
        return this.theoreticalClass(user, id);
      },
    );
  }

  async students(user: AuthenticatedUser) {
    const instructor = await this.access.instructor(user);
    return this.prisma.student.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { lessons: { some: { instructorId: instructor.id } } },
          {
            theoreticalClasses: {
              some: { theoreticalClass: { instructorId: instructor.id } },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        socialName: true,
        status: true,
        _count: {
          select: {
            lessons: {
              where: {
                instructorId: instructor.id,
                status: LessonStatus.COMPLETED,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async student(user: AuthenticatedUser, id: string) {
    const instructor = await this.access.instructor(user);
    const student = await this.prisma.student.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        OR: [
          { lessons: { some: { instructorId: instructor.id } } },
          {
            theoreticalClasses: {
              some: { theoreticalClass: { instructorId: instructor.id } },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        socialName: true,
        status: true,
        licenseProcesses: {
          select: {
            id: true,
            processType: true,
            status: true,
            categories: {
              select: { category: { select: { code: true, name: true } } },
            },
            stages: { select: { status: true } },
          },
          orderBy: { openedAt: "desc" },
        },
        lessons: {
          where: { instructorId: instructor.id },
          select: {
            id: true,
            startsAt: true,
            status: true,
            studentNotes: true,
            evaluation: {
              select: {
                overallRating: true,
                notes: true,
                visibleToStudent: true,
                createdAt: true,
              },
            },
          },
          orderBy: { startsAt: "desc" },
          take: 20,
        },
      },
    });
    if (!student) throw new NotFoundException("Aluno vinculado não encontrado.");
    return {
      ...student,
      licenseProcesses: student.licenseProcesses.map((process) => {
        const completed = process.stages.filter(({ status }) =>
          ["COMPLETED", "WAIVED"].includes(status),
        ).length;
        return {
          ...process,
          completedStages: completed,
          totalStages: process.stages.length,
          progressPercent: process.stages.length
            ? Math.round((completed / process.stages.length) * 100)
            : 0,
          stages: undefined,
        };
      }),
    };
  }

  async vehicles(user: AuthenticatedUser) {
    const instructor = await this.access.instructor(user);
    return this.prisma.vehicle.findMany({
      where: {
        tenantId: user.tenantId,
        lessons: { some: { instructorId: instructor.id } },
      },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        year: true,
        color: true,
        category: true,
        status: true,
        lessons: {
          where: {
            instructorId: instructor.id,
            OR: [
              { startOdometerKm: { not: null } },
              { endOdometerKm: { not: null } },
            ],
          },
          select: { startOdometerKm: true, endOdometerKm: true },
          orderBy: { startsAt: "desc" },
          take: 1,
        },
      },
      orderBy: { model: "asc" },
    });
  }

  async vehicle(user: AuthenticatedUser, id: string) {
    const instructor = await this.access.instructor(user);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        lessons: { some: { instructorId: instructor.id } },
      },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        year: true,
        color: true,
        category: true,
        status: true,
        lessons: {
          where: { instructorId: instructor.id },
          select: {
            id: true,
            startsAt: true,
            status: true,
            startOdometerKm: true,
            endOdometerKm: true,
          },
          orderBy: { startsAt: "desc" },
          take: 10,
        },
        occurrences: {
          where: { instructorId: instructor.id },
          select: {
            id: true,
            type: true,
            description: true,
            occurredAt: true,
            status: true,
            lessonId: true,
          },
          orderBy: { occurredAt: "desc" },
        },
      },
    });
    if (!vehicle) throw new NotFoundException("Veículo vinculado não encontrado.");
    return vehicle;
  }

  async occurrence(
    user: AuthenticatedUser,
    id: string,
    input: VehicleOccurrenceDto,
    idempotencyKey?: string,
  ) {
    const instructor = await this.access.instructor(user);
    await this.vehicle(user, id);
    if (input.lessonId) {
      const lesson = await this.prisma.lesson.count({
        where: {
          id: input.lessonId,
          tenantId: user.tenantId,
          instructorId: instructor.id,
          vehicleId: id,
        },
      });
      if (!lesson)
        throw new NotFoundException("Aula vinculada ao veículo não encontrada.");
    }
    return this.access.idempotent(
      user,
      idempotencyKey,
      "INSTRUCTOR_VEHICLE_OCCURRENCE",
      id,
      async () =>
        this.prisma.$transaction(async (tx) => {
          const occurrence = await tx.vehicleOccurrence.create({
            data: {
              tenantId: user.tenantId,
              vehicleId: id,
              instructorId: instructor.id,
              lessonId: input.lessonId,
              reportedByUserId: user.id,
              type: input.type,
              description: input.description.trim(),
              occurredAt: new Date(input.occurredAt),
              status: VehicleOccurrenceStatus.OPEN,
            },
          });
          await this.audit.record(tx, {
            tenantId: user.tenantId,
            entityType: "VehicleOccurrence",
            entityId: occurrence.id,
            action: "CREATED",
            actorUserId: user.id,
            after: occurrence,
          });
          return occurrence;
        }),
    );
  }

  async profile(user: AuthenticatedUser) {
    const instructor = await this.access.instructor(user);
    return {
      ...instructor,
      user: { id: user.id, name: user.name, email: user.email },
      tenantId: user.tenantId,
      role: user.role,
    };
  }
}
