import { ConflictException, Injectable } from "@nestjs/common";
import {
  ExamResult,
  ExamType,
  LicenseProcessStatus,
  LicenseProcessType,
  Prisma,
  ProcessDocumentStatus,
  ProcessStageStatus,
  ProcessStageType,
  StudentDocumentType,
} from "@prisma/client";
import { AuditService } from "../schedule/audit.service";

export const THEORETICAL_MINUTES = 45 * 60;
export const PRACTICAL_MINUTES = 20 * 60;
const LESSON_MINUTES = 50;
const COMPLETED_DOCUMENT_STATUSES: ProcessDocumentStatus[] = [
  ProcessDocumentStatus.APPROVED,
  ProcessDocumentStatus.WAIVED,
];
const TERMINAL_PROCESS_STATUSES: LicenseProcessStatus[] = [
  LicenseProcessStatus.COMPLETED,
  LicenseProcessStatus.CANCELLED,
  LicenseProcessStatus.EXPIRED,
];
const COMPLETED_STAGE_STATUSES: ProcessStageStatus[] = [
  ProcessStageStatus.COMPLETED,
  ProcessStageStatus.WAIVED,
];
const TERMINAL_STAGE_STATUSES: ProcessStageStatus[] = [
  ...COMPLETED_STAGE_STATUSES,
  ProcessStageStatus.CANCELLED,
];
const OPERATIONAL_PROCESS_STATUSES: LicenseProcessStatus[] = [
  LicenseProcessStatus.IN_PROGRESS,
  LicenseProcessStatus.PENDING_DOCUMENTS,
];
const ELIGIBLE_EXAM_STAGE_STATUSES: ProcessStageStatus[] = [
  ProcessStageStatus.AVAILABLE,
  ProcessStageStatus.IN_PROGRESS,
  ProcessStageStatus.FAILED,
];

const FULL_STAGES = [
  ProcessStageType.REGISTRATION,
  ProcessStageType.DOCUMENT_REVIEW,
  ProcessStageType.MEDICAL_EXAM,
  ProcessStageType.PSYCHOLOGICAL_EXAM,
  ProcessStageType.THEORETICAL_COURSE,
  ProcessStageType.THEORETICAL_EXAM,
  ProcessStageType.PRACTICAL_CLASSES,
  ProcessStageType.PRACTICAL_EXAM,
  ProcessStageType.LICENSE_ISSUANCE,
] as const;

const PROCESS_BLUEPRINTS: Record<
  LicenseProcessType,
  readonly ProcessStageType[]
> = {
  [LicenseProcessType.FIRST_LICENSE]: FULL_STAGES,
  [LicenseProcessType.REHABILITATION]: FULL_STAGES,
  [LicenseProcessType.CATEGORY_ADDITION]: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.MEDICAL_EXAM,
    ProcessStageType.PSYCHOLOGICAL_EXAM,
    ProcessStageType.PRACTICAL_CLASSES,
    ProcessStageType.PRACTICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
  [LicenseProcessType.CATEGORY_CHANGE]: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.MEDICAL_EXAM,
    ProcessStageType.PSYCHOLOGICAL_EXAM,
    ProcessStageType.PRACTICAL_CLASSES,
    ProcessStageType.PRACTICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
  [LicenseProcessType.RENEWAL]: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.MEDICAL_EXAM,
    ProcessStageType.PSYCHOLOGICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
  [LicenseProcessType.REFRESHER]: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.THEORETICAL_COURSE,
    ProcessStageType.THEORETICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
};

const EXAM_STAGE: Record<ExamType, ProcessStageType> = {
  [ExamType.MEDICAL]: ProcessStageType.MEDICAL_EXAM,
  [ExamType.PSYCHOLOGICAL]: ProcessStageType.PSYCHOLOGICAL_EXAM,
  [ExamType.THEORETICAL]: ProcessStageType.THEORETICAL_EXAM,
  [ExamType.PRACTICAL]: ProcessStageType.PRACTICAL_EXAM,
};

