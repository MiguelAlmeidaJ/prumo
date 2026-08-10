import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DomainEventType,
  LessonStatus,
  LessonType,
  Prisma,
} from "@prisma/client";
import type { Permission } from "@prumo/contracts";
import { nullable } from "../common/registration.utils";
import { PrismaService } from "../database/prisma.service";
import { DomainEventService } from "../communication/domain-event.service";
import {
  AutomaticChargeService,
  FinancialEligibilityService,
} from "../financial/reports-eligibility.service";
import { ProcessProgressionService } from "../processes/process-progression.service";
import { AuditService } from "./audit.service";
import {
  CancellationDto,
  CreatePracticalLessonDto,
  LessonQueryDto,
  ReschedulePracticalLessonDto,
  UpdatePracticalLessonDto,
} from "./dto/schedule.dto";
import { lockScheduleResources, parseInterval } from "./schedule.utils";
import { ScheduleValidationService } from "./schedule-validation.service";

const lessonInclude = {
  unit: { select: { id: true, name: true } },
  student: { select: { id: true, name: true, cpf: true } },
  instructor: { select: { id: true, name: true } },
  vehicle: { select: { id: true, plate: true, model: true } },
  process: { select: { id: true, processType: true, status: true } },
} satisfies Prisma.LessonInclude;

