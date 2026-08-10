import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DomainEventType,
  LicenseProcessStatus,
  Prisma,
  ProcessDocumentStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { nullable, optionalDate } from "../common/registration.utils";
import { PrismaService } from "../database/prisma.service";
import { DomainEventService } from "../communication/domain-event.service";
import { AuditService } from "../schedule/audit.service";
import {
  LinkProcessDocumentDto,
  RejectProcessDocumentDto,
  UploadProcessDocumentDto,
} from "./dto/process.dto";
import { ProcessProgressionService } from "./process-progression.service";

const COMPLETED_DOCUMENT_STATUSES: ProcessDocumentStatus[] = [
  ProcessDocumentStatus.APPROVED,
  ProcessDocumentStatus.WAIVED,
];
const TERMINAL_PROCESS_STATUSES: LicenseProcessStatus[] = [
  LicenseProcessStatus.COMPLETED,
  LicenseProcessStatus.CANCELLED,
  LicenseProcessStatus.EXPIRED,
];
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

function matchesMimeType(content: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") {
    return content.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  if (mimeType === "image/png") {
    return content
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return (
    mimeType === "image/jpeg" &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  );
}

@Injectable()
export class ProcessDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progression: ProcessProgressionService,
    private readonly audit: AuditService,
    private readonly events: DomainEventService,
  ) {}

  async list(tenantId: string, processId: string) {
    await this.ensureProcess(tenantId, processId);
    return this.prisma.processDocumentRequirement.findMany({
      where: { tenantId, processId },
      include: {
        studentDocument: true,
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { documentType: "asc" },
    });
  }

  async link(
    tenantId: string,
    actorUserId: string,
    processId: string,
    requirementId: string,
    input: LinkProcessDocumentDto,
  ) {
    const [process, requirement] = await Promise.all([
      this.ensureProcess(tenantId, processId),
      this.findRequirement(tenantId, processId, requirementId),
    ]);
    const document = await this.prisma.studentDocument.findFirst({
      where: {
        id: input.studentDocumentId,
        tenantId,
        studentId: process.studentId,
        type: requirement.documentType,
      },
    });
    if (!document) {
      throw new NotFoundException(
        "Documento compatível não pertence ao aluno deste processo.",
      );
    }
    return this.change(
      tenantId,
      actorUserId,
      processId,
      requirement,
      {
        status: ProcessDocumentStatus.SUBMITTED,
        studentDocumentId: document.id,
        expiresAt: optionalDate(input.expiresAt) ?? document.expiresAt,
        reviewedAt: null,
        reviewedByUserId: null,
        rejectionReason: null,
      },
      "DOCUMENT_LINKED",
    );
  }

  async upload(
    tenantId: string,
    actorUserId: string,
    processId: string,
    requirementId: string,
    input: UploadProcessDocumentDto,
  ) {
    const [process, requirement] = await Promise.all([
      this.ensureProcess(tenantId, processId),
      this.findRequirement(tenantId, processId, requirementId),
    ]);
    if (COMPLETED_DOCUMENT_STATUSES.includes(requirement.status)) {
      throw new ConflictException("O requisito já foi concluído.");
    }
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new BadRequestException(
        "Use um arquivo PDF, JPEG ou PNG com até 10 MB.",
      );
    }
    const content = Buffer.from(input.contentBase64, "base64");
    if (
      !content.length ||
      content.length > 10 * 1024 * 1024 ||
      Math.abs(content.length - input.sizeBytes) > 8
    ) {
      throw new BadRequestException("O tamanho do arquivo não confere.");
    }
    if (!matchesMimeType(content, input.mimeType)) {
      throw new BadRequestException(
        "O conteúdo do arquivo não corresponde ao tipo informado.",
      );
    }
    const extension =
      input.mimeType === "application/pdf"
        ? "pdf"
        : input.mimeType === "image/png"
          ? "png"
          : "jpg";
    const storageKey = `${tenantId}/${process.studentId}/${randomUUID()}.${extension}`;
    const destination = join(this.uploadDirectory(), ...storageKey.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, { flag: "wx" });
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const document = await transaction.studentDocument.create({
          data: {
            tenantId,
            studentId: process.studentId,
            type: requirement.documentType,
            number: `UPLOAD-${randomUUID()}`,
            fileName: input.fileName.trim(),
            fileMimeType: input.mimeType,
            fileSizeBytes: content.length,
            storageKey,
            uploadedAt: new Date(),
          },
        });
        const updated = await transaction.processDocumentRequirement.update({
          where: { id: requirement.id },
          data: {
            studentDocumentId: document.id,
            status: ProcessDocumentStatus.SUBMITTED,
            reviewedAt: null,
            reviewedByUserId: null,
            rejectionReason: null,
          },
          include: { studentDocument: true },
        });
        await this.audit.record(transaction, {
          tenantId,
          entityType: "ProcessDocumentRequirement",
          entityId: requirement.id,
          action: "DOCUMENT_UPLOADED",
          actorUserId,
          before: requirement,
          after: updated,
        });
        await this.progression.sync(
          transaction,
          tenantId,
          processId,
          actorUserId,
        );
        return updated;
      });
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    }
  }

  async file(tenantId: string, processId: string, requirementId: string) {
    const processExists = await this.prisma.studentLicenseProcess.count({
      where: { id: processId, tenantId },
    });
    if (!processExists) throw new NotFoundException("Processo não encontrado.");
    const requirement = await this.prisma.processDocumentRequirement.findFirst({
      where: { id: requirementId, tenantId, processId },
      select: {
        studentDocument: {
          select: { fileName: true, fileMimeType: true, storageKey: true },
        },
      },
    });
    const document = requirement?.studentDocument;
    if (!document?.storageKey || !document.fileName || !document.fileMimeType) {
      throw new NotFoundException("Arquivo não encontrado.");
    }
    const content = await readFile(
      join(this.uploadDirectory(), ...document.storageKey.split("/")),
    ).catch(() => null);
    if (!content) throw new NotFoundException("Arquivo não encontrado.");
    return {
      fileName: document.fileName,
      mimeType: document.fileMimeType,
      contentBase64: content.toString("base64"),
    };
  }

  async submit(
    tenantId: string,
    actorUserId: string,
    processId: string,
    requirementId: string,
  ) {
    await this.ensureProcess(tenantId, processId);
    const requirement = await this.findRequirement(
      tenantId,
      processId,
      requirementId,
    );
    if (
      requirement.status !== ProcessDocumentStatus.SUBMITTED ||
      !requirement.studentDocumentId
    ) {
      throw new ConflictException(
        "Vincule um documento antes de enviá-lo para análise.",
      );
    }
    return this.change(
      tenantId,
      actorUserId,
      processId,
      requirement,
      { status: ProcessDocumentStatus.UNDER_REVIEW },
      "DOCUMENT_SUBMITTED",
    );
  }

  async approve(
    tenantId: string,
    actorUserId: string,
    processId: string,
    requirementId: string,
  ) {
    await this.ensureProcess(tenantId, processId);
    const requirement = await this.findRequirement(
      tenantId,
      processId,
      requirementId,
    );
    if (requirement.status !== ProcessDocumentStatus.UNDER_REVIEW) {
      throw new ConflictException(
        "Somente documentos em análise podem ser aprovados.",
      );
    }
    return this.change(
      tenantId,
      actorUserId,
      processId,
      requirement,
      {
        status: ProcessDocumentStatus.APPROVED,
        reviewedByUserId: actorUserId,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
      "DOCUMENT_APPROVED",
    );
  }

  async reject(
    tenantId: string,
    actorUserId: string,
    processId: string,
    requirementId: string,
    input: RejectProcessDocumentDto,
  ) {
    await this.ensureProcess(tenantId, processId);
    const requirement = await this.findRequirement(
      tenantId,
      processId,
      requirementId,
    );
    if (requirement.status !== ProcessDocumentStatus.UNDER_REVIEW) {
      throw new ConflictException(
        "Somente documentos em análise podem ser rejeitados.",
      );
    }
    return this.change(
      tenantId,
      actorUserId,
      processId,
      requirement,
      {
        status: ProcessDocumentStatus.REJECTED,
        reviewedByUserId: actorUserId,
        reviewedAt: new Date(),
        rejectionReason: input.reason.trim(),
      },
      "DOCUMENT_REJECTED",
    );
  }

  async waive(
    tenantId: string,
    actorUserId: string,
    processId: string,
    requirementId: string,
    input: RejectProcessDocumentDto,
  ) {
    await this.ensureProcess(tenantId, processId);
    const requirement = await this.findRequirement(
      tenantId,
      processId,
      requirementId,
    );
    if (COMPLETED_DOCUMENT_STATUSES.includes(requirement.status)) {
      throw new ConflictException("O requisito já foi concluído.");
    }
    return this.change(
      tenantId,
      actorUserId,
      processId,
      requirement,
      {
        status: ProcessDocumentStatus.WAIVED,
        reviewedByUserId: actorUserId,
        reviewedAt: new Date(),
        rejectionReason: nullable(input.reason),
      },
      "DOCUMENT_WAIVED",
    );
  }

  private async change(
    tenantId: string,
    actorUserId: string,
    processId: string,
    before: Awaited<ReturnType<ProcessDocumentsService["findRequirement"]>>,
    data: Prisma.ProcessDocumentRequirementUncheckedUpdateInput,
    action: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.processDocumentRequirement.update({
        where: { id: before.id },
        data,
        include: { studentDocument: true },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ProcessDocumentRequirement",
        entityId: before.id,
        action,
        actorUserId,
        before,
        after: updated,
      });
      const eventType =
        action === "DOCUMENT_APPROVED"
          ? DomainEventType.DOCUMENT_APPROVED
          : action === "DOCUMENT_REJECTED"
            ? DomainEventType.DOCUMENT_REJECTED
            : null;
      if (eventType) {
        const process = await tx.studentLicenseProcess.findFirstOrThrow({
          where: { id: processId, tenantId },
          select: { studentId: true },
        });
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: eventType,
          aggregateType: "ProcessDocumentRequirement",
          aggregateId: updated.id,
          payload: {
            processId,
            documentRequirementId: updated.id,
            studentId: process.studentId,
            rejectionReason: updated.rejectionReason,
          },
          idempotencyKey: `${eventType.toLowerCase()}:${tenantId}:${updated.id}:${updated.updatedAt.toISOString()}`,
        });
      }
      await this.progression.sync(tx, tenantId, processId, actorUserId);
      return updated;
    });
  }

  private async findRequirement(
    tenantId: string,
    processId: string,
    id: string,
  ) {
    const requirement = await this.prisma.processDocumentRequirement.findFirst({
      where: { id, tenantId, processId },
    });
    if (!requirement) {
      throw new NotFoundException("Requisito documental não encontrado.");
    }
    return requirement;
  }

  private async ensureProcess(tenantId: string, id: string) {
    const process = await this.prisma.studentLicenseProcess.findFirst({
      where: { id, tenantId },
    });
    if (!process) throw new NotFoundException("Processo não encontrado.");
    if (TERMINAL_PROCESS_STATUSES.includes(process.status)) {
      throw new ConflictException(
        "O processo não permite alterações documentais.",
      );
    }
    return process;
  }

  private uploadDirectory(): string {
    return (
      process.env.UPLOAD_DIR ??
      process.env.MOBILE_UPLOAD_DIR ??
      join(process.cwd(), "var", "uploads")
    );
  }
}
