import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DomainEventType,
  ExamResult,
  ExamStatus,
  Prisma,
  ProcessStageStatus,
  RegistryStatus,
} from "@prumo/database";
import { nullable } from "../common/registration.utils";
import { PrismaService } from "../database/prisma.service";
import { DomainEventService } from "../communication/domain-event.service";
import {
  AutomaticChargeService,
  FinancialEligibilityService,
} from "../financial/reports-eligibility.service";
import { AuditService } from "../schedule/audit.service";
import { lockScheduleResources } from "../schedule/schedule.utils";
import {
  CompleteExamDto,
  CreateExamDto,
  ExamQueryDto,
  ProcessReasonDto,
  RescheduleExamDto,
} from "./dto/process.dto";
import { ProcessProgressionService } from "./process-progression.service";

const examInclude = {
  process: {
    select: {
      id: true,
      processType: true,
      status: true,
      categories: { include: { category: true } },
    },
  },
  student: { select: { id: true, name: true, cpf: true } },
  unit: { select: { id: true, name: true } },
} satisfies Prisma.ExamInclude;

const ACTIVE_EXAM_STATUSES: ExamStatus[] = [
  ExamStatus.REQUESTED,
  ExamStatus.SCHEDULED,
  ExamStatus.CONFIRMED,
];

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progression: ProcessProgressionService,
    private readonly audit: AuditService,
    private readonly eligibility: FinancialEligibilityService,
    private readonly automaticCharge: AutomaticChargeService,
    private readonly events: DomainEventService,
  ) {}

  async create(tenantId: string, actorUserId: string, input: CreateExamDto) {
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt < new Date()) {
      throw new ConflictException("Não é permitido agendar exame no passado.");
    }
    const processForFinancial =
      await this.prisma.studentLicenseProcess.findFirst({
        where: { id: input.processId, tenantId },
        select: { studentId: true },
      });
    if (processForFinancial) {
      const financial = await this.eligibility.canScheduleExam(
        tenantId,
        processForFinancial.studentId,
      );
      if (!financial.allowed) {
        throw new ConflictException(financial.reason);
      }
    }
    const exam = await this.prisma.serializableTransaction(
      async (tx) => {
        await lockScheduleResources(tx, tenantId, [
          `process:${input.processId}`,
        ]);
        const process = await this.progression.ensureExamEligible(
          tx,
          tenantId,
          input.processId,
          input.type,
        );
        const unit = await tx.schoolUnit.findFirst({
          where: { id: input.unitId, tenantId, active: true },
        });
        if (!unit) {
          throw new NotFoundException("Unidade ativa não pertence ao tenant.");
        }
        const activeAttempt = await tx.exam.findFirst({
          where: {
            tenantId,
            processId: input.processId,
            type: input.type,
            status: { in: [...ACTIVE_EXAM_STATUSES] },
          },
        });
        if (activeAttempt) {
          throw new ConflictException(
            "Já existe uma tentativa ativa deste exame.",
          );
        }
        await this.ensureStudentAvailable(
          tx,
          tenantId,
          process.studentId,
          scheduledAt,
        );
        const aggregate = await tx.exam.aggregate({
          where: {
            tenantId,
            processId: input.processId,
            type: input.type,
          },
          _max: { attemptNumber: true },
        });
        const exam = await tx.exam.create({
          data: {
            tenantId,
            processId: input.processId,
            studentId: process.studentId,
            unitId: input.unitId,
            type: input.type,
            status: ExamStatus.SCHEDULED,
            scheduledAt,
            location: nullable(input.location),
            externalProtocol: nullable(input.externalProtocol),
            attemptNumber: (aggregate._max.attemptNumber ?? 0) + 1,
            notes: nullable(input.notes),
            createdByUserId: actorUserId,
          },
          include: examInclude,
        });
        const stage = await tx.processStage.findFirst({
          where: {
            tenantId,
            processId: input.processId,
            type: this.progression.examStage(input.type),
          },
        });
        if (stage && stage.status !== ProcessStageStatus.IN_PROGRESS) {
          const updatedStage = await tx.processStage.update({
            where: { id: stage.id },
            data: {
              status: ProcessStageStatus.IN_PROGRESS,
              startedAt: stage.startedAt ?? new Date(),
            },
          });
          await this.audit.record(tx, {
            tenantId,
            entityType: "ProcessStage",
            entityId: stage.id,
            action: "EXAM_STARTED",
            actorUserId,
            before: stage,
            after: updatedStage,
          });
        }
        await this.audit.record(tx, {
          tenantId,
          entityType: "Exam",
          entityId: exam.id,
          action: "CREATED",
          actorUserId,
          after: exam,
        });
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.EXAM_SCHEDULED,
          aggregateType: "Exam",
          aggregateId: exam.id,
          payload: {
            examId: exam.id,
            processId: exam.processId,
            studentId: exam.studentId,
            scheduledAt: exam.scheduledAt.toISOString(),
          },
          idempotencyKey: `exam-scheduled:${tenantId}:${exam.id}`,
        });
        return exam;
      },
    );
    try {
      await this.automaticCharge.chargeExamRetest({
        tenantId,
        actorUserId,
        examId: exam.id,
        studentId: exam.studentId,
        processId: exam.processId,
        attemptNumber: exam.attemptNumber,
      });
    } catch {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          tenantId,
          entityType: "Exam",
          entityId: exam.id,
          action: "AUTO_CHARGE_FAILED",
          actorUserId,
          after: exam,
        }),
      );
    }
    return exam;
  }

  async list(tenantId: string, query: ExamQueryDto) {
    const where: Prisma.ExamWhereInput = {
      tenantId,
      processId: query.processId,
      studentId: query.studentId,
      unitId: query.unitId,
      type: query.type,
      result: query.result,
      scheduledAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lt: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.exam.findMany({
        where,
        include: examInclude,
        orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.exam.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, tenantId },
      include: examInclude,
    });
    if (!exam) throw new NotFoundException("Exame não encontrado.");
    return exam;
  }

  confirm(tenantId: string, actorUserId: string, id: string) {
    return this.transition(
      tenantId,
      actorUserId,
      id,
      [ExamStatus.REQUESTED, ExamStatus.SCHEDULED],
      ExamStatus.CONFIRMED,
      "CONFIRMED",
    );
  }

  async complete(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: CompleteExamDto,
  ) {
    if (input.result === ExamResult.PENDING) {
      throw new ConflictException(
        "Informe um resultado conclusivo para o exame.",
      );
    }
    const current = await this.findOne(tenantId, id);
    if (current.status !== ExamStatus.CONFIRMED) {
      throw new ConflictException(
        "Somente exames confirmados podem ser concluídos.",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id },
        data: {
          status: ExamStatus.COMPLETED,
          result: input.result,
          score: input.score,
          notes: nullable(input.notes),
          externalProtocol: nullable(input.externalProtocol),
          completedAt: new Date(),
        },
        include: examInclude,
      });
      const stage = await tx.processStage.findFirst({
        where: {
          tenantId,
          processId: current.processId,
          type: this.progression.examStage(current.type),
        },
      });
      if (stage) {
        const updatedStage = await tx.processStage.update({
          where: { id: stage.id },
          data: {
            status:
              input.result === ExamResult.APPROVED
                ? ProcessStageStatus.COMPLETED
                : ProcessStageStatus.FAILED,
            completedAt:
              input.result === ExamResult.APPROVED ? new Date() : null,
            blockedReason:
              input.result === ExamResult.APPROVED
                ? null
                : `Resultado: ${input.result}`,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "ProcessStage",
          entityId: stage.id,
          action:
            input.result === ExamResult.APPROVED
              ? "EXAM_APPROVED"
              : "EXAM_NOT_APPROVED",
          actorUserId,
          before: stage,
          after: updatedStage,
        });
      }
      await this.audit.record(tx, {
        tenantId,
        entityType: "Exam",
        entityId: id,
        action:
          input.result === ExamResult.APPROVED
            ? "APPROVED"
            : input.result === ExamResult.FAILED
              ? "FAILED"
              : "COMPLETED",
        actorUserId,
        before: current,
        after: updated,
      });
      await this.events.publishInTransaction(tx, {
        tenantId,
        type: DomainEventType.EXAM_RESULT_RECORDED,
        aggregateType: "Exam",
        aggregateId: updated.id,
        payload: {
          examId: updated.id,
          processId: updated.processId,
          studentId: updated.studentId,
          result: updated.result,
        },
        idempotencyKey: `exam-result-recorded:${tenantId}:${updated.id}`,
      });
      await this.progression.sync(tx, tenantId, current.processId, actorUserId);
      return updated;
    });
  }

  cancel(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: ProcessReasonDto,
  ) {
    return this.transition(
      tenantId,
      actorUserId,
      id,
      [...ACTIVE_EXAM_STATUSES],
      ExamStatus.CANCELLED,
      "CANCELLED",
      {
        cancellationReason: input.reason.trim(),
        result: ExamResult.PENDING,
      },
    );
  }

  async noShow(tenantId: string, actorUserId: string, id: string) {
    const exam = await this.transition(
      tenantId,
      actorUserId,
      id,
      [ExamStatus.SCHEDULED, ExamStatus.CONFIRMED],
      ExamStatus.NO_SHOW,
      "NO_SHOW",
      { result: ExamResult.ABSENT, completedAt: new Date() },
    );
    await this.prisma.$transaction(async (tx) => {
      const stage = await tx.processStage.findFirst({
        where: {
          tenantId,
          processId: exam.processId,
          type: this.progression.examStage(exam.type),
        },
      });
      if (stage) {
        const updatedStage = await tx.processStage.update({
          where: { id: stage.id },
          data: {
            status: ProcessStageStatus.AVAILABLE,
            completedAt: null,
            blockedReason: "Ausência na tentativa anterior.",
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "ProcessStage",
          entityId: stage.id,
          action: "EXAM_NO_SHOW",
          actorUserId,
          before: stage,
          after: updatedStage,
        });
      }
    });
    return exam;
  }

  async reschedule(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: RescheduleExamDto,
  ) {
    const current = await this.findOne(tenantId, id);
    if (!ACTIVE_EXAM_STATUSES.includes(current.status)) {
      throw new ConflictException("Este exame não pode ser reagendado.");
    }
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt < new Date()) {
      throw new ConflictException("O novo horário não pode estar no passado.");
    }
    return this.prisma.serializableTransaction(
      async (tx) => {
        await lockScheduleResources(tx, tenantId, [
          `process:${current.processId}`,
        ]);
        await this.progression.ensureExamEligible(
          tx,
          tenantId,
          current.processId,
          current.type,
        );
        const unitId = input.unitId ?? current.unitId;
        const unit = await tx.schoolUnit.findFirst({
          where: { id: unitId, tenantId, active: true },
        });
        if (!unit) throw new NotFoundException("Unidade não encontrada.");
        await this.ensureStudentAvailable(
          tx,
          tenantId,
          current.studentId,
          scheduledAt,
          id,
        );
        const aggregate = await tx.exam.aggregate({
          where: {
            tenantId,
            processId: current.processId,
            type: current.type,
          },
          _max: { attemptNumber: true },
        });
        await tx.exam.update({
          where: { id },
          data: {
            status: ExamStatus.RESCHEDULED,
            cancellationReason: input.reason.trim(),
          },
        });
        const replacement = await tx.exam.create({
          data: {
            tenantId,
            processId: current.processId,
            studentId: current.studentId,
            unitId,
            type: current.type,
            status: ExamStatus.SCHEDULED,
            scheduledAt,
            location:
              input.location === undefined
                ? current.location
                : nullable(input.location),
            externalProtocol: current.externalProtocol,
            attemptNumber: (aggregate._max.attemptNumber ?? 0) + 1,
            notes: current.notes,
            createdByUserId: actorUserId,
            rescheduledFromId: current.id,
          },
          include: examInclude,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "Exam",
          entityId: id,
          action: "RESCHEDULED",
          actorUserId,
          before: current,
          after: replacement,
        });
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.EXAM_RESCHEDULED,
          aggregateType: "Exam",
          aggregateId: replacement.id,
          payload: {
            examId: replacement.id,
            rescheduledFromId: id,
            processId: replacement.processId,
            studentId: replacement.studentId,
            scheduledAt: replacement.scheduledAt.toISOString(),
          },
          idempotencyKey: `exam-rescheduled:${tenantId}:${id}:${replacement.id}`,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "Exam",
          entityId: replacement.id,
          action: "CREATED_BY_RESCHEDULE",
          actorUserId,
          after: replacement,
        });
        return replacement;
      },
    );
  }

  private async transition(
    tenantId: string,
    actorUserId: string,
    id: string,
    allowed: ExamStatus[],
    status: ExamStatus,
    action: string,
    extra: Prisma.ExamUpdateManyMutationInput = {},
  ) {
    const current = await this.findOne(tenantId, id);
    if (!allowed.includes(current.status)) {
      throw new ConflictException(
        `Transição inválida de ${current.status} para ${status}.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.exam.updateMany({
        where: { id, tenantId, status: { in: allowed } },
        data: { status, ...extra },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          "O exame foi alterado por outra operação. Atualize e tente novamente.",
        );
      }
      const updated = await tx.exam.findFirstOrThrow({
        where: { id, tenantId },
        include: examInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Exam",
        entityId: id,
        action,
        actorUserId,
        before: current,
        after: updated,
      });
      const eventType =
        status === ExamStatus.CONFIRMED
          ? DomainEventType.EXAM_CONFIRMED
          : status === ExamStatus.CANCELLED
            ? DomainEventType.EXAM_CANCELLED
            : null;
      if (eventType) {
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: eventType,
          aggregateType: "Exam",
          aggregateId: updated.id,
          payload: {
            examId: updated.id,
            processId: updated.processId,
            studentId: updated.studentId,
            scheduledAt: updated.scheduledAt.toISOString(),
          },
          idempotencyKey: `${eventType.toLowerCase()}:${tenantId}:${updated.id}`,
        });
      }
      return updated;
    });
  }

  private async ensureStudentAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    studentId: string,
    scheduledAt: Date,
    excludeExamId?: string,
  ) {
    const endsAt = new Date(scheduledAt.getTime() + 60 * 60_000);
    const [student, practical, theoretical, exam] = await Promise.all([
      tx.student.findFirst({
        where: { id: studentId, tenantId, status: RegistryStatus.ACTIVE },
      }),
      tx.lesson.findFirst({
        where: {
          tenantId,
          studentId,
          status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
          startsAt: { lt: endsAt },
          endsAt: { gt: scheduledAt },
        },
      }),
      tx.theoreticalClass.findFirst({
        where: {
          tenantId,
          status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
          startsAt: { lt: endsAt },
          endsAt: { gt: scheduledAt },
          students: { some: { studentId } },
        },
      }),
      tx.exam.findFirst({
        where: {
          tenantId,
          id: excludeExamId ? { not: excludeExamId } : undefined,
          studentId,
          status: { in: [...ACTIVE_EXAM_STATUSES] },
          scheduledAt: {
            gt: new Date(scheduledAt.getTime() - 60 * 60_000),
            lt: endsAt,
          },
        },
      }),
    ]);
    if (!student) throw new NotFoundException("Aluno não encontrado.");
    if (practical || theoretical || exam) {
      throw new ConflictException("Conflito de horário do aluno.");
    }
  }
}