@Injectable()
export class PracticalLessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: ScheduleValidationService,
    private readonly audit: AuditService,
    private readonly progression: ProcessProgressionService,
    private readonly eligibility: FinancialEligibilityService,
    private readonly automaticCharge: AutomaticChargeService,
    private readonly events: DomainEventService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    permissions: Permission[],
    input: CreatePracticalLessonDto,
  ) {
    const { start, end } = parseInterval(input.startsAt, input.endsAt);
    this.validation.ensureNotPast(start, this.canSchedulePast(permissions));
    const financial = await this.eligibility.canScheduleLesson(
      tenantId,
      input.studentId,
    );
    if (!financial.allowed) {
      throw new ConflictException(financial.reason);
    }
    const lesson = await this.prisma.serializableTransaction(
      async (tx) => {
        await this.lockResources(tx, tenantId, input);
        await this.validation.validatePractical(
          tx,
          tenantId,
          input,
          start,
          end,
        );
        const lesson = await tx.lesson.create({
          data: {
            tenantId,
            unitId: input.unitId,
            studentId: input.studentId,
            instructorId: input.instructorId,
            vehicleId: input.vehicleId,
            processId: input.processId,
            startsAt: start,
            endsAt: end,
            type: LessonType.PRACTICAL,
            notes: nullable(input.notes),
            createdByUserId: actorUserId,
          },
          include: lessonInclude,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "PracticalLesson",
          entityId: lesson.id,
          action: "CREATED",
          actorUserId,
          after: lesson,
        });
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.PRACTICAL_LESSON_CREATED,
          aggregateType: "PracticalLesson",
          aggregateId: lesson.id,
          payload: {
            lessonId: lesson.id,
            studentId: lesson.studentId,
            instructorId: lesson.instructorId,
            startsAt: lesson.startsAt.toISOString(),
            endsAt: lesson.endsAt.toISOString(),
          },
          idempotencyKey: `practical-lesson-created:${tenantId}:${lesson.id}`,
        });
        return lesson;
      },
    );
    try {
      await this.automaticCharge.chargeExtraLesson({
        tenantId,
        actorUserId,
        lessonId: lesson.id,
        studentId: lesson.studentId,
        processId: lesson.processId,
      });
    } catch {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          tenantId,
          entityType: "PracticalLesson",
          entityId: lesson.id,
          action: "AUTO_CHARGE_FAILED",
          actorUserId,
          after: lesson,
        }),
      );
    }
    return lesson;
  }

  list(tenantId: string, query: LessonQueryDto) {
    return this.prisma.lesson.findMany({
      where: {
        tenantId,
        type: LessonType.PRACTICAL,
        startsAt: query.to ? { lt: new Date(query.to) } : undefined,
        endsAt: query.from ? { gt: new Date(query.from) } : undefined,
        unitId: query.unitId,
        instructorId: query.instructorId,
        vehicleId: query.vehicleId,
        studentId: query.studentId,
        status: query.status,
      },
      include: lessonInclude,
      orderBy: { startsAt: "asc" },
    });
  }

  async findOne(tenantId: string, id: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, tenantId, type: LessonType.PRACTICAL },
      include: {
        ...lessonInclude,
        rescheduledFrom: { select: { id: true } },
        rescheduledTo: { select: { id: true } },
      },
    });
    if (!lesson) throw new NotFoundException("Aula prática não encontrada.");
    return lesson;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    permissions: Permission[],
    id: string,
    input: UpdatePracticalLessonDto,
  ) {
    const current = await this.findOne(tenantId, id);
    if (current.status !== LessonStatus.PENDING) {
      throw new ConflictException(
        "Somente aulas pendentes podem ser editadas.",
      );
    }
    const resources = {
      unitId: input.unitId ?? current.unitId,
      studentId: input.studentId ?? current.studentId,
      instructorId: input.instructorId ?? current.instructorId,
      vehicleId: input.vehicleId ?? current.vehicleId,
      processId: input.processId ?? current.processId ?? undefined,
    };
    const { start, end } = parseInterval(
      input.startsAt ?? current.startsAt.toISOString(),
      input.endsAt ?? current.endsAt.toISOString(),
    );
    this.validation.ensureNotPast(start, this.canSchedulePast(permissions));

    return this.prisma.serializableTransaction(
      async (tx) => {
        await this.lockResources(tx, tenantId, resources);
        await this.validation.validatePractical(
          tx,
          tenantId,
          resources,
          start,
          end,
          id,
        );
        const lesson = await tx.lesson.update({
          where: { id },
          data: {
            ...resources,
            startsAt: start,
            endsAt: end,
            notes: nullable(input.notes),
          },
          include: lessonInclude,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "PracticalLesson",
          entityId: id,
          action: "UPDATED",
          actorUserId,
          before: current,
          after: lesson,
        });
        return lesson;
      },
    );
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

  noShow(tenantId: string, actorUserId: string, id: string) {
    return this.transition(
      tenantId,
      actorUserId,
      id,
      [LessonStatus.CONFIRMED, LessonStatus.IN_PROGRESS],
      LessonStatus.NO_SHOW,
      "NO_SHOW",
    );
  }

  async reschedule(
    tenantId: string,
    actorUserId: string,
    permissions: Permission[],
    id: string,
    input: ReschedulePracticalLessonDto,
  ) {
    const current = await this.findOne(tenantId, id);
    const reschedulableStatuses: LessonStatus[] = [
      LessonStatus.PENDING,
      LessonStatus.CONFIRMED,
    ];
    if (!reschedulableStatuses.includes(current.status)) {
      throw new ConflictException("Esta aula não pode mais ser reagendada.");
    }
    const resources = {
      unitId: input.unitId ?? current.unitId,
      studentId: current.studentId,
      instructorId: input.instructorId ?? current.instructorId,
      vehicleId: input.vehicleId ?? current.vehicleId,
      processId: current.processId ?? undefined,
    };
    const { start, end } = parseInterval(input.startsAt, input.endsAt);
    this.validation.ensureNotPast(start, this.canSchedulePast(permissions));

    return this.prisma.serializableTransaction(
      async (tx) => {
        await this.lockResources(tx, tenantId, resources);
        await this.validation.validatePractical(
          tx,
          tenantId,
          resources,
          start,
          end,
          id,
        );
        const oldLesson = await tx.lesson.update({
          where: { id },
          data: { status: LessonStatus.RESCHEDULED },
        });
        const lesson = await tx.lesson.create({
          data: {
            tenantId,
            ...resources,
            startsAt: start,
            endsAt: end,
            notes: nullable(input.notes) ?? current.notes,
            type: LessonType.PRACTICAL,
            createdByUserId: actorUserId,
            rescheduledFromId: id,
          },
          include: lessonInclude,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "PracticalLesson",
          entityId: id,
          action: "RESCHEDULED",
          actorUserId,
          before: current,
          after: { previous: oldLesson, replacement: lesson },
        });
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.PRACTICAL_LESSON_RESCHEDULED,
          aggregateType: "PracticalLesson",
          aggregateId: lesson.id,
          payload: {
            lessonId: lesson.id,
            rescheduledFromId: id,
            studentId: lesson.studentId,
            instructorId: lesson.instructorId,
            startsAt: lesson.startsAt.toISOString(),
            endsAt: lesson.endsAt.toISOString(),
          },
          idempotencyKey: `practical-lesson-rescheduled:${tenantId}:${id}:${lesson.id}`,
        });
        return lesson;
      },
    );
  }

  private async transition(
    tenantId: string,
    actorUserId: string,
    id: string,
    allowedFrom: LessonStatus[],
    status: LessonStatus,
    action: string,
    extra: Prisma.LessonUpdateManyMutationInput = {},
  ) {
    const current = await this.findOne(tenantId, id);
    if (!allowedFrom.includes(current.status)) {
      throw new ConflictException(
        `Transição inválida de ${current.status} para ${status}.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.lesson.updateMany({
        where: {
          id,
          tenantId,
          type: LessonType.PRACTICAL,
          status: { in: allowedFrom },
        },
        data: { status, ...extra },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          "A aula foi alterada por outra operação. Atualize e tente novamente.",
        );
      }
      const lesson = await tx.lesson.findFirstOrThrow({
        where: { id, tenantId, type: LessonType.PRACTICAL },
        include: lessonInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "PracticalLesson",
        entityId: id,
        action,
        actorUserId,
        before: current,
        after: lesson,
      });
      const eventType =
        status === LessonStatus.CONFIRMED
          ? DomainEventType.PRACTICAL_LESSON_CONFIRMED
          : status === LessonStatus.CANCELLED
            ? DomainEventType.PRACTICAL_LESSON_CANCELLED
            : status === LessonStatus.COMPLETED
              ? DomainEventType.PRACTICAL_LESSON_COMPLETED
              : null;
      if (eventType) {
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: eventType,
          aggregateType: "PracticalLesson",
          aggregateId: lesson.id,
          payload: {
            lessonId: lesson.id,
            studentId: lesson.studentId,
            instructorId: lesson.instructorId,
            startsAt: lesson.startsAt.toISOString(),
            endsAt: lesson.endsAt.toISOString(),
          },
          idempotencyKey: `${eventType.toLowerCase()}:${tenantId}:${lesson.id}`,
        });
      }
      if (status === LessonStatus.COMPLETED && lesson.processId) {
        await this.progression.sync(
          tx,
          tenantId,
          lesson.processId,
          actorUserId,
        );
      }
      return lesson;
    });
  }

  private lockResources(
    tx: Prisma.TransactionClient,
    tenantId: string,
    resources: {
      unitId: string;
      studentId: string;
      instructorId: string;
      vehicleId: string;
    },
  ) {
    return lockScheduleResources(tx, tenantId, [
      `unit:${resources.unitId}`,
      `student:${resources.studentId}`,
      `instructor:${resources.instructorId}`,
      `vehicle:${resources.vehicleId}`,
    ]);
  }

  private canSchedulePast(permissions: Permission[]): boolean {
    return (
      permissions.includes("*") ||
      permissions.includes("practical-lessons.past")
    );
  }
}