@Injectable()
export class ProcessProgressionService {
  constructor(private readonly audit: AuditService) {}

  stageTypes(processType: LicenseProcessType): readonly ProcessStageType[] {
    return PROCESS_BLUEPRINTS[processType];
  }

  documentTypes(processType: LicenseProcessType): StudentDocumentType[] {
    const types: StudentDocumentType[] = [
      StudentDocumentType.RG,
      StudentDocumentType.PROOF_OF_ADDRESS,
    ];
    if (processType !== LicenseProcessType.FIRST_LICENSE) {
      types.push(StudentDocumentType.CNH);
    }
    return types;
  }

  async createStructure(
    tx: Prisma.TransactionClient,
    tenantId: string,
    processId: string,
    processType: LicenseProcessType,
  ) {
    const types = this.stageTypes(processType);
    const stages = [];
    for (let index = 0; index < types.length; index += 1) {
      stages.push(
        await tx.processStage.create({
          data: {
            tenantId,
            processId,
            type: types[index],
            order: index + 1,
            required: true,
            status:
              index === 0
                ? ProcessStageStatus.AVAILABLE
                : ProcessStageStatus.BLOCKED,
            blockedReason:
              index === 0 ? null : "A etapa anterior ainda está pendente.",
          },
        }),
      );
    }
    for (let index = 1; index < stages.length; index += 1) {
      await tx.processStageDependency.create({
        data: {
          tenantId,
          stageId: stages[index].id,
          dependsOnStageId: stages[index - 1].id,
        },
      });
    }
    await tx.processDocumentRequirement.createMany({
      data: this.documentTypes(processType).map((documentType) => ({
        tenantId,
        processId,
        documentType,
        required: true,
      })),
    });
    return stages;
  }

  async progress(
    tx: Prisma.TransactionClient,
    tenantId: string,
    processId: string,
  ) {
    const [
      process,
      practicalLessons,
      theoreticalEnrollments,
      documents,
    ] = await Promise.all([
      tx.studentLicenseProcess.findFirstOrThrow({
        where: { id: processId, tenantId },
        select: { processType: true },
      }),
      tx.lesson.findMany({
        where: { tenantId, processId },
        select: { status: true, startsAt: true, endsAt: true },
      }),
      tx.theoreticalClassStudent.findMany({
        where: { tenantId, processId },
        select: {
          attendanceStatus: true,
          theoreticalClass: {
            select: { status: true, startsAt: true, endsAt: true },
          },
        },
      }),
      tx.processDocumentRequirement.findMany({
        where: { tenantId, processId },
        select: { required: true, status: true },
      }),
    ]);

    const completedPractical = practicalLessons.filter(
      (lesson) => lesson.status === "COMPLETED",
    );
    const completedTheory = theoreticalEnrollments.filter(
      (entry) =>
        entry.theoreticalClass.status === "COMPLETED" &&
        entry.attendanceStatus !== "ABSENT",
    );
    const practicalMinutes = this.durationMinutes(
      completedPractical.map((lesson) => ({
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt,
      })),
    );
    const theoreticalMinutes = this.durationMinutes(
      completedTheory.map((entry) => ({
        startsAt: entry.theoreticalClass.startsAt,
        endsAt: entry.theoreticalClass.endsAt,
      })),
    );
    const requiresTheory = this.stageTypes(process.processType).includes(
      ProcessStageType.THEORETICAL_COURSE,
    );
    const requiresPractical = this.stageTypes(process.processType).includes(
      ProcessStageType.PRACTICAL_CLASSES,
    );

    return {
      theoretical: {
        completedLessons: completedTheory.length,
        minutes: theoreticalMinutes,
        hours: theoreticalMinutes / 60,
        requiredMinutes: requiresTheory ? THEORETICAL_MINUTES : 0,
        remainingLessons: requiresTheory
          ? Math.ceil(
              Math.max(0, THEORETICAL_MINUTES - theoreticalMinutes) /
                LESSON_MINUTES,
            )
          : 0,
      },
      practical: {
        completedLessons: completedPractical.length,
        minutes: practicalMinutes,
        hours: practicalMinutes / 60,
        requiredMinutes: requiresPractical ? PRACTICAL_MINUTES : 0,
        remainingLessons: requiresPractical
          ? Math.ceil(
              Math.max(0, PRACTICAL_MINUTES - practicalMinutes) /
                LESSON_MINUTES,
            )
          : 0,
      },
      absences:
        practicalLessons.filter((lesson) => lesson.status === "NO_SHOW")
          .length +
        theoreticalEnrollments.filter(
          (entry) => entry.attendanceStatus === "ABSENT",
        ).length,
      cancellations: practicalLessons.filter(
        (lesson) => lesson.status === "CANCELLED",
      ).length,
      documents: {
        total: documents.length,
        approved: documents.filter((document) =>
          COMPLETED_DOCUMENT_STATUSES.includes(document.status),
        ).length,
        pending: documents.filter(
          (document) =>
            document.required &&
            !COMPLETED_DOCUMENT_STATUSES.includes(document.status),
        ).length,
      },
    };
  }

