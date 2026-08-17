import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DocumentUploadStatus,
  ExamStatus,
  LessonChangeRequestStatus,
  LessonStatus,
  ProcessDocumentStatus,
} from "@prumo/database";
import { createHash, randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { PracticalLessonsService } from "../schedule/practical-lessons.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import {
  CompleteDocumentUploadDto,
  CreateDocumentUploadDto,
  LessonChangeRequestDto,
  MobileRangeQueryDto,
} from "./dto/mobile.dto";
import { MobileAccessService } from "./mobile-access.service";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function matchesMimeType(content: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") {
    return content.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  if (mimeType === "image/png") {
    return content
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg") {
    return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  }
  return false;
}

function dateRange(query: MobileRangeQueryDto) {
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

function examStatus(value?: string): ExamStatus | undefined {
  if (!value) return undefined;
  if (!Object.values(ExamStatus).includes(value as ExamStatus)) {
    throw new BadRequestException("Status de exame inválido.");
  }
  return value as ExamStatus;
}

function scheduleStatus(value?: string): string | undefined {
  if (
    value &&
    !Object.values(LessonStatus).includes(value as LessonStatus) &&
    !Object.values(ExamStatus).includes(value as ExamStatus)
  ) {
    throw new BadRequestException("Status de compromisso inválido.");
  }
  return value;
}

@Injectable()
export class MobileStudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MobileAccessService,
    private readonly practicalLessons: PracticalLessonsService,
    private readonly storage: ObjectStorageService,
  ) {}

  async home(user: AuthenticatedUser) {
    const student = await this.access.student(user);
    const now = new Date();
    const [
      nextLesson,
      nextExam,
      activeProcess,
      completedLessons,
      pendingDocuments,
      installments,
      notifications,
    ] = await Promise.all([
      this.prisma.lesson.findFirst({
        where: {
          tenantId: user.tenantId,
          studentId: student.id,
          startsAt: { gte: now },
          status: { in: [LessonStatus.PENDING, LessonStatus.CONFIRMED] },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          instructor: { select: { name: true } },
          vehicle: { select: { model: true, plate: true } },
          unit: { select: { name: true, address: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
      this.prisma.exam.findFirst({
        where: {
          tenantId: user.tenantId,
          studentId: student.id,
          scheduledAt: { gte: now },
          status: { in: ["SCHEDULED", "CONFIRMED", "REQUESTED"] },
        },
        select: {
          id: true,
          type: true,
          status: true,
          scheduledAt: true,
          location: true,
        },
        orderBy: { scheduledAt: "asc" },
      }),
      this.prisma.studentLicenseProcess.findFirst({
        where: {
          tenantId: user.tenantId,
          studentId: student.id,
          status: { in: ["DRAFT", "PENDING_DOCUMENTS", "IN_PROGRESS"] },
        },
        select: {
          id: true,
          processType: true,
          status: true,
          openedAt: true,
          expiresAt: true,
          stages: { select: { status: true } },
        },
        orderBy: { openedAt: "desc" },
      }),
      this.prisma.lesson.count({
        where: {
          tenantId: user.tenantId,
          studentId: student.id,
          status: LessonStatus.COMPLETED,
        },
      }),
      this.prisma.processDocumentRequirement.count({
        where: {
          tenantId: user.tenantId,
          process: { studentId: student.id },
          required: true,
          status: {
            in: [
              ProcessDocumentStatus.PENDING,
              ProcessDocumentStatus.REJECTED,
              ProcessDocumentStatus.EXPIRED,
            ],
          },
        },
      }),
      this.prisma.receivableInstallment.findMany({
        where: {
          tenantId: user.tenantId,
          studentId: student.id,
          balanceCents: { gt: 0 },
          status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
        },
        select: {
          id: true,
          dueDate: true,
          balanceCents: true,
          status: true,
        },
        orderBy: { dueDate: "asc" },
        take: 3,
      }),
      this.prisma.notification.findMany({
        where: {
          tenantId: user.tenantId,
          userId: user.id,
          archivedAt: null,
        },
        select: {
          id: true,
          title: true,
          body: true,
          actionUrl: true,
          priority: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    const stages = activeProcess?.stages ?? [];
    const completedStages = stages.filter(
      ({ status }) => status === "COMPLETED" || status === "WAIVED",
    ).length;
    return {
      profile: student,
      nextLesson,
      nextExam,
      activeProcess: activeProcess
        ? {
            ...activeProcess,
            stages: undefined,
            completedStages,
            totalStages: stages.length,
            progressPercent: stages.length
              ? Math.round((completedStages / stages.length) * 100)
              : 0,
          }
        : null,
      practicalLessons: {
        completed: completedLessons,
        remaining: Math.max(0, 20 - completedLessons),
      },
      pendingDocuments,
      installments,
      notifications,
    };
  }

  async schedule(user: AuthenticatedUser, query: MobileRangeQueryDto) {
    const student = await this.access.student(user);
    const range = dateRange(query);
    const status = scheduleStatus(query.status);
    const [lessons, classes, exams] = await Promise.all([
      this.prisma.lesson.findMany({
        where: {
          tenantId: user.tenantId,
          studentId: student.id,
          startsAt: range,
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          unit: { select: { id: true, name: true, address: true } },
          instructor: { select: { id: true, name: true } },
        },
      }),
      this.prisma.theoreticalClass.findMany({
        where: {
          tenantId: user.tenantId,
          students: { some: { studentId: student.id } },
          startsAt: range,
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          status: true,
          unit: { select: { id: true, name: true, address: true } },
          instructor: { select: { id: true, name: true } },
        },
      }),
      this.prisma.exam.findMany({
        where: {
          tenantId: user.tenantId,
          studentId: student.id,
          scheduledAt: range,
        },
        select: {
          id: true,
          type: true,
          scheduledAt: true,
          status: true,
          location: true,
          unit: { select: { id: true, name: true, address: true } },
        },
      }),
    ]);
    return [
      ...lessons.map((item) => ({
        ...item,
        kind: "PRACTICAL_LESSON" as const,
        title: "Aula prática",
      })),
      ...classes.map((item) => ({
        ...item,
        kind: "THEORETICAL_CLASS" as const,
      })),
      ...exams.map((item) => ({
        ...item,
        kind: "EXAM" as const,
        title: `Exame ${item.type}`,
        startsAt: item.scheduledAt,
        endsAt: item.scheduledAt,
      })),
    ]
      .filter(
        (item) =>
          (!query.type || item.kind === query.type) &&
          (!status || item.status === status),
      )
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
  }

  async scheduleItem(user: AuthenticatedUser, id: string) {
    const items = await this.schedule(user, {});
    const item = items.find((candidate) => candidate.id === id);
    if (!item) throw new NotFoundException("Compromisso não encontrado.");
    return item;
  }

  async lessons(user: AuthenticatedUser, query: MobileRangeQueryDto) {
    const student = await this.access.student(user);
    return this.prisma.lesson.findMany({
      where: {
        tenantId: user.tenantId,
        studentId: student.id,
        startsAt: dateRange(query),
        status: lessonStatus(query.status),
      },
      select: {
        id: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        studentNotes: true,
        completedAt: true,
        instructor: { select: { id: true, name: true } },
        vehicle: { select: { id: true, model: true, plate: true } },
        unit: { select: { id: true, name: true, address: true } },
        evaluation: {
          where: { visibleToStudent: true },
          select: {
            control: true,
            attention: true,
            signaling: true,
            parking: true,
            gearShift: true,
            trafficRules: true,
            confidence: true,
            overallRating: true,
            notes: true,
          },
        },
      },
      orderBy: { startsAt: "desc" },
    });
  }

  async lesson(user: AuthenticatedUser, id: string) {
    const student = await this.access.student(user);
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, tenantId: user.tenantId, studentId: student.id },
      select: {
        id: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        studentNotes: true,
        cancellationReason: true,
        completedAt: true,
        instructor: { select: { id: true, name: true } },
        vehicle: { select: { id: true, model: true, plate: true } },
        unit: { select: { id: true, name: true, address: true } },
        rescheduledFrom: {
          select: { id: true, startsAt: true, endsAt: true, status: true },
        },
        rescheduledTo: {
          select: { id: true, startsAt: true, endsAt: true, status: true },
        },
        changeRequests: {
          where: { requestedByUserId: user.id },
          select: {
            id: true,
            type: true,
            status: true,
            reason: true,
            preferredStartsAt: true,
            responseNote: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        evaluation: {
          where: { visibleToStudent: true },
          select: {
            control: true,
            attention: true,
            signaling: true,
            parking: true,
            gearShift: true,
            trafficRules: true,
            confidence: true,
            overallRating: true,
            notes: true,
          },
        },
      },
    });
    if (!lesson) throw new NotFoundException("Aula não encontrada.");
    return lesson;
  }

  async confirmLesson(user: AuthenticatedUser, id: string) {
    await this.lesson(user, id);
    await this.practicalLessons.confirm(user.tenantId, user.id, id);
    return this.lesson(user, id);
  }

  async requestLessonChange(
    user: AuthenticatedUser,
    id: string,
    input: LessonChangeRequestDto,
  ) {
    const student = await this.access.student(user);
    const lesson = await this.lesson(user, id);
    if (
      lesson.status !== LessonStatus.PENDING &&
      lesson.status !== LessonStatus.CONFIRMED
    ) {
      throw new ConflictException(
        "Esta aula não aceita mais solicitações de alteração.",
      );
    }
    if (input.type === "RESCHEDULE" && !input.preferredStartsAt) {
      throw new BadRequestException(
        "Informe uma data preferencial para o reagendamento.",
      );
    }
    return this.prisma.lessonChangeRequest.create({
      data: {
        tenantId: user.tenantId,
        lessonId: id,
        studentId: student.id,
        requestedByUserId: user.id,
        type: input.type,
        reason: input.reason.trim(),
        preferredStartsAt: input.preferredStartsAt
          ? new Date(input.preferredStartsAt)
          : undefined,
      },
      select: {
        id: true,
        type: true,
        status: true,
        reason: true,
        preferredStartsAt: true,
        createdAt: true,
      },
    });
  }

  async cancelChangeRequest(user: AuthenticatedUser, id: string) {
    const student = await this.access.student(user);
    const result = await this.prisma.lessonChangeRequest.updateMany({
      where: {
        id,
        tenantId: user.tenantId,
        studentId: student.id,
        requestedByUserId: user.id,
        status: LessonChangeRequestStatus.PENDING,
      },
      data: { status: LessonChangeRequestStatus.CANCELLED },
    });
    if (!result.count)
      throw new NotFoundException("Solicitação pendente não encontrada.");
    return { id, status: LessonChangeRequestStatus.CANCELLED };
  }

  async processes(user: AuthenticatedUser) {
    const student = await this.access.student(user);
    return this.prisma.studentLicenseProcess.findMany({
      where: { tenantId: user.tenantId, studentId: student.id },
      select: {
        id: true,
        processType: true,
        status: true,
        protocolNumber: true,
        openedAt: true,
        expiresAt: true,
        completedAt: true,
        unit: { select: { id: true, name: true } },
        categories: {
          select: { category: { select: { code: true, name: true } } },
        },
        stages: { select: { status: true } },
      },
      orderBy: { openedAt: "desc" },
    });
  }

  async process(user: AuthenticatedUser, id: string) {
    const student = await this.access.student(user);
    const process = await this.prisma.studentLicenseProcess.findFirst({
      where: { id, tenantId: user.tenantId, studentId: student.id },
      select: {
        id: true,
        processType: true,
        status: true,
        protocolNumber: true,
        openedAt: true,
        expiresAt: true,
        completedAt: true,
        unit: { select: { id: true, name: true } },
        categories: {
          select: { category: { select: { code: true, name: true } } },
        },
        stages: {
          select: {
            id: true,
            type: true,
            status: true,
            order: true,
            required: true,
            startedAt: true,
            completedAt: true,
            blockedReason: true,
          },
          orderBy: { order: "asc" },
        },
        documents: {
          select: {
            id: true,
            documentType: true,
            required: true,
            status: true,
            expiresAt: true,
            rejectionReason: true,
          },
        },
        practicalLessons: {
          select: {
            id: true,
            status: true,
            startsAt: true,
            endsAt: true,
          },
          orderBy: { startsAt: "desc" },
        },
        exams: {
          select: {
            id: true,
            type: true,
            status: true,
            result: true,
            scheduledAt: true,
            attemptNumber: true,
          },
          orderBy: { scheduledAt: "desc" },
        },
      },
    });
    if (!process) throw new NotFoundException("Processo não encontrado.");
    const timeline = [
      ...process.stages.flatMap((stage) => [
        ...(stage.startedAt
          ? [
              {
                type: "STAGE_STARTED",
                label: `${stage.type} iniciada`,
                occurredAt: stage.startedAt,
              },
            ]
          : []),
        ...(stage.completedAt
          ? [
              {
                type: "STAGE_COMPLETED",
                label: `${stage.type} concluída`,
                occurredAt: stage.completedAt,
              },
            ]
          : []),
      ]),
      ...process.exams.map((exam) => ({
        type: "EXAM",
        label: `Exame ${exam.type}: ${exam.status}`,
        occurredAt: exam.scheduledAt,
      })),
      ...process.practicalLessons.map((lesson) => ({
        type: "LESSON",
        label: `Aula prática: ${lesson.status}`,
        occurredAt: lesson.startsAt,
      })),
    ].sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
    return { ...process, timeline };
  }

  async exams(user: AuthenticatedUser, query: MobileRangeQueryDto) {
    const student = await this.access.student(user);
    return this.prisma.exam.findMany({
      where: {
        tenantId: user.tenantId,
        studentId: student.id,
        scheduledAt: dateRange(query),
        status: examStatus(query.status),
      },
      select: {
        id: true,
        type: true,
        status: true,
        result: true,
        scheduledAt: true,
        location: true,
        attemptNumber: true,
        score: true,
        completedAt: true,
        unit: { select: { id: true, name: true, address: true } },
      },
      orderBy: { scheduledAt: "desc" },
    });
  }

  async exam(user: AuthenticatedUser, id: string) {
    const student = await this.access.student(user);
    const exam = await this.prisma.exam.findFirst({
      where: { id, tenantId: user.tenantId, studentId: student.id },
      select: {
        id: true,
        type: true,
        status: true,
        result: true,
        scheduledAt: true,
        location: true,
        attemptNumber: true,
        score: true,
        completedAt: true,
        cancellationReason: true,
        externalProtocol: true,
        unit: { select: { id: true, name: true, address: true } },
        process: {
          select: {
            id: true,
            exams: {
              select: {
                id: true,
                type: true,
                status: true,
                result: true,
                attemptNumber: true,
                score: true,
                scheduledAt: true,
              },
              orderBy: { attemptNumber: "desc" },
            },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException("Exame não encontrado.");
    return exam;
  }

  async financial(user: AuthenticatedUser) {
    const student = await this.access.student(user);
    const [contracts, installments, payments] = await Promise.all([
      this.prisma.studentContract.findMany({
        where: { tenantId: user.tenantId, studentId: student.id },
        select: {
          id: true,
          contractNumber: true,
          status: true,
          totalCents: true,
          signedAt: true,
          activatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.receivableInstallment.findMany({
        where: { tenantId: user.tenantId, studentId: student.id },
        select: {
          id: true,
          contractId: true,
          installmentNumber: true,
          dueDate: true,
          amountDueCents: true,
          amountPaidCents: true,
          balanceCents: true,
          status: true,
        },
        orderBy: { dueDate: "desc" },
      }),
      this.prisma.payment.findMany({
        where: { tenantId: user.tenantId, studentId: student.id },
        select: {
          id: true,
          contractId: true,
          amountCents: true,
          paymentMethod: true,
          status: true,
          receivedAt: true,
          externalReference: true,
          confirmedAt: true,
        },
        orderBy: { receivedAt: "desc" },
      }),
    ]);
    return {
      summary: {
        totalOpenCents: installments.reduce(
          (total, item) => total + item.balanceCents,
          0,
        ),
        overdueCents: installments
          .filter(({ status }) => status === "OVERDUE")
          .reduce((total, item) => total + item.balanceCents, 0),
        paidCents: payments
          .filter(({ status }) => status === "CONFIRMED")
          .reduce((total, item) => total + item.amountCents, 0),
      },
      contracts,
      installments,
      payments,
    };
  }

  async contract(user: AuthenticatedUser, id: string) {
    const student = await this.access.student(user);
    const contract = await this.prisma.studentContract.findFirst({
      where: { id, tenantId: user.tenantId, studentId: student.id },
      select: {
        id: true,
        contractNumber: true,
        status: true,
        subtotalCents: true,
        discountCents: true,
        surchargeCents: true,
        totalCents: true,
        signedAt: true,
        activatedAt: true,
        completedAt: true,
        unit: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPriceCents: true,
            discountCents: true,
            surchargeCents: true,
            totalCents: true,
          },
        },
        installments: {
          select: {
            id: true,
            installmentNumber: true,
            dueDate: true,
            amountDueCents: true,
            balanceCents: true,
            status: true,
          },
          orderBy: { installmentNumber: "asc" },
        },
      },
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado.");
    return contract;
  }

  async installment(user: AuthenticatedUser, id: string) {
    const student = await this.access.student(user);
    const installment = await this.prisma.receivableInstallment.findFirst({
      where: { id, tenantId: user.tenantId, studentId: student.id },
      select: {
        id: true,
        installmentNumber: true,
        dueDate: true,
        originalAmountCents: true,
        discountCents: true,
        interestCents: true,
        fineCents: true,
        adjustmentCents: true,
        amountDueCents: true,
        amountPaidCents: true,
        balanceCents: true,
        status: true,
        paidAt: true,
        contract: { select: { id: true, contractNumber: true } },
        allocations: {
          select: {
            amountCents: true,
            payment: {
              select: {
                id: true,
                paymentMethod: true,
                status: true,
                receivedAt: true,
              },
            },
          },
        },
      },
    });
    if (!installment) throw new NotFoundException("Parcela não encontrada.");
    return installment;
  }

  async payment(user: AuthenticatedUser, id: string) {
    const student = await this.access.student(user);
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId: user.tenantId, studentId: student.id },
      select: {
        id: true,
        amountCents: true,
        refundedAmountCents: true,
        paymentMethod: true,
        status: true,
        receivedAt: true,
        externalReference: true,
        confirmedAt: true,
        contract: { select: { id: true, contractNumber: true } },
        allocations: {
          select: {
            amountCents: true,
            installment: {
              select: {
                id: true,
                installmentNumber: true,
                dueDate: true,
              },
            },
          },
        },
        refunds: {
          select: {
            id: true,
            amountCents: true,
            reason: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
    if (!payment) throw new NotFoundException("Pagamento não encontrado.");
    return { ...payment, receiptUrl: null };
  }

  async documents(user: AuthenticatedUser) {
    const student = await this.access.student(user);
    return this.prisma.processDocumentRequirement.findMany({
      where: {
        tenantId: user.tenantId,
        process: { studentId: student.id },
      },
      select: {
        id: true,
        processId: true,
        documentType: true,
        required: true,
        status: true,
        expiresAt: true,
        rejectionReason: true,
        studentDocument: {
          select: {
            id: true,
            type: true,
            issuingAuthority: true,
            issuedAt: true,
            expiresAt: true,
            fileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async document(user: AuthenticatedUser, id: string) {
    const student = await this.access.student(user);
    const document = await this.prisma.processDocumentRequirement.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        process: { studentId: student.id },
      },
      select: {
        id: true,
        processId: true,
        documentType: true,
        required: true,
        status: true,
        expiresAt: true,
        rejectionReason: true,
        studentDocument: {
          select: {
            id: true,
            type: true,
            issuingAuthority: true,
            issuedAt: true,
            expiresAt: true,
            fileName: true,
            fileMimeType: true,
            fileSizeBytes: true,
            uploadedAt: true,
            storageKey: true,
          },
        },
      },
    });
    if (!document) throw new NotFoundException("Documento não encontrado.");
    return {
      ...document,
      studentDocument: document.studentDocument
        ? {
            ...document.studentDocument,
            storageKey: undefined,
            downloadUrl: document.studentDocument.storageKey
              ? `/mobile/student/documents/${document.studentDocument.id}/download`
              : null,
          }
        : null,
    };
  }

  async createUpload(user: AuthenticatedUser, input: CreateDocumentUploadDto) {
    const student = await this.access.student(user);
    if (!allowedMimeTypes.has(input.mimeType)) {
      throw new BadRequestException(
        "Use um arquivo PDF, JPEG ou PNG com até 10 MB.",
      );
    }
    if (input.documentId) {
      const owned = await this.prisma.studentDocument.count({
        where: {
          id: input.documentId,
          tenantId: user.tenantId,
          studentId: student.id,
        },
      });
      if (!owned) throw new NotFoundException("Documento não encontrado.");
    }
    if (input.processRequirementId) {
      const requirement =
        await this.prisma.processDocumentRequirement.findFirst({
          where: {
            id: input.processRequirementId,
            tenantId: user.tenantId,
            process: { studentId: student.id },
            documentType: input.documentType,
          },
        });
      if (!requirement)
        throw new NotFoundException("Pendência documental não encontrada.");
    }
    const token = `${randomUUID()}${randomUUID().replaceAll("-", "")}`;
    await this.prisma.documentUploadSession.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        studentId: student.id,
        documentId: input.documentId,
        processRequirementId: input.processRequirementId,
        tokenHash: tokenHash(token),
        documentType: input.documentType,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    return {
      uploadUrl: `/mobile/student/documents/uploads/${token}`,
      method: "PUT",
      expiresAt: new Date(Date.now() + 15 * 60_000),
      maxSizeBytes: 10 * 1024 * 1024,
      acceptedMimeTypes: [...allowedMimeTypes],
    };
  }

  async completeUpload(
    user: AuthenticatedUser,
    token: string,
    input: CompleteDocumentUploadDto,
  ) {
    const student = await this.access.student(user);
    const session = await this.prisma.documentUploadSession.findFirst({
      where: {
        tokenHash: tokenHash(token),
        tenantId: user.tenantId,
        userId: user.id,
        studentId: student.id,
      },
    });
    if (!session || session.expiresAt <= new Date())
      throw new NotFoundException("URL de upload inválida ou expirada.");
    if (session.status !== DocumentUploadStatus.PENDING) {
      throw new ConflictException("Este upload já foi processado.");
    }
    const content = Buffer.from(input.contentBase64, "base64");
    if (!content.length || content.length > 10 * 1024 * 1024) {
      throw new BadRequestException("Arquivo vazio ou maior que 10 MB.");
    }
    if (Math.abs(content.length - session.sizeBytes) > 8) {
      throw new BadRequestException("O tamanho do arquivo não confere.");
    }
    if (!matchesMimeType(content, session.mimeType)) {
      throw new BadRequestException(
        "O conteúdo do arquivo não corresponde ao tipo informado.",
      );
    }
    const claimed = await this.prisma.documentUploadSession.updateMany({
      where: {
        id: session.id,
        tenantId: user.tenantId,
        status: DocumentUploadStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      data: { status: DocumentUploadStatus.PROCESSING },
    });
    if (claimed.count !== 1) {
      throw new ConflictException("Este upload já está sendo processado.");
    }
    const extension =
      session.mimeType === "application/pdf"
        ? "pdf"
        : session.mimeType === "image/png"
          ? "png"
          : "jpg";
    const previous = session.documentId
      ? await this.prisma.studentDocument.findFirst({
          where: {
            id: session.documentId,
            tenantId: user.tenantId,
            studentId: student.id,
          },
          select: { storageKey: true },
        })
      : null;
    let storageKey: string | undefined;
    try {
      storageKey = await this.storage.putDocument({
        tenantId: user.tenantId,
        studentId: student.id,
        actorUserId: user.id,
        fileName: session.fileName,
        contentType: session.mimeType,
        extension,
        body: content,
      });
      const result = await this.prisma.$transaction(async (tx) => {
        const document = session.documentId
          ? await tx.studentDocument.update({
              where: { id: session.documentId },
              data: {
                fileName: session.fileName,
                fileMimeType: session.mimeType,
                fileSizeBytes: content.length,
                storageKey,
                uploadedAt: new Date(),
              },
            })
          : await tx.studentDocument.create({
              data: {
                tenantId: user.tenantId,
                studentId: student.id,
                type: session.documentType,
                number: `UPLOAD-${randomUUID()}`,
                fileName: session.fileName,
                fileMimeType: session.mimeType,
                fileSizeBytes: content.length,
                storageKey,
                uploadedAt: new Date(),
              },
            });
        if (session.processRequirementId) {
          await tx.processDocumentRequirement.update({
            where: { id: session.processRequirementId },
            data: {
              studentDocumentId: document.id,
              status: ProcessDocumentStatus.SUBMITTED,
              rejectionReason: null,
            },
          });
        }
        await tx.documentUploadSession.update({
          where: { id: session.id },
          data: {
            documentId: document.id,
            status: DocumentUploadStatus.UPLOADED,
            uploadedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            entityType: "StudentDocument",
            entityId: document.id,
            action: "DOCUMENT_UPLOADED",
            actorUserId: user.id,
          },
        });
        return document;
      });
      if (previous?.storageKey && previous.storageKey !== storageKey) {
        await this.storage
          .deleteDocument(user.tenantId, previous.storageKey)
          .catch(() => undefined);
      }
      return {
        id: result.id,
        type: result.type,
        fileName: result.fileName,
        uploadedAt: result.uploadedAt,
      };
    } catch (error) {
      await Promise.allSettled([
        storageKey
          ? this.storage.deleteDocument(user.tenantId, storageKey)
          : Promise.resolve(),
        this.prisma.documentUploadSession.updateMany({
          where: {
            id: session.id,
            tenantId: user.tenantId,
            status: DocumentUploadStatus.PROCESSING,
          },
          data: { status: DocumentUploadStatus.PENDING },
        }),
      ]);
      throw error;
    }
  }

  async downloadInfo(user: AuthenticatedUser, documentId: string) {
    const student = await this.access.student(user);
    const document = await this.prisma.studentDocument.findFirst({
      where: {
        id: documentId,
        tenantId: user.tenantId,
        studentId: student.id,
        storageKey: { not: null },
      },
      select: {
        id: true,
        storageKey: true,
        fileName: true,
        fileMimeType: true,
      },
    });
    if (!document?.storageKey)
      throw new NotFoundException("Arquivo não encontrado.");
    const signed = await this.storage.signedDownloadUrl({
      tenantId: user.tenantId,
      key: document.storageKey,
      fileName: document.fileName ?? "documento",
      contentType: document.fileMimeType ?? "application/octet-stream",
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        entityType: "StudentDocument",
        entityId: document.id,
        action: "DOCUMENT_FILE_ACCESSED",
        actorUserId: user.id,
      },
    });
    return {
      fileName: document.fileName ?? "documento",
      mimeType: document.fileMimeType ?? "application/octet-stream",
      ...signed,
    };
  }

  async profile(user: AuthenticatedUser) {
    const student = await this.access.student(user);
    return {
      ...student,
      user: { id: user.id, name: user.name, email: user.email },
      tenantId: user.tenantId,
      role: user.role,
    };
  }
}
