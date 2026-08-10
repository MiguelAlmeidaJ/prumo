import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DomainEventType, LessonStatus, Prisma } from "@prisma/client";
import type { Permission } from "@prumo/contracts";
import { nullable } from "../common/registration.utils";
import { PrismaService } from "../database/prisma.service";
import { DomainEventService } from "../communication/domain-event.service";
import { FinancialEligibilityService } from "../financial/reports-eligibility.service";
import { ProcessProgressionService } from "../processes/process-progression.service";
import { AuditService } from "./audit.service";
import {
  AddTheoreticalStudentDto,
  AttendanceDto,
  CancellationDto,
  CreateTheoreticalClassDto,
  LessonQueryDto,
  UpdateTheoreticalClassDto,
} from "./dto/schedule.dto";
import { lockScheduleResources, parseInterval } from "./schedule.utils";
import { ScheduleValidationService } from "./schedule-validation.service";

const classInclude = {
  unit: { select: { id: true, name: true } },
  classroom: { select: { id: true, name: true, capacity: true } },
  instructor: { select: { id: true, name: true } },
  students: {
    include: {
      student: { select: { id: true, name: true, cpf: true } },
      process: { select: { id: true, processType: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.TheoreticalClassInclude;

@Injectable()
export class TheoreticalClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: ScheduleValidationService,
    private readonly audit: AuditService,
    private readonly progression: ProcessProgressionService,
    private readonly eligibility: FinancialEligibilityService,
    private readonly events: DomainEventService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    permissions: Permission[],
    input: CreateTheoreticalClassDto,
  ) {
    const { start, end } = parseInterval(input.startsAt, input.endsAt);
    this.validation.ensureNotPast(start, this.canSchedulePast(permissions));
    const studentIds = [...new Set(input.studentIds ?? [])];
    if (studentIds.length !== (input.studentIds?.length ?? 0)) {
      throw new ConflictException("Existem alunos duplicados na turma.");
    }
    if (studentIds.length > input.capacity) {
      throw new ConflictException("A turma excede sua capacidade.");
    }
    const financialChecks = await Promise.all(
      studentIds.map((studentId) =>
        this.eligibility.canScheduleLesson(tenantId, studentId),
      ),
    );
    const blocked = financialChecks.find((result) => !result.allowed);
    if (blocked) throw new ConflictException(blocked.reason);

    return this.prisma.serializableTransaction(
      async (tx) => {
        await lockScheduleResources(tx, tenantId, [
          `unit:${input.unitId}`,
          `classroom:${input.classroomId}`,
          `instructor:${input.instructorId}`,
          ...studentIds.map((id) => `student:${id}`),
        ]);
        await this.validation.validateTheoretical(
          tx,
          tenantId,
          input,
          start,
          end,
          input.capacity,
        );
        const theoreticalClass = await tx.theoreticalClass.create({
          data: {
            tenantId,
            unitId: input.unitId,
            classroomId: input.classroomId,
            instructorId: input.instructorId,
            title: input.title.trim(),
            description: nullable(input.description),
            startsAt: start,
            endsAt: end,
            capacity: input.capacity,
            createdByUserId: actorUserId,
          },
        });
        for (const studentId of studentIds) {
          await this.validation.validateStudentEnrollment(
            tx,
            tenantId,
            theoreticalClass.id,
            studentId,
            start,
            end,
          );
          await tx.theoreticalClassStudent.create({
            data: {
              tenantId,
              theoreticalClassId: theoreticalClass.id,
              studentId,
            },
          });
        }
        const result = await tx.theoreticalClass.findUniqueOrThrow({
          where: { id: theoreticalClass.id },
          include: classInclude,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "TheoreticalClass",
          entityId: result.id,
          action: "CREATED",
          actorUserId,
          after: result,
        });
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.THEORETICAL_CLASS_CREATED,
          aggregateType: "TheoreticalClass",
          aggregateId: result.id,
          payload: {
            classId: result.id,
            instructorId: result.instructorId,
            studentIds: result.students.map(({ studentId }) => studentId),
            startsAt: result.startsAt.toISOString(),
            endsAt: result.endsAt.toISOString(),
          },
          idempotencyKey: `theoretical-class-created:${tenantId}:${result.id}`,
        });
        return result;
      },
    );
  }

  list(tenantId: string, query: LessonQueryDto) {
    return this.prisma.theoreticalClass.findMany({
      where: {
        tenantId,
        startsAt: query.to ? { lt: new Date(query.to) } : undefined,
        endsAt: query.from ? { gt: new Date(query.from) } : undefined,
        unitId: query.unitId,
        instructorId: query.instructorId,
        status: query.status,
        students: query.studentId
          ? { some: { studentId: query.studentId } }
          : undefined,
      },
      include: classInclude,
      orderBy: { startsAt: "asc" },
    });
  }

  async findOne(tenantId: string, id: string) {
    const theoreticalClass = await this.prisma.theoreticalClass.findFirst({
      where: { id, tenantId },
      include: classInclude,
    });
    if (!theoreticalClass) {
      throw new NotFoundException("Turma teórica não encontrada.");
    }
    return theoreticalClass;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    permissions: Permission[],
    id: string,
    input: UpdateTheoreticalClassDto,
  ) {
    const current = await this.findOne(tenantId, id);
    if (current.status !== LessonStatus.PENDING) {
      throw new ConflictException(
        "Somente turmas pendentes podem ser editadas.",
      );
    }
    const resources = {
      unitId: input.unitId ?? current.unitId,
      classroomId: input.classroomId ?? current.classroomId,
      instructorId: input.instructorId ?? current.instructorId,
    };
    const { start, end } = parseInterval(
      input.startsAt ?? current.startsAt.toISOString(),
      input.endsAt ?? current.endsAt.toISOString(),
    );
    const capacity = input.capacity ?? current.capacity;
    this.validation.ensureNotPast(start, this.canSchedulePast(permissions));
    if (capacity < current.students.length) {
      throw new ConflictException(
        "A capacidade não pode ser menor que o número de alunos.",
      );
    }

    return this.prisma.serializableTransaction(
      async (tx) => {
        await lockScheduleResources(tx, tenantId, [
          `unit:${resources.unitId}`,
          `classroom:${resources.classroomId}`,
          `instructor:${resources.instructorId}`,
        ]);
        await this.validation.validateTheoretical(
          tx,
          tenantId,
          resources,
          start,
          end,
          capacity,
          id,
        );
        for (const enrollment of current.students) {
          await this.validation.validateStudentEnrollment(
            tx,
            tenantId,
            id,
            enrollment.studentId,
            start,
            end,
          );
        }
        const result = await tx.theoreticalClass.update({
          where: { id },
          data: {
            ...resources,
            title: input.title?.trim(),
            description: nullable(input.description),
            startsAt: start,
            endsAt: end,
            capacity,
          },
          include: classInclude,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "TheoreticalClass",
          entityId: id,
          action: "UPDATED",
          actorUserId,
          before: current,
          after: result,
        });
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.THEORETICAL_CLASS_UPDATED,
          aggregateType: "TheoreticalClass",
          aggregateId: result.id,
          payload: {
            classId: result.id,
            instructorId: result.instructorId,
            studentIds: result.students.map(({ studentId }) => studentId),
            startsAt: result.startsAt.toISOString(),
            endsAt: result.endsAt.toISOString(),
          },
          idempotencyKey: `theoretical-class-updated:${tenantId}:${result.id}:${result.updatedAt.toISOString()}`,
        });
        return result;
      },
    );
  }

  async addStudent(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: AddTheoreticalStudentDto,
  ) {
    const current = await this.findOne(tenantId, id);
    const financial = await this.eligibility.canScheduleLesson(
      tenantId,
      input.studentId,
    );
    if (!financial.allowed) throw new ConflictException(financial.reason);
    return this.prisma.serializableTransaction(
      async (tx) => {
        await lockScheduleResources(tx, tenantId, [
          `class:${id}`,
          `student:${input.studentId}`,
        ]);
        const count = await tx.theoreticalClassStudent.count({
          where: { tenantId, theoreticalClassId: id },
        });
        if (count >= current.capacity) {
          throw new ConflictException("A turma atingiu sua capacidade.");
        }
        const duplicate = await tx.theoreticalClassStudent.findFirst({
          where: {
            tenantId,
            theoreticalClassId: id,
            studentId: input.studentId,
          },
        });
        if (duplicate) {
          throw new ConflictException("Aluno já está matriculado na turma.");
        }
        await this.validation.validateStudentEnrollment(
          tx,
          tenantId,
          id,
          input.studentId,
          current.startsAt,
          current.endsAt,
        );
        await this.validation.validateProcessLink(
          tx,
          tenantId,
          input.processId,
          input.studentId,
          current.unitId,
        );
        const enrollment = await tx.theoreticalClassStudent.create({
          data: {
            tenantId,
            theoreticalClassId: id,
            studentId: input.studentId,
            processId: input.processId,
          },
          include: { student: { select: { id: true, name: true } } },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "TheoreticalClass",
          entityId: id,
          action: "PARTICIPANT_ADDED",
          actorUserId,
          after: enrollment,
        });
        return enrollment;
      },
    );
  }

  async removeStudent(
    tenantId: string,
    actorUserId: string,
    id: string,
    studentId: string,
  ) {
    await this.findOne(tenantId, id);
    const enrollment = await this.prisma.theoreticalClassStudent.findFirst({
      where: { tenantId, theoreticalClassId: id, studentId },
    });
    if (!enrollment) throw new NotFoundException("Matrícula não encontrada.");
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, {
        tenantId,
        entityType: "TheoreticalClass",
        entityId: id,
        action: "PARTICIPANT_REMOVED",
        actorUserId,
        before: enrollment,
      });
      await tx.theoreticalClassStudent.delete({
        where: { id: enrollment.id },
      });
    });
  }

  async attendance(
    tenantId: string,
    actorUserId: string,
    id: string,
    studentId: string,
    input: AttendanceDto,
  ) {
    const current = await this.findOne(tenantId, id);
    const enrollment = await this.prisma.theoreticalClassStudent.findFirst({
      where: { tenantId, theoreticalClassId: id, studentId },
    });
    if (!enrollment) throw new NotFoundException("Matrícula não encontrada.");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.theoreticalClassStudent.update({
        where: { id: enrollment.id },
        data: {
          attendanceStatus: input.attendanceStatus,
          checkInAt: input.attendanceStatus === "PRESENT" ? new Date() : null,
          notes: nullable(input.notes),
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "TheoreticalClass",
        entityId: id,
        action: "PARTICIPANT_UPDATED",
        actorUserId,
        before: enrollment,
        after: updated,
      });
      if (current.status === LessonStatus.COMPLETED && updated.processId) {
        await this.progression.sync(
          tx,
          tenantId,
          updated.processId,
          actorUserId,
        );
      }
      return updated;
    });
  }

  confirm(tenantId: string, actorUserId: string, id: string) {
    return this.transition(
      tenantId,
      actorUserId,
      id,
      [LessonStatus.PENDING],
      LessonStatus.CONFIRMED,
      "CONFIRMED",
    );
  }

  start(tenantId: string, actorUserId: string, id: string) {
    return this.transition(
      tenantId,
      actorUserId,
      id,
      [LessonStatus.CONFIRMED],
      LessonStatus.IN_PROGRESS,
      "STARTED",
    );
  }

  complete(tenantId: string, actorUserId: string, id: string) {
    return this.transition(
      tenantId,
      actorUserId,
      id,
      [LessonStatus.IN_PROGRESS],
      LessonStatus.COMPLETED,
      "COMPLETED",
      { completedAt: new Date() },
    );
  }

  cancel(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: CancellationDto,
  ) {
    return this.transition(
      tenantId,
      actorUserId,
      id,
      [LessonStatus.PENDING, LessonStatus.CONFIRMED],
      LessonStatus.CANCELLED,
      "CANCELLED",
      { cancellationReason: input.reason.trim() },
    );
  }

  private async transition(
    tenantId: string,
    actorUserId: string,
    id: string,
    allowed: LessonStatus[],
    status: LessonStatus,
    action: string,
    extra: Prisma.TheoreticalClassUpdateManyMutationInput = {},
  ) {
    const current = await this.findOne(tenantId, id);
    if (!allowed.includes(current.status)) {
      throw new ConflictException(
        `Transição inválida de ${current.status} para ${status}.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.theoreticalClass.updateMany({
        where: { id, tenantId, status: { in: allowed } },
        data: { status, ...extra },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          "A turma foi alterada por outra operação. Atualize e tente novamente.",
        );
      }
      const updated = await tx.theoreticalClass.findFirstOrThrow({
        where: { id, tenantId },
        include: classInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "TheoreticalClass",
        entityId: id,
        action,
        actorUserId,
        before: current,
        after: updated,
      });
      if (status === LessonStatus.CANCELLED) {
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.THEORETICAL_CLASS_CANCELLED,
          aggregateType: "TheoreticalClass",
          aggregateId: updated.id,
          payload: {
            classId: updated.id,
            instructorId: updated.instructorId,
            startsAt: updated.startsAt.toISOString(),
          },
          idempotencyKey: `theoretical-class-cancelled:${tenantId}:${updated.id}`,
        });
      }
      if (status === LessonStatus.COMPLETED) {
        const processIds = [
          ...new Set(
            updated.students
              .map((enrollment) => enrollment.processId)
              .filter((processId): processId is string => Boolean(processId)),
          ),
        ];
        for (const processId of processIds) {
          await this.progression.sync(tx, tenantId, processId, actorUserId);
        }
      }
      return updated;
    });
  }

  private canSchedulePast(permissions: Permission[]): boolean {
    return (
      permissions.includes("*") ||
      permissions.includes("practical-lessons.past")
    );
  }
}