  async sync(
    tx: Prisma.TransactionClient,
    tenantId: string,
    processId: string,
    actorUserId: string,
  ) {
    const [process, stages, progress, approvedExams] = await Promise.all([
      tx.studentLicenseProcess.findFirstOrThrow({
        where: { id: processId, tenantId },
      }),
      tx.processStage.findMany({
        where: { tenantId, processId },
        include: {
          dependencies: {
            include: { dependsOn: { select: { status: true } } },
          },
        },
        orderBy: { order: "asc" },
      }),
      this.progress(tx, tenantId, processId),
      tx.exam.findMany({
        where: {
          tenantId,
          processId,
          status: "COMPLETED",
          result: ExamResult.APPROVED,
        },
        select: { type: true },
      }),
    ]);
    if (
      TERMINAL_PROCESS_STATUSES.includes(process.status)
    ) {
      return stages;
    }

    const approvedTypes = new Set(approvedExams.map((exam) => exam.type));
    const currentStatuses = new Map(
      stages.map((stage) => [stage.id, stage.status]),
    );
    for (const stage of stages) {
      let target = stage.status;
      if (
        stage.type === ProcessStageType.DOCUMENT_REVIEW &&
        progress.documents.pending === 0
      ) {
        target = ProcessStageStatus.COMPLETED;
      } else if (
        stage.type === ProcessStageType.THEORETICAL_COURSE &&
        progress.theoretical.minutes >= progress.theoretical.requiredMinutes
      ) {
        target = ProcessStageStatus.COMPLETED;
      } else if (
        stage.type === ProcessStageType.PRACTICAL_CLASSES &&
        progress.practical.minutes >= progress.practical.requiredMinutes
      ) {
        target = ProcessStageStatus.COMPLETED;
      } else {
        const examType = this.examTypeForStage(stage.type);
        if (examType && approvedTypes.has(examType)) {
          target = ProcessStageStatus.COMPLETED;
        }
      }

      if (
        !TERMINAL_STAGE_STATUSES.includes(target)
      ) {
        const dependenciesComplete = stage.dependencies.every((dependency) =>
          COMPLETED_STAGE_STATUSES.includes(
            currentStatuses.get(dependency.dependsOnStageId) ??
              dependency.dependsOn.status,
          ),
        );
        if (dependenciesComplete) {
          target =
            target === ProcessStageStatus.IN_PROGRESS
              ? target
              : ProcessStageStatus.AVAILABLE;
        } else {
          target = ProcessStageStatus.BLOCKED;
        }
      }

      currentStatuses.set(stage.id, target);
      if (target !== stage.status) {
        const updated = await tx.processStage.update({
          where: { id: stage.id },
          data: {
            status: target,
            startedAt:
              target === ProcessStageStatus.IN_PROGRESS
                ? (stage.startedAt ?? new Date())
                : stage.startedAt,
            completedAt:
              target === ProcessStageStatus.COMPLETED
                ? (stage.completedAt ?? new Date())
                : target === ProcessStageStatus.AVAILABLE ||
                    target === ProcessStageStatus.BLOCKED
                  ? null
                  : stage.completedAt,
            blockedReason:
              target === ProcessStageStatus.BLOCKED
                ? "Uma dependência obrigatória ainda está pendente."
                : null,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "ProcessStage",
          entityId: stage.id,
          action: "PROGRESSED",
          actorUserId,
          before: stage,
          after: updated,
        });
      }
    }
    if (
      process.status === LicenseProcessStatus.PENDING_DOCUMENTS &&
      progress.documents.pending === 0
    ) {
      const updated = await tx.studentLicenseProcess.update({
        where: { id: processId },
        data: { status: LicenseProcessStatus.IN_PROGRESS },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "StudentLicenseProcess",
        entityId: processId,
        action: "DOCUMENTS_COMPLETED",
        actorUserId,
        before: process,
        after: updated,
      });
    }
    return tx.processStage.findMany({
      where: { tenantId, processId },
      orderBy: { order: "asc" },
    });
  }

  async ensureExamEligible(
    tx: Prisma.TransactionClient,
    tenantId: string,
    processId: string,
    type: ExamType,
  ) {
    const process = await tx.studentLicenseProcess.findFirst({
      where: { id: processId, tenantId },
      include: { stages: true },
    });
    if (!process) {
      throw new ConflictException("Processo não encontrado no tenant ativo.");
    }
    if (
      !OPERATIONAL_PROCESS_STATUSES.includes(process.status)
    ) {
      throw new ConflictException(
        `Não é possível agendar exame em processo ${process.status}.`,
      );
    }
    if (process.expiresAt && process.expiresAt < new Date()) {
      throw new ConflictException("O processo está expirado.");
    }
    const stageType = EXAM_STAGE[type];
    const stage = process.stages.find((item) => item.type === stageType);
    if (!stage) {
      throw new ConflictException(
        "Este tipo de exame não pertence ao fluxo do processo.",
      );
    }
    const progress = await this.progress(tx, tenantId, processId);
    if (
      type === ExamType.THEORETICAL &&
      progress.theoretical.minutes < progress.theoretical.requiredMinutes
    ) {
      throw new ConflictException("Carga horária teórica insuficiente.");
    }
    if (type === ExamType.PRACTICAL) {
      const theoryApproved = await tx.exam.findFirst({
        where: {
          tenantId,
          processId,
          type: ExamType.THEORETICAL,
          status: "COMPLETED",
          result: ExamResult.APPROVED,
        },
      });
      const requiresTheory = process.stages.some(
        (item) => item.type === ProcessStageType.THEORETICAL_EXAM,
      );
      if (requiresTheory && !theoryApproved) {
        throw new ConflictException(
          "O exame teórico ainda não foi aprovado.",
        );
      }
      if (progress.practical.minutes < progress.practical.requiredMinutes) {
        throw new ConflictException("Carga horária prática insuficiente.");
      }
    }
    if (
      !ELIGIBLE_EXAM_STAGE_STATUSES.includes(stage.status)
    ) {
      throw new ConflictException(
        "A etapa correspondente ao exame ainda está bloqueada.",
      );
    }
    return process;
  }

  examStage(type: ExamType): ProcessStageType {
    return EXAM_STAGE[type];
  }

  private examTypeForStage(type: ProcessStageType): ExamType | undefined {
    return Object.entries(EXAM_STAGE).find(
      ([, stageType]) => stageType === type,
    )?.[0] as ExamType | undefined;
  }

  private durationMinutes(
    intervals: Array<{ startsAt: Date; endsAt: Date }>,
  ) {
    return intervals.reduce(
      (total, interval) =>
        total +
        Math.max(
          0,
          Math.round(
            (interval.endsAt.getTime() - interval.startsAt.getTime()) / 60_000,
          ),
        ),
      0,
    );
  }
}
