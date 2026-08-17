import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import {
  ImportConflictPolicy,
  ImportEntityType,
  ImportIssueSeverity,
  ImportJobStatus,
  Prisma,
  RegistryStatus,
} from "@prumo/database";
import { createHash } from "node:crypto";
import type { Job } from "bullmq";
import { CommunicationQueueService } from "../communication/queue.service";
import { PrismaService } from "../database/prisma.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { PlatformAuditService } from "../platform/platform-audit.service";
import {
  EXECUTABLE_IMPORT_ENTITIES,
  IMPORT_FIELDS,
  MIGRATION_ENTITY_ORDER,
  requiredImportFields,
} from "./migration-catalog";
import {
  MigrationFileParser,
  type ParsedImportRow,
} from "./migration-file.parser";
import type {
  CreateImportJobDto,
  ImportJobListQueryDto,
  RollbackImportDto,
  SaveImportMappingDto,
  UploadImportFileDto,
} from "./platform-migration.dto";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ISSUE_BATCH_SIZE = 1_000;

type AuditContext = { ipAddress?: string; userAgent?: string };
type NormalizedRecord = Record<string, string | boolean | null>;
type PersistedIssue = {
  tenantId: string;
  importJobId: string;
  importFileId?: string;
  severity: ImportIssueSeverity;
  entityType: ImportEntityType;
  rowNumber?: number;
  field?: string;
  value?: string;
  code: string;
  message: string;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function validCpf(value: string): boolean {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calculate = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculate(9) === Number(cpf[9]) && calculate(10) === Number(cpf[10]);
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizedDate(value: string): string | null {
  if (!value) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const candidate = br ? `${br[3]}-${br[2]}-${br[1]}T00:00:00.000Z` : value;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function booleanValue(value: string, fallback: boolean): boolean {
  if (!value) return fallback;
  return !["0", "false", "não", "nao", "inativo", "inactive"].includes(
    value.trim().toLowerCase(),
  );
}

function registryStatus(value: string): RegistryStatus {
  return value.trim().toUpperCase() === "INACTIVE"
    ? RegistryStatus.INACTIVE
    : RegistryStatus.ACTIVE;
}

function stableChecksum(value: NormalizedRecord): string {
  const ordered = Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, item]) =>
          key !== "legacyId" &&
          !key.startsWith("__invalid_") &&
          item !== null &&
          item !== "",
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

function safeIssueValue(value: string | undefined): string | undefined {
  return value ? value.slice(0, 500) : undefined;
}

@Injectable()
export class PlatformMigrationService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly parser: MigrationFileParser,
    private readonly audit: PlatformAuditService,
    private readonly queues: CommunicationQueueService,
  ) {}

  onModuleInit(): void {
    this.queues.register(
      "data-migrations",
      async (job: Job<Record<string, unknown>>) => {
        const importJobId =
          typeof job.data.importJobId === "string" ? job.data.importJobId : "";
        if (!importJobId) throw new Error("importJobId ausente");
        await this.runExecution(importJobId);
      },
      1,
    );
  }

  catalog() {
    return MIGRATION_ENTITY_ORDER.map((entityType) => ({
      entityType,
      executable: EXECUTABLE_IMPORT_ENTITIES.has(entityType),
      blockedReason:
        entityType === ImportEntityType.FINANCIAL
          ? "Importação financeira bloqueada até a liberação formal dos controles de concorrência."
          : EXECUTABLE_IMPORT_ENTITIES.has(entityType)
            ? null
            : "Adaptador ainda não habilitado para execução.",
      fields: IMPORT_FIELDS[entityType],
    }));
  }

  template(entityType: ImportEntityType) {
    const fields = IMPORT_FIELDS[entityType];
    const csv = [
      fields.map((field) => field.key).join(";"),
      fields.map((field) => field.example ?? "").join(";"),
    ].join("\r\n");
    return {
      fileName: `${entityType.toLowerCase()}.csv`,
      mimeType: "text/csv; charset=utf-8",
      contentBase64: Buffer.from(`\uFEFF${csv}`, "utf8").toString("base64"),
    };
  }

  list(query: ImportJobListQueryDto) {
    return this.prisma.importJob.findMany({
      where: { status: query.status, tenantId: query.tenantId },
      take: query.pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { files: true, issues: true, legacyMaps: true } },
      },
    });
  }

  async get(id: string) {
    const job = await this.prisma.importJob.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        files: { include: { mappings: true }, orderBy: { createdAt: "asc" } },
        issues: {
          orderBy: [{ severity: "desc" }, { rowNumber: "asc" }],
          take: 250,
        },
        _count: { select: { issues: true, legacyMaps: true } },
      },
    });
    if (!job) throw new NotFoundException("Migração não encontrada.");
    return job;
  }

  async create(
    input: CreateImportJobDto,
    platformUserId: string,
    context: AuditContext,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!tenant)
      throw new NotFoundException("Autoescola de destino não encontrada.");
    const job = await this.prisma.importJob.create({
      data: {
        tenantId: tenant.id,
        sourceSystem: input.sourceSystem.trim(),
        description: input.description?.trim() || null,
        migrationType: input.migrationType.trim().toUpperCase(),
        cutoverDate: new Date(input.cutoverDate),
        createdByPlatformUserId: platformUserId,
      },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
    await this.audit.record({
      platformUserId,
      tenantId: tenant.id,
      entityType: "ImportJob",
      entityId: job.id,
      action: "PLATFORM_MIGRATION_CREATED",
      reason: input.description,
      ...context,
      after: {
        sourceSystem: job.sourceSystem,
        cutoverDate: job.cutoverDate,
        migrationType: job.migrationType,
      },
    });
    return job;
  }

  async upload(
    jobId: string,
    input: UploadImportFileDto,
    platformUserId: string,
    context: AuditContext,
  ) {
    const job = await this.requireMutableJob(jobId);
    const body = Buffer.from(input.contentBase64, "base64");
    if (body.length > MAX_FILE_BYTES) {
      throw new BadRequestException("O arquivo excede o limite de 10 MB.");
    }
    const parsed = await this.parser.parse(input.fileName, body);
    const checksum = createHash("sha256").update(body).digest("hex");
    const duplicate = await this.prisma.importFile.findFirst({
      where: { importJobId: job.id, checksum, entityType: input.entityType },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictException(
        "Este arquivo já foi enviado para a migração.",
      );
    const extension = parsed.format === "CSV" ? "csv" : "xlsx";
    const storageKey = await this.storage.putMigrationFile({
      tenantId: job.tenantId,
      importJobId: job.id,
      actorUserId: platformUserId,
      fileName: input.fileName,
      contentType: input.mimeType,
      extension,
      body,
    });
    try {
      const file = await this.prisma.$transaction(async (tx) => {
        const created = await tx.importFile.create({
          data: {
            tenantId: job.tenantId,
            importJobId: job.id,
            entityType: input.entityType,
            format: parsed.format,
            fileName: input.fileName,
            mimeType: input.mimeType,
            sizeBytes: body.length,
            storageKey,
            checksum,
            headers: json(parsed.headers),
            sampleRows: json(parsed.rows.slice(0, 5)),
            rowCount: parsed.rows.length,
          },
        });
        await tx.importJob.update({
          where: { id: job.id },
          data: {
            status: ImportJobStatus.UPLOADED,
            validationSummary: Prisma.DbNull,
            preview: Prisma.DbNull,
          },
        });
        return created;
      });
      await this.audit.record({
        platformUserId,
        tenantId: job.tenantId,
        entityType: "ImportFile",
        entityId: file.id,
        action: "PLATFORM_MIGRATION_FILE_UPLOADED",
        ...context,
        after: {
          importJobId: job.id,
          entityType: file.entityType,
          fileName: file.fileName,
          checksum: file.checksum,
          rowCount: file.rowCount,
        },
      });
      return file;
    } catch (error) {
      await this.storage
        .deleteDocument(job.tenantId, storageKey)
        .catch(() => undefined);
      throw error;
    }
  }

  async saveMapping(
    jobId: string,
    fileId: string,
    input: SaveImportMappingDto,
    platformUserId: string,
    context: AuditContext,
  ) {
    const job = await this.requireMutableJob(jobId);
    const file = await this.prisma.importFile.findFirst({
      where: { id: fileId, importJobId: job.id, tenantId: job.tenantId },
    });
    if (!file)
      throw new NotFoundException("Arquivo da migração não encontrado.");
    const headers = file.headers as string[];
    const allowedTargets = new Set(
      IMPORT_FIELDS[file.entityType].map((field) => field.key),
    );
    const sourceColumns = new Set<string>();
    const targetFields = new Set<string>();
    for (const mapping of input.mappings) {
      if (!headers.includes(mapping.sourceColumn)) {
        throw new BadRequestException(
          `Coluna inexistente: ${mapping.sourceColumn}.`,
        );
      }
      if (!allowedTargets.has(mapping.targetField)) {
        throw new BadRequestException(
          `Campo de destino inválido: ${mapping.targetField}.`,
        );
      }
      if (
        sourceColumns.has(mapping.sourceColumn) ||
        targetFields.has(mapping.targetField)
      ) {
        throw new BadRequestException(
          "Cada coluna e campo de destino só pode ser mapeado uma vez.",
        );
      }
      sourceColumns.add(mapping.sourceColumn);
      targetFields.add(mapping.targetField);
    }
    const missing = requiredImportFields(file.entityType).filter(
      (field) => !targetFields.has(field),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Mapeie os campos obrigatórios: ${missing.join(", ")}.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.importMapping.deleteMany({ where: { importFileId: file.id } });
      await tx.importMapping.createMany({
        data: input.mappings.map((mapping) => ({
          tenantId: job.tenantId,
          importJobId: job.id,
          importFileId: file.id,
          entityType: file.entityType,
          sourceColumn: mapping.sourceColumn,
          targetField: mapping.targetField,
          conflictPolicy: input.conflictPolicy,
        })),
      });
      await tx.importJob.update({
        where: { id: job.id },
        data: {
          status: ImportJobStatus.MAPPING,
          validationSummary: Prisma.DbNull,
          preview: Prisma.DbNull,
        },
      });
    });
    await this.audit.record({
      platformUserId,
      tenantId: job.tenantId,
      entityType: "ImportFile",
      entityId: file.id,
      action: "PLATFORM_MIGRATION_MAPPING_SAVED",
      ...context,
      after: { conflictPolicy: input.conflictPolicy, mappings: input.mappings },
    });
    return this.get(job.id);
  }

  async validate(jobId: string, platformUserId: string, context: AuditContext) {
    const job = await this.requireMutableJob(jobId);
    const files = await this.prisma.importFile.findMany({
      where: { importJobId: job.id, tenantId: job.tenantId },
      include: { mappings: true },
      orderBy: { createdAt: "asc" },
    });
    if (!files.length)
      throw new BadRequestException(
        "Envie ao menos um arquivo antes de validar.",
      );
    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { status: ImportJobStatus.VALIDATING },
    });
    await this.prisma.importIssue.deleteMany({
      where: { importJobId: job.id },
    });

    const issues: PersistedIssue[] = [];
    const preview = {
      tenantId: job.tenantId,
      tenantName: job.tenant.name,
      newRecords: 0,
      updatedRecords: 0,
      linkedRecords: 0,
      ignoredRecords: 0,
      failedRecords: 0,
      zeroImpactOtherTenants: true,
      financialImportEnabled: false,
    };
    let totalRecords = 0;
    const warningRows = new Set<string>();

    for (const file of files) {
      totalRecords += file.rowCount;
      if (!EXECUTABLE_IMPORT_ENTITIES.has(file.entityType)) {
        issues.push({
          tenantId: job.tenantId,
          importJobId: job.id,
          importFileId: file.id,
          severity: ImportIssueSeverity.ERROR,
          entityType: file.entityType,
          code:
            file.entityType === ImportEntityType.FINANCIAL
              ? "FINANCIAL_IMPORT_BLOCKED"
              : "ADAPTER_NOT_AVAILABLE",
          message:
            file.entityType === ImportEntityType.FINANCIAL
              ? "O financeiro legado permanece bloqueado até a liberação formal dos controles de concorrência."
              : `O adaptador de ${file.entityType} ainda não está habilitado.`,
        });
        preview.failedRecords += file.rowCount;
        continue;
      }
      if (!file.mappings.length) {
        issues.push({
          tenantId: job.tenantId,
          importJobId: job.id,
          importFileId: file.id,
          severity: ImportIssueSeverity.ERROR,
          entityType: file.entityType,
          code: "MAPPING_REQUIRED",
          message: "Configure o mapeamento de colunas antes do dry-run.",
        });
        preview.failedRecords += file.rowCount;
        continue;
      }
      const body = await this.storage.getPrivateObject(
        job.tenantId,
        file.storageKey,
      );
      const parsed = await this.parser.parse(file.fileName, body);
      const legacyIds = new Set<string>();
      for (let index = 0; index < parsed.rows.length; index += 1) {
        const rowNumber = index + 2;
        const rowKey = `${file.id}:${rowNumber}`;
        const normalized = this.normalizeRecord(
          file.entityType,
          parsed.rows[index],
          file.mappings,
        );
        const rowIssues = this.validateRecord(
          job.id,
          job.tenantId,
          file.id,
          file.entityType,
          rowNumber,
          normalized,
        );
        const legacyId = String(normalized.legacyId ?? "");
        if (legacyId && legacyIds.has(legacyId)) {
          rowIssues.push(
            this.issue(
              job.id,
              job.tenantId,
              file.id,
              file.entityType,
              rowNumber,
              "legacyId",
              legacyId,
              "DUPLICATE_LEGACY_ID",
              "legacyId duplicado no arquivo.",
            ),
          );
        }
        legacyIds.add(legacyId);
        if (
          rowIssues.some(
            (issue) => issue.severity === ImportIssueSeverity.ERROR,
          )
        ) {
          issues.push(...rowIssues);
          preview.failedRecords += 1;
          continue;
        }
        issues.push(...rowIssues);
        const policy =
          file.mappings[0]?.conflictPolicy ?? ImportConflictPolicy.ERROR;
        const conflict = await this.findConflict(
          job.tenantId,
          job.sourceSystem,
          file.entityType,
          normalized,
        );
        if (!conflict) {
          preview.newRecords += 1;
          continue;
        }
        if (policy === ImportConflictPolicy.ERROR) {
          issues.push(
            this.issue(
              job.id,
              job.tenantId,
              file.id,
              file.entityType,
              rowNumber,
              "legacyId",
              legacyId,
              "EXPLICIT_CONFLICT_POLICY_REQUIRED",
              `${conflict.reason} Escolha ignorar, atualizar ou associar.`,
            ),
          );
          preview.failedRecords += 1;
        } else {
          issues.push({
            ...this.issue(
              job.id,
              job.tenantId,
              file.id,
              file.entityType,
              rowNumber,
              "legacyId",
              legacyId,
              "CONFLICT_RESOLVED",
              `${conflict.reason} Política: ${policy}.`,
            ),
            severity: ImportIssueSeverity.WARNING,
          });
          warningRows.add(rowKey);
          if (policy === ImportConflictPolicy.UPDATE)
            preview.updatedRecords += 1;
          if (policy === ImportConflictPolicy.LINK) preview.linkedRecords += 1;
          if (policy === ImportConflictPolicy.SKIP) preview.ignoredRecords += 1;
        }
      }
    }
    await this.persistIssues(issues);
    const errorCount = issues.filter(
      (issue) => issue.severity === ImportIssueSeverity.ERROR,
    ).length;
    const warningCount = issues.filter(
      (issue) => issue.severity === ImportIssueSeverity.WARNING,
    ).length;
    const status =
      errorCount === 0 ? ImportJobStatus.READY : ImportJobStatus.MAPPING;
    const validationSummary = {
      readyRecords: totalRecords - preview.failedRecords,
      warningRecords: warningRows.size,
      failedRecords: preview.failedRecords,
      errors: errorCount,
      warnings: warningCount,
      validatedAt: new Date().toISOString(),
    };
    await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        totalRecords,
        warningRecords: warningRows.size,
        failedRecords: preview.failedRecords,
        validationSummary: json(validationSummary),
        preview: json(preview),
      },
    });
    await this.audit.record({
      platformUserId,
      tenantId: job.tenantId,
      entityType: "ImportJob",
      entityId: job.id,
      action: "PLATFORM_MIGRATION_VALIDATED",
      ...context,
      after: { status, validationSummary, preview },
    });
    return this.get(job.id);
  }

  async execute(jobId: string, platformUserId: string, context: AuditContext) {
    const updated = await this.prisma.importJob.updateMany({
      where: { id: jobId, status: ImportJobStatus.READY },
      data: {
        status: ImportJobStatus.IMPORTING,
        startedAt: new Date(),
        progress: json({ phase: "PREPARING", processed: 0 }),
        errorMessage: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        "A migração precisa estar validada e pronta para execução.",
      );
    }
    const job = await this.prisma.importJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    await this.audit.record({
      platformUserId,
      tenantId: job.tenantId,
      entityType: "ImportJob",
      entityId: job.id,
      action: "PLATFORM_MIGRATION_EXECUTION_STARTED",
      ...context,
      after: { preview: job.preview },
    });
    if (this.queues.enabled) {
      try {
        await this.queues.add(
          "data-migrations",
          "execute",
          { importJobId: job.id },
          { idempotencyKey: job.id },
        );
      } catch (error) {
        await this.prisma.importJob.update({
          where: { id: job.id },
          data: {
            status: ImportJobStatus.FAILED,
            errorMessage: "Não foi possível enfileirar a migração.",
            completedAt: new Date(),
          },
        });
        throw error;
      }
      return this.get(job.id);
    }
    await this.runExecution(job.id);
    return this.get(job.id);
  }

  async rollback(
    jobId: string,
    input: RollbackImportDto,
    platformUserId: string,
    context: AuditContext,
  ) {
    if (input.confirmation !== "ROLLBACK") {
      throw new BadRequestException('Digite "ROLLBACK" para confirmar.');
    }
    const job = await this.prisma.importJob.findUnique({
      where: { id: jobId },
      include: { legacyMaps: { where: { createdByImport: true } } },
    });
    if (!job) throw new NotFoundException("Migração não encontrada.");
    const rollbackStatuses: ImportJobStatus[] = [
      ImportJobStatus.COMPLETED,
      ImportJobStatus.COMPLETED_WITH_ERRORS,
    ];
    if (!rollbackStatuses.includes(job.status)) {
      throw new ConflictException(
        "Somente migrações concluídas podem sofrer rollback.",
      );
    }
    const blockers: string[] = [];
    for (const map of job.legacyMaps) {
      const state = await this.rollbackState(
        map.entityType,
        job.tenantId,
        map.entityId,
      );
      if (!state) continue;
      if (state.dependencies > 0)
        blockers.push(
          `${map.entityType}/${map.legacyId}: possui operações posteriores`,
        );
      else if (stableChecksum(state.record) !== map.checksum)
        blockers.push(
          `${map.entityType}/${map.legacyId}: registro foi alterado`,
        );
    }
    if (blockers.length) {
      throw new ConflictException({
        message:
          "Rollback destrutivo bloqueado. Use uma operação administrativa controlada.",
        blockers: blockers.slice(0, 100),
      });
    }
    await this.prisma.$transaction(async (tx) => {
      for (const entityType of [...MIGRATION_ENTITY_ORDER].reverse()) {
        const ids = job.legacyMaps
          .filter((map) => map.entityType === entityType)
          .map((map) => map.entityId);
        if (!ids.length) continue;
        if (entityType === ImportEntityType.STUDENTS)
          await tx.student.deleteMany({
            where: { tenantId: job.tenantId, id: { in: ids } },
          });
        if (entityType === ImportEntityType.INSTRUCTORS)
          await tx.instructor.deleteMany({
            where: { tenantId: job.tenantId, id: { in: ids } },
          });
        if (entityType === ImportEntityType.UNITS)
          await tx.schoolUnit.deleteMany({
            where: { tenantId: job.tenantId, id: { in: ids } },
          });
      }
      await tx.legacyImportMap.deleteMany({ where: { importJobId: job.id } });
      await tx.importJob.update({
        where: { id: job.id },
        data: { status: ImportJobStatus.ROLLED_BACK, rolledBackAt: new Date() },
      });
    });
    await this.audit.record({
      platformUserId,
      tenantId: job.tenantId,
      entityType: "ImportJob",
      entityId: job.id,
      action: "PLATFORM_MIGRATION_ROLLED_BACK",
      reason: input.reason,
      ...context,
      before: { status: job.status, importedRecords: job.legacyMaps.length },
      after: { status: ImportJobStatus.ROLLED_BACK },
    });
    return this.get(job.id);
  }

  async errorReport(jobId: string): Promise<string> {
    const job = await this.prisma.importJob.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) throw new NotFoundException("Migração não encontrada.");
    const issues = await this.prisma.importIssue.findMany({
      where: { importJobId: job.id },
      include: { importFile: { select: { fileName: true } } },
      orderBy: [{ importFileId: "asc" }, { rowNumber: "asc" }],
    });
    const escape = (value: unknown) => {
      let text =
        value === null || value === undefined
          ? ""
          : typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
            ? `${value}`
            : JSON.stringify(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    return [
      [
        "severidade",
        "arquivo",
        "entidade",
        "linha",
        "campo",
        "valor",
        "codigo",
        "mensagem",
      ]
        .map(escape)
        .join(";"),
      ...issues.map((issue) =>
        [
          issue.severity,
          issue.importFile?.fileName,
          issue.entityType,
          issue.rowNumber,
          issue.field,
          issue.value,
          issue.code,
          issue.message,
        ]
          .map(escape)
          .join(";"),
      ),
    ].join("\r\n");
  }

  private async requireMutableJob(id: string) {
    const job = await this.prisma.importJob.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!job) throw new NotFoundException("Migração não encontrada.");
    const immutableStatuses: ImportJobStatus[] = [
      ImportJobStatus.IMPORTING,
      ImportJobStatus.COMPLETED,
      ImportJobStatus.COMPLETED_WITH_ERRORS,
      ImportJobStatus.ROLLED_BACK,
    ];
    if (immutableStatuses.includes(job.status)) {
      throw new ConflictException("Esta migração não aceita mais alterações.");
    }
    return job;
  }

  private normalizeRecord(
    entityType: ImportEntityType,
    row: ParsedImportRow,
    mappings: Array<{ sourceColumn: string; targetField: string }>,
  ): NormalizedRecord {
    const result: NormalizedRecord = {};
    for (const mapping of mappings)
      result[mapping.targetField] = row[mapping.sourceColumn]?.trim() ?? "";
    result.legacyId = String(result.legacyId ?? "").trim();
    if ("cpf" in result) result.cpf = digits(String(result.cpf));
    if ("email" in result)
      result.email = String(result.email).trim().toLowerCase();
    if (entityType === ImportEntityType.UNITS) {
      result.openingTime = String(result.openingTime || "08:00");
      result.closingTime = String(result.closingTime || "18:00");
      result.active = booleanValue(String(result.active ?? ""), true);
    }
    if (entityType === ImportEntityType.INSTRUCTORS) {
      const rawDate = String(result.licenseExpiresAt ?? "");
      result.licenseExpiresAt = normalizedDate(rawDate);
      if (rawDate && !result.licenseExpiresAt)
        result.__invalid_licenseExpiresAt = rawDate;
      result.status = registryStatus(String(result.status ?? ""));
    }
    if (entityType === ImportEntityType.STUDENTS) {
      const rawDate = String(result.birthDate ?? "");
      result.birthDate = normalizedDate(rawDate);
      if (rawDate && !result.birthDate) result.__invalid_birthDate = rawDate;
      result.status = registryStatus(String(result.status ?? ""));
    }
    return result;
  }

  private validateRecord(
    jobId: string,
    tenantId: string,
    fileId: string,
    entityType: ImportEntityType,
    rowNumber: number,
    record: NormalizedRecord,
  ): PersistedIssue[] {
    const issues: PersistedIssue[] = [];
    for (const field of requiredImportFields(entityType)) {
      if (
        record[field] === "" ||
        record[field] === null ||
        record[field] === undefined
      ) {
        issues.push(
          this.issue(
            jobId,
            tenantId,
            fileId,
            entityType,
            rowNumber,
            field,
            undefined,
            "REQUIRED_FIELD",
            "Campo obrigatório não informado.",
          ),
        );
      }
    }
    const cpf = typeof record.cpf === "string" ? record.cpf : "";
    if (cpf && !validCpf(cpf))
      issues.push(
        this.issue(
          jobId,
          tenantId,
          fileId,
          entityType,
          rowNumber,
          "cpf",
          cpf,
          "INVALID_CPF",
          "CPF inválido.",
        ),
      );
    const email = typeof record.email === "string" ? record.email : "";
    if (email && !validEmail(email))
      issues.push(
        this.issue(
          jobId,
          tenantId,
          fileId,
          entityType,
          rowNumber,
          "email",
          email,
          "INVALID_EMAIL",
          "E-mail inválido.",
        ),
      );
    for (const field of ["birthDate", "licenseExpiresAt"]) {
      const invalid = record[`__invalid_${field}`];
      if (typeof invalid === "string") {
        issues.push(
          this.issue(
            jobId,
            tenantId,
            fileId,
            entityType,
            rowNumber,
            field,
            invalid,
            "INVALID_DATE",
            "Data inválida.",
          ),
        );
      }
    }
    return issues;
  }

  private issue(
    importJobId: string,
    tenantId: string,
    importFileId: string,
    entityType: ImportEntityType,
    rowNumber: number,
    field: string,
    value: string | undefined,
    code: string,
    message: string,
  ): PersistedIssue {
    return {
      tenantId,
      importJobId,
      importFileId,
      severity: ImportIssueSeverity.ERROR,
      entityType,
      rowNumber,
      field,
      value: safeIssueValue(value),
      code,
      message,
    };
  }

  private async findConflict(
    tenantId: string,
    sourceSystem: string,
    entityType: ImportEntityType,
    record: NormalizedRecord,
  ): Promise<{ entityId: string; reason: string } | null> {
    const legacyId = String(record.legacyId ?? "");
    const mapped = await this.prisma.legacyImportMap.findUnique({
      where: {
        tenantId_sourceSystem_entityType_legacyId: {
          tenantId,
          sourceSystem,
          entityType,
          legacyId,
        },
      },
      select: { entityId: true },
    });
    if (mapped)
      return {
        entityId: mapped.entityId,
        reason: `legacyId ${legacyId} já foi importado.`,
      };
    if (entityType === ImportEntityType.STUDENTS) {
      const existing = await this.prisma.student.findUnique({
        where: { tenantId_cpf: { tenantId, cpf: String(record.cpf) } },
        select: { id: true },
      });
      return existing
        ? {
            entityId: existing.id,
            reason: `CPF ${record.cpf} já existe nesta autoescola.`,
          }
        : null;
    }
    if (entityType === ImportEntityType.INSTRUCTORS) {
      const existing = await this.prisma.instructor.findUnique({
        where: { tenantId_cpf: { tenantId, cpf: String(record.cpf) } },
        select: { id: true },
      });
      return existing
        ? {
            entityId: existing.id,
            reason: `CPF ${record.cpf} já existe nesta autoescola.`,
          }
        : null;
    }
    if (entityType === ImportEntityType.UNITS) {
      const existing = await this.prisma.schoolUnit.findUnique({
        where: { tenantId_name: { tenantId, name: String(record.name) } },
        select: { id: true },
      });
      return existing
        ? {
            entityId: existing.id,
            reason: `A unidade ${record.name} já existe nesta autoescola.`,
          }
        : null;
    }
    return null;
  }

  private async persistIssues(issues: PersistedIssue[]): Promise<void> {
    for (let index = 0; index < issues.length; index += ISSUE_BATCH_SIZE) {
      await this.prisma.importIssue.createMany({
        data: issues.slice(index, index + ISSUE_BATCH_SIZE),
      });
    }
  }

  private async runExecution(importJobId: string): Promise<void> {
    const job = await this.prisma.importJob.findUnique({
      where: { id: importJobId },
      include: { files: { include: { mappings: true } } },
    });
    if (!job) throw new Error("Migração não encontrada");
    let successful = 0;
    let failed = 0;
    try {
      for (const entityType of MIGRATION_ENTITY_ORDER) {
        const files = job.files.filter(
          (file) => file.entityType === entityType,
        );
        for (const file of files) {
          const body = await this.storage.getPrivateObject(
            job.tenantId,
            file.storageKey,
          );
          const parsed = await this.parser.parse(file.fileName, body);
          const policy =
            file.mappings[0]?.conflictPolicy ?? ImportConflictPolicy.ERROR;
          for (let index = 0; index < parsed.rows.length; index += 1) {
            const record = this.normalizeRecord(
              entityType,
              parsed.rows[index],
              file.mappings,
            );
            try {
              await this.executeRecord(job, entityType, record, policy);
              successful += 1;
            } catch (error) {
              failed += 1;
              await this.prisma.importIssue.create({
                data: {
                  tenantId: job.tenantId,
                  importJobId: job.id,
                  importFileId: file.id,
                  severity: ImportIssueSeverity.ERROR,
                  entityType,
                  rowNumber: index + 2,
                  code: "IMPORT_RUNTIME_ERROR",
                  message:
                    error instanceof Error
                      ? error.message.slice(0, 1000)
                      : "Falha inesperada ao importar registro.",
                },
              });
            }
            const processed = successful + failed;
            if (processed % 100 === 0 || index === parsed.rows.length - 1) {
              await this.prisma.importJob.update({
                where: { id: job.id },
                data: {
                  successfulRecords: successful,
                  failedRecords: failed,
                  progress: json({
                    phase: `IMPORTING_${entityType}`,
                    processed,
                    total: job.totalRecords,
                  }),
                },
              });
            }
          }
        }
      }
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: failed
            ? ImportJobStatus.COMPLETED_WITH_ERRORS
            : ImportJobStatus.COMPLETED,
          successfulRecords: successful,
          failedRecords: failed,
          completedAt: new Date(),
          progress: json({
            phase: "COMPLETED",
            processed: successful + failed,
            total: job.totalRecords,
          }),
        },
      });
    } catch (error) {
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: ImportJobStatus.FAILED,
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 1500)
              : "Falha inesperada.",
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async executeRecord(
    job: { id: string; tenantId: string; sourceSystem: string },
    entityType: ImportEntityType,
    record: NormalizedRecord,
    policy: ImportConflictPolicy,
  ): Promise<"CREATED" | "UPDATED" | "LINKED" | "SKIPPED"> {
    const legacyId = String(record.legacyId);
    const checksum = stableChecksum(record);
    return this.prisma.serializableTransaction(async (tx) => {
      const mapped = await tx.legacyImportMap.findUnique({
        where: {
          tenantId_sourceSystem_entityType_legacyId: {
            tenantId: job.tenantId,
            sourceSystem: job.sourceSystem,
            entityType,
            legacyId,
          },
        },
      });
      if (mapped) {
        if (policy !== ImportConflictPolicy.UPDATE) return "SKIPPED";
        await this.updateEntity(
          tx,
          entityType,
          job.tenantId,
          mapped.entityId,
          record,
        );
        await tx.legacyImportMap.update({
          where: { id: mapped.id },
          data: { checksum },
        });
        return "UPDATED";
      }
      const conflict = await this.findConflictWith(
        tx,
        job.tenantId,
        entityType,
        record,
      );
      if (conflict) {
        if (policy === ImportConflictPolicy.ERROR)
          throw new ConflictException(
            "Conflito não resolvido durante a execução.",
          );
        if (policy === ImportConflictPolicy.SKIP) return "SKIPPED";
        if (policy === ImportConflictPolicy.UPDATE)
          await this.updateEntity(
            tx,
            entityType,
            job.tenantId,
            conflict,
            record,
          );
        await tx.legacyImportMap.create({
          data: {
            tenantId: job.tenantId,
            importJobId: job.id,
            sourceSystem: job.sourceSystem,
            entityType,
            legacyId,
            entityId: conflict,
            checksum,
            createdByImport: false,
          },
        });
        return policy === ImportConflictPolicy.UPDATE ? "UPDATED" : "LINKED";
      }
      const entityId = await this.createEntity(
        tx,
        entityType,
        job.tenantId,
        record,
      );
      await tx.legacyImportMap.create({
        data: {
          tenantId: job.tenantId,
          importJobId: job.id,
          sourceSystem: job.sourceSystem,
          entityType,
          legacyId,
          entityId,
          checksum,
          createdByImport: true,
        },
      });
      return "CREATED";
    });
  }

  private async findConflictWith(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entityType: ImportEntityType,
    record: NormalizedRecord,
  ): Promise<string | null> {
    if (entityType === ImportEntityType.STUDENTS)
      return (
        (
          await tx.student.findUnique({
            where: { tenantId_cpf: { tenantId, cpf: String(record.cpf) } },
            select: { id: true },
          })
        )?.id ?? null
      );
    if (entityType === ImportEntityType.INSTRUCTORS)
      return (
        (
          await tx.instructor.findUnique({
            where: { tenantId_cpf: { tenantId, cpf: String(record.cpf) } },
            select: { id: true },
          })
        )?.id ?? null
      );
    if (entityType === ImportEntityType.UNITS)
      return (
        (
          await tx.schoolUnit.findUnique({
            where: { tenantId_name: { tenantId, name: String(record.name) } },
            select: { id: true },
          })
        )?.id ?? null
      );
    return null;
  }

  private async createEntity(
    tx: Prisma.TransactionClient,
    entityType: ImportEntityType,
    tenantId: string,
    record: NormalizedRecord,
  ): Promise<string> {
    if (entityType === ImportEntityType.STUDENTS)
      return (
        await tx.student.create({
          data: { tenantId, ...this.studentData(record) },
          select: { id: true },
        })
      ).id;
    if (entityType === ImportEntityType.INSTRUCTORS)
      return (
        await tx.instructor.create({
          data: { tenantId, ...this.instructorData(record) },
          select: { id: true },
        })
      ).id;
    if (entityType === ImportEntityType.UNITS)
      return (
        await tx.schoolUnit.create({
          data: { tenantId, ...this.unitData(record) },
          select: { id: true },
        })
      ).id;
    throw new Error(`Adaptador ${entityType} indisponível.`);
  }

  private async updateEntity(
    tx: Prisma.TransactionClient,
    entityType: ImportEntityType,
    tenantId: string,
    entityId: string,
    record: NormalizedRecord,
  ): Promise<void> {
    if (entityType === ImportEntityType.STUDENTS)
      await tx.student.update({
        where: { id_tenantId: { id: entityId, tenantId } },
        data: this.studentData(record),
      });
    else if (entityType === ImportEntityType.INSTRUCTORS)
      await tx.instructor.update({
        where: { id_tenantId: { id: entityId, tenantId } },
        data: this.instructorData(record),
      });
    else if (entityType === ImportEntityType.UNITS)
      await tx.schoolUnit.update({
        where: { id_tenantId: { id: entityId, tenantId } },
        data: this.unitData(record),
      });
    else throw new Error(`Adaptador ${entityType} indisponível.`);
  }

  private studentData(record: NormalizedRecord) {
    return {
      name: String(record.name),
      socialName: record.socialName ? String(record.socialName) : null,
      cpf: String(record.cpf),
      birthDate: record.birthDate ? new Date(String(record.birthDate)) : null,
      email: record.email ? String(record.email) : null,
      phone: record.phone ? String(record.phone) : null,
      secondaryPhone: record.secondaryPhone
        ? String(record.secondaryPhone)
        : null,
      status: record.status as RegistryStatus,
    };
  }

  private instructorData(record: NormalizedRecord) {
    return {
      name: String(record.name),
      cpf: String(record.cpf),
      email: record.email ? String(record.email) : null,
      phone: record.phone ? String(record.phone) : null,
      license: record.license ? String(record.license) : null,
      licenseCategory: record.licenseCategory
        ? String(record.licenseCategory)
        : null,
      licenseExpiresAt: record.licenseExpiresAt
        ? new Date(String(record.licenseExpiresAt))
        : null,
      status: record.status as RegistryStatus,
    };
  }

  private unitData(record: NormalizedRecord) {
    return {
      name: String(record.name),
      document: record.document ? digits(String(record.document)) : null,
      phone: String(record.phone),
      email: String(record.email).toLowerCase(),
      address: String(record.address),
      openingTime: String(record.openingTime),
      closingTime: String(record.closingTime),
      active: Boolean(record.active),
    };
  }

  private async rollbackState(
    entityType: ImportEntityType,
    tenantId: string,
    entityId: string,
  ): Promise<{ record: NormalizedRecord; dependencies: number } | null> {
    if (entityType === ImportEntityType.STUDENTS) {
      const item = await this.prisma.student.findFirst({
        where: { id: entityId, tenantId },
        include: {
          address: { select: { id: true } },
          _count: {
            select: {
              documents: true,
              notes: true,
              processes: true,
              licenseProcesses: true,
              exams: true,
              lessons: true,
              theoreticalClasses: true,
              contracts: true,
              receivables: true,
              payments: true,
              lessonChangeRequests: true,
              lessonEvaluations: true,
              documentUploadSessions: true,
              campaignRecipients: true,
            },
          },
        },
      });
      if (!item) return null;
      const { _count, address, ...record } = item;
      return {
        record: this.recordFromStudent(record),
        dependencies: Object.values(_count).reduce(
          (sum, count) => sum + count,
          address ? 1 : 0,
        ),
      };
    }
    if (entityType === ImportEntityType.INSTRUCTORS) {
      const item = await this.prisma.instructor.findFirst({
        where: { id: entityId, tenantId },
        include: {
          _count: {
            select: {
              lessons: true,
              availabilities: true,
              scheduleBlocks: true,
              theoreticalClasses: true,
              lessonEvaluations: true,
              vehicleOccurrences: true,
              campaignRecipients: true,
            },
          },
        },
      });
      if (!item) return null;
      const { _count, ...record } = item;
      return {
        record: this.recordFromInstructor(record),
        dependencies: Object.values(_count).reduce(
          (sum, count) => sum + count,
          0,
        ),
      };
    }
    if (entityType === ImportEntityType.UNITS) {
      const item = await this.prisma.schoolUnit.findFirst({
        where: { id: entityId, tenantId },
        include: {
          _count: {
            select: {
              classrooms: true,
              scheduleBlocks: true,
              lessons: true,
              theoreticalClasses: true,
              licenseProcesses: true,
              exams: true,
              contracts: true,
              cashRegisters: true,
              expenses: true,
            },
          },
        },
      });
      if (!item) return null;
      const { _count, ...record } = item;
      return {
        record: this.recordFromUnit(record),
        dependencies: Object.values(_count).reduce(
          (sum, count) => sum + count,
          0,
        ),
      };
    }
    return null;
  }

  private recordFromStudent(record: {
    name: string;
    socialName: string | null;
    cpf: string;
    birthDate: Date | null;
    email: string | null;
    phone: string | null;
    secondaryPhone: string | null;
    status: RegistryStatus;
  }): NormalizedRecord {
    return {
      name: record.name,
      socialName: record.socialName,
      cpf: record.cpf,
      birthDate: record.birthDate?.toISOString() ?? null,
      email: record.email,
      phone: record.phone,
      secondaryPhone: record.secondaryPhone,
      status: record.status,
    };
  }

  private recordFromInstructor(record: {
    name: string;
    cpf: string;
    email: string | null;
    phone: string | null;
    license: string | null;
    licenseCategory: string | null;
    licenseExpiresAt: Date | null;
    status: RegistryStatus;
  }): NormalizedRecord {
    return {
      name: record.name,
      cpf: record.cpf,
      email: record.email,
      phone: record.phone,
      license: record.license,
      licenseCategory: record.licenseCategory,
      licenseExpiresAt: record.licenseExpiresAt?.toISOString() ?? null,
      status: record.status,
    };
  }

  private recordFromUnit(record: {
    name: string;
    document: string | null;
    phone: string;
    email: string;
    address: string;
    openingTime: string;
    closingTime: string;
    active: boolean;
  }): NormalizedRecord {
    return {
      name: record.name,
      document: record.document,
      phone: record.phone,
      email: record.email,
      address: record.address,
      openingTime: record.openingTime,
      closingTime: record.closingTime,
      active: record.active,
    };
  }
}
