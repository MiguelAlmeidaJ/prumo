import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DomainEventType,
  LicenseProcessStatus,
  Prisma,
  ProcessStageStatus,
  ProcessStageType,
  RegistryStatus,
} from "@prumo/database";
import {
  nullable,
  optionalDate,
  throwConflict,
} from "../common/registration.utils";
import { PrismaService } from "../database/prisma.service";
import { DomainEventService } from "../communication/domain-event.service";
import { AuditService } from "../schedule/audit.service";
import {
  CreateLicenseProcessDto,
  ProcessReasonDto,
  UpdateLicenseProcessDto,
  UpdateProcessStageDto,
} from "./dto/process.dto";
import { ProcessProgressionService } from "./process-progression.service";

const processInclude = {
  student: { select: { id: true, name: true, cpf: true } },
  unit: { select: { id: true, name: true } },
  categories: {
    include: { category: true },
    orderBy: { category: { code: "asc" } },
  },
  stages: {
    include: {
      dependencies: {
        include: {
          dependsOn: { select: { id: true, type: true, status: true } },
        },
      },
    },
    orderBy: { order: "asc" },
  },
  documents: { orderBy: { documentType: "asc" } },
  exams: { orderBy: [{ type: "asc" }, { attemptNumber: "desc" }] },
  practicalLessons: {
    select: { id: true, status: true, startsAt: true, endsAt: true },
    orderBy: { startsAt: "desc" },
  },
  theoreticalClasses: {
    select: {
      id: true,
      attendanceStatus: true,
      theoreticalClass: {
        select: {
          id: true,
          title: true,
          status: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
    orderBy: { theoreticalClass: { startsAt: "desc" } },
  },
} satisfies Prisma.StudentLicenseProcessInclude;

const TERMINAL_STATUSES: LicenseProcessStatus[] = [
  LicenseProcessStatus.COMPLETED,
  LicenseProcessStatus.CANCELLED,
  LicenseProcessStatus.EXPIRED,
];
const OPERATIONAL_PROCESS_STATUSES: LicenseProcessStatus[] = [
  LicenseProcessStatus.PENDING_DOCUMENTS,
  LicenseProcessStatus.IN_PROGRESS,
];
const COMPLETED_STAGE_STATUSES: ProcessStageStatus[] = [
  ProcessStageStatus.COMPLETED,
  ProcessStageStatus.WAIVED,
];
const RULE_MANAGED_STAGES: ProcessStageType[] = [
  ProcessStageType.THEORETICAL_COURSE,
  ProcessStageType.THEORETICAL_EXAM,
  ProcessStageType.PRACTICAL_CLASSES,
  ProcessStageType.PRACTICAL_EXAM,
];
const STARTABLE_STAGE_STATUSES: ProcessStageStatus[] = [
  ProcessStageStatus.AVAILABLE,
  ProcessStageStatus.IN_PROGRESS,
];

@Injectable()
export class ProcessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progression: ProcessProgressionService,
    private readonly audit: AuditService,
    private readonly events: DomainEventService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    studentId: string,
    input: CreateLicenseProcessDto,
  ) {
    const codes = [
      ...new Set(input.categoryCodes.map((code) => code.toUpperCase())),
    ];
    if (codes.length !== input.categoryCodes.length) {
      throw new ConflictException("Existem categorias duplicadas.");
    }
    const [student, unit, categories] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: studentId, tenantId, status: RegistryStatus.ACTIVE },
      }),
      this.prisma.schoolUnit.findFirst({
        where: { id: input.unitId, tenantId, active: true },
      }),
      this.prisma.licenseCategory.findMany({
        where: { code: { in: codes }, active: true },
      }),
    ]);
    if (!student || !unit) {
      throw new NotFoundException(
        "Aluno ou unidade ativa não pertence ao tenant.",
      );
    }
    if (categories.length !== codes.length) {
      throw new NotFoundException("Uma ou mais categorias não existem.");
    }
    await this.ensureCompatible(
      tenantId,
      studentId,
      categories.map(({ id }) => id),
    );

    try {
      return await this.prisma.serializableTransaction(
        async (tx) => {
          const process = await tx.studentLicenseProcess.create({
            data: {
              tenantId,
              studentId,
              unitId: input.unitId,
              processType: input.processType,
              protocolNumber: nullable(input.protocolNumber),
              openedAt: input.openedAt ? new Date(input.openedAt) : undefined,
              expiresAt: optionalDate(input.expiresAt),
              notes: nullable(input.notes),
              createdByUserId: actorUserId,
            },
          });
          await tx.studentProcessCategory.createMany({
            data: categories.map((category) => ({
              tenantId,
              processId: process.id,
              categoryId: category.id,
            })),
          });
          await this.progression.createStructure(
            tx,
            tenantId,
            process.id,
            input.processType,
          );
          const result = await tx.studentLicenseProcess.findUniqueOrThrow({
            where: { id: process.id },
            include: processInclude,
          });
          await this.audit.record(tx, {
            tenantId,
            entityType: "StudentLicenseProcess",
            entityId: process.id,
            action: "CREATED",
            actorUserId,
            after: result,
          });
          await this.events.publishInTransaction(tx, {
            tenantId,
            type: DomainEventType.PROCESS_CREATED,
            aggregateType: "StudentLicenseProcess",
            aggregateId: result.id,
            payload: {
              processId: result.id,
              studentId: result.studentId,
              expiresAt: result.expiresAt?.toISOString(),
            },
            idempotencyKey: `process-created:${tenantId}:${result.id}`,
          });
          return result;
        },
      );
    } catch (error) {
      throwConflict(error, "Protocolo já cadastrado neste tenant.");
    }
  }

  async listForStudent(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("Aluno não encontrado.");
    return this.prisma.studentLicenseProcess.findMany({
      where: { tenantId, studentId },
      include: {
        unit: { select: { id: true, name: true } },
        categories: { include: { category: true } },
        _count: { select: { stages: true, exams: true, documents: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(tenantId: string, id: string) {
    const process = await this.prisma.studentLicenseProcess.findFirst({
      where: { id, tenantId },
      include: processInclude,
    });
    if (!process) throw new NotFoundException("Processo não encontrado.");
    return process;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateLicenseProcessDto,
  ) {
    const current = await this.findOne(tenantId, id);
    this.ensureMutable(current.status);
    const structural =
      input.unitId !== undefined ||
      input.processType !== undefined ||
      input.categoryCodes !== undefined;
    if (structural && current.status !== LicenseProcessStatus.DRAFT) {
      throw new ConflictException(
        "A estrutura só pode ser alterada enquanto o processo está em rascunho.",
      );
    }

    const unitId = input.unitId ?? current.unitId;
    const processType = input.processType ?? current.processType;
    const categoryCodes =
      input.categoryCodes ??
      current.categories.map((entry) => entry.category.code);
    const [unit, categories] = await Promise.all([
      this.prisma.schoolUnit.findFirst({
        where: { id: unitId, tenantId, active: true },
      }),
      this.prisma.licenseCategory.findMany({
        where: {
          code: {
            in: [...new Set(categoryCodes.map((code) => code.toUpperCase()))],
          },
          active: true,
        },
      }),
    ]);
    if (!unit || categories.length !== new Set(categoryCodes).size) {
      throw new NotFoundException("Unidade ou categoria inválida.");
    }

    try {
      return await this.prisma.serializableTransaction(
        async (tx) => {
          if (structural) {
            await tx.processDocumentRequirement.deleteMany({
              where: { tenantId, processId: id },
            });
            await tx.processStage.deleteMany({
              where: { tenantId, processId: id },
            });
            await tx.studentProcessCategory.deleteMany({
              where: { tenantId, processId: id },
            });
            await tx.studentProcessCategory.createMany({
              data: categories.map((category) => ({
                tenantId,
                processId: id,
                categoryId: category.id,
              })),
            });
            await this.progression.createStructure(
              tx,
              tenantId,
              id,
              processType,
            );
          }
          await tx.studentLicenseProcess.update({
            where: { id },
            data: {
              unitId,
              processType,
              protocolNumber: nullable(input.protocolNumber),
              openedAt: input.openedAt ? new Date(input.openedAt) : undefined,
              expiresAt: optionalDate(input.expiresAt),
              notes: nullable(input.notes),
            },
          });
          const result = await tx.studentLicenseProcess.findUniqueOrThrow({
            where: { id },
            include: processInclude,
          });
          await this.audit.record(tx, {
            tenantId,
            entityType: "StudentLicenseProcess",
            entityId: id,
            action: structural ? "STRUCTURE_UPDATED" : "UPDATED",
            actorUserId,
            before: current,
            after: result,
          });
          return result;
        },
      );
    } catch (error) {
      throwConflict(error, "Não foi possível atualizar o processo.");
    }
  }

  start(tenantId: string, actorUserId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.studentLicenseProcess.findFirst({
        where: { id, tenantId },
        include: { stages: true },
      });
      if (!current) throw new NotFoundException("Processo não encontrado.");
      if (current.status !== LicenseProcessStatus.DRAFT) {
        throw new ConflictException("Somente rascunhos podem ser iniciados.");
      }
      const registration = current.stages.find(
        (stage) => stage.type === ProcessStageType.REGISTRATION,
      );
      if (registration) {
        await tx.processStage.update({
          where: { id: registration.id },
          data: {
            status: ProcessStageStatus.COMPLETED,
            startedAt: new Date(),
            completedAt: new Date(),
          },
        });
      }
      const updated = await tx.studentLicenseProcess.update({
        where: { id },
        data: { status: LicenseProcessStatus.PENDING_DOCUMENTS },
      });
      await this.progression.sync(tx, tenantId, id, actorUserId);
      await this.audit.record(tx, {
        tenantId,
        entityType: "StudentLicenseProcess",
        entityId: id,
        action: "STARTED",
        actorUserId,
        before: current,
        after: updated,
      });
      return tx.studentLicenseProcess.findUniqueOrThrow({
        where: { id },
        include: processInclude,
      });
    });
  }

  suspend(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: ProcessReasonDto,
  ) {
    return this.transition(
      tenantId,
      actorUserId,
      id,
      [
        LicenseProcessStatus.PENDING_DOCUMENTS,
        LicenseProcessStatus.IN_PROGRESS,
      ],
      LicenseProcessStatus.SUSPENDED,
      "SUSPENDED",
      { notes: input.reason.trim() },
    );
  }

  resume(tenantId: string, actorUserId: string, id: string) {
    return this.transition(
      tenantId,
      actorUserId,
      id,
      [LicenseProcessStatus.SUSPENDED],
      LicenseProcessStatus.IN_PROGRESS,
      "RESUMED",
    );
  }

  async complete(tenantId: string, actorUserId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.studentLicenseProcess.findFirst({
        where: { id, tenantId },
        include: { stages: { orderBy: { order: "asc" } } },
      });
      if (!current) throw new NotFoundException("Processo não encontrado.");
      if (!OPERATIONAL_PROCESS_STATUSES.includes(current.status)) {
        throw new ConflictException("O processo não pode ser concluído.");
      }
      await this.progression.sync(tx, tenantId, id, actorUserId);
      const stages = await tx.processStage.findMany({
        where: { tenantId, processId: id },
      });
      const pending = stages.filter(
        (stage) =>
          stage.required &&
          stage.type !== ProcessStageType.LICENSE_ISSUANCE &&
          !COMPLETED_STAGE_STATUSES.includes(stage.status),
      );
      if (pending.length) {
        throw new ConflictException("Existem etapas obrigatórias pendentes.");
      }
      const issuance = stages.find(
        (stage) => stage.type === ProcessStageType.LICENSE_ISSUANCE,
      );
      if (issuance) {
        await tx.processStage.update({
          where: { id: issuance.id },
          data: {
            status: ProcessStageStatus.COMPLETED,
            startedAt: issuance.startedAt ?? new Date(),
            completedAt: new Date(),
            blockedReason: null,
          },
        });
      }
      const updated = await tx.studentLicenseProcess.update({
        where: { id },
        data: {
          status: LicenseProcessStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "StudentLicenseProcess",
        entityId: id,
        action: "COMPLETED",
        actorUserId,
        before: current,
        after: updated,
      });
      return tx.studentLicenseProcess.findUniqueOrThrow({
        where: { id },
        include: processInclude,
      });
    });
  }

  async cancel(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: ProcessReasonDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.studentLicenseProcess.findFirst({
        where: { id, tenantId },
      });
      if (!current) throw new NotFoundException("Processo não encontrado.");
      this.ensureMutable(current.status);
      await tx.processStage.updateMany({
        where: {
          tenantId,
          processId: id,
          status: {
            notIn: [ProcessStageStatus.COMPLETED, ProcessStageStatus.WAIVED],
          },
        },
        data: { status: ProcessStageStatus.CANCELLED },
      });
      const updated = await tx.studentLicenseProcess.update({
        where: { id },
        data: {
          status: LicenseProcessStatus.CANCELLED,
          cancelledAt: new Date(),
          notes: input.reason.trim(),
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "StudentLicenseProcess",
        entityId: id,
        action: "CANCELLED",
        actorUserId,
        before: current,
        after: updated,
      });
      return updated;
    });
  }

  progress(tenantId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.studentLicenseProcess.findFirstOrThrow({
        where: { id, tenantId },
      });
      return this.progression.progress(tx, tenantId, id);
    });
  }

  async timeline(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    const related = await this.prisma.studentLicenseProcess.findFirstOrThrow({
      where: { id, tenantId },
      select: {
        stages: { select: { id: true } },
        documents: { select: { id: true } },
        exams: { select: { id: true } },
      },
    });
    const ids = [
      id,
      ...related.stages.map(({ id: value }) => value),
      ...related.documents.map(({ id: value }) => value),
      ...related.exams.map(({ id: value }) => value),
    ];
    return this.prisma.auditLog.findMany({
      where: { tenantId, entityId: { in: ids } },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async updateStage(
    tenantId: string,
    actorUserId: string,
    processId: string,
    stageId: string,
    input: UpdateProcessStageDto,
  ) {
    const process = await this.findOne(tenantId, processId);
    this.ensureMutable(process.status);
    const stage = process.stages.find((item) => item.id === stageId);
    if (!stage) throw new NotFoundException("Etapa não encontrada.");
    if (
      input.status === ProcessStageStatus.COMPLETED &&
      RULE_MANAGED_STAGES.includes(stage.type)
    ) {
      throw new ConflictException(
        "Esta etapa é concluída somente pelo motor de progressão.",
      );
    }
    if (
      STARTABLE_STAGE_STATUSES.includes(input.status) &&
      stage.dependencies.some(
        (dependency) =>
          !COMPLETED_STAGE_STATUSES.includes(dependency.dependsOn.status),
      )
    ) {
      throw new ConflictException("As dependências da etapa estão pendentes.");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.processStage.update({
        where: { id: stageId },
        data: {
          status: input.status,
          notes: nullable(input.notes),
          blockedReason:
            input.status === ProcessStageStatus.BLOCKED
              ? nullable(input.blockedReason)
              : null,
          startedAt:
            input.status === ProcessStageStatus.IN_PROGRESS
              ? (stage.startedAt ?? new Date())
              : stage.startedAt,
          completedAt:
            input.status === ProcessStageStatus.COMPLETED ? new Date() : null,
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ProcessStage",
        entityId: stageId,
        action: "STATUS_CHANGED",
        actorUserId,
        before: stage,
        after: updated,
      });
      await this.progression.sync(tx, tenantId, processId, actorUserId);
      if (input.status === ProcessStageStatus.COMPLETED) {
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.PROCESS_STAGE_COMPLETED,
          aggregateType: "ProcessStage",
          aggregateId: updated.id,
          payload: {
            processId,
            stageId: updated.id,
            stageType: updated.type,
          },
          idempotencyKey: `process-stage-completed:${tenantId}:${updated.id}`,
        });
      }
      return updated;
    });
  }

  private async transition(
    tenantId: string,
    actorUserId: string,
    id: string,
    allowed: LicenseProcessStatus[],
    status: LicenseProcessStatus,
    action: string,
    extra: Prisma.StudentLicenseProcessUpdateManyMutationInput = {},
  ) {
    const current = await this.findOne(tenantId, id);
    if (!allowed.includes(current.status)) {
      throw new ConflictException(
        `Transição inválida de ${current.status} para ${status}.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.studentLicenseProcess.updateMany({
        where: { id, tenantId, status: { in: allowed } },
        data: { status, ...extra },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          "O processo foi alterado por outra operação. Atualize e tente novamente.",
        );
      }
      const updated = await tx.studentLicenseProcess.findFirstOrThrow({
        where: { id, tenantId },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "StudentLicenseProcess",
        entityId: id,
        action,
        actorUserId,
        before: current,
        after: updated,
      });
      return updated;
    });
  }

  private async ensureCompatible(
    tenantId: string,
    studentId: string,
    categoryIds: string[],
  ) {
    const process = await this.prisma.studentLicenseProcess.findFirst({
      where: {
        tenantId,
        studentId,
        status: {
          notIn: [...TERMINAL_STATUSES],
        },
        OR: [
          { categories: { some: { categoryId: { in: categoryIds } } } },
          {
            processType: {
              in: [
                "FIRST_LICENSE",
                "CATEGORY_CHANGE",
                "RENEWAL",
                "REHABILITATION",
              ],
            },
          },
        ],
      },
    });
    if (process) {
      throw new ConflictException(
        "O aluno já possui um processo ativo incompatível.",
      );
    }
  }

  private ensureMutable(status: LicenseProcessStatus) {
    if (TERMINAL_STATUSES.includes(status)) {
      throw new ConflictException(
        "Processos concluídos, cancelados ou expirados são imutáveis.",
      );
    }
  }
}
