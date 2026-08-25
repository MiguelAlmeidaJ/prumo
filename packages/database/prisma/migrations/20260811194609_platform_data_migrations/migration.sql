-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('CREATED', 'UPLOADED', 'MAPPING', 'VALIDATING', 'READY', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ImportFileFormat" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ImportEntityType" AS ENUM ('UNITS', 'INSTRUCTORS', 'STUDENTS', 'ENROLLMENTS', 'FINANCIAL', 'LESSONS', 'EXAMS', 'DOCUMENTS');

-- CreateEnum
CREATE TYPE "ImportIssueSeverity" AS ENUM ('WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ImportConflictPolicy" AS ENUM ('ERROR', 'SKIP', 'UPDATE', 'LINK');

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "description" TEXT,
    "migrationType" TEXT NOT NULL,
    "cutoverDate" TIMESTAMP(3) NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'CREATED',
    "conflictPolicies" JSONB,
    "validationSummary" JSONB,
    "preview" JSONB,
    "progress" JSONB,
    "errorMessage" TEXT,
    "createdByPlatformUserId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "successfulRecords" INTEGER NOT NULL DEFAULT 0,
    "warningRecords" INTEGER NOT NULL DEFAULT 0,
    "failedRecords" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "entityType" "ImportEntityType" NOT NULL,
    "format" "ImportFileFormat" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "sampleRows" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMapping" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "importFileId" UUID NOT NULL,
    "entityType" "ImportEntityType" NOT NULL,
    "sourceColumn" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "conflictPolicy" "ImportConflictPolicy" NOT NULL DEFAULT 'ERROR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyImportMap" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "entityType" "ImportEntityType" NOT NULL,
    "legacyId" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdByImport" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyImportMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "importFileId" UUID,
    "severity" "ImportIssueSeverity" NOT NULL,
    "entityType" "ImportEntityType" NOT NULL,
    "rowNumber" INTEGER,
    "field" TEXT,
    "value" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_tenantId_createdAt_idx" ON "ImportJob"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_createdByPlatformUserId_createdAt_idx" ON "ImportJob"("createdByPlatformUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_storageKey_key" ON "ImportFile"("storageKey");

-- CreateIndex
CREATE INDEX "ImportFile_tenantId_importJobId_entityType_idx" ON "ImportFile"("tenantId", "importJobId", "entityType");

-- CreateIndex
CREATE INDEX "ImportFile_importJobId_createdAt_idx" ON "ImportFile"("importJobId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportMapping_tenantId_importJobId_entityType_idx" ON "ImportMapping"("tenantId", "importJobId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMapping_importFileId_sourceColumn_key" ON "ImportMapping"("importFileId", "sourceColumn");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMapping_importFileId_targetField_key" ON "ImportMapping"("importFileId", "targetField");

-- CreateIndex
CREATE INDEX "LegacyImportMap_tenantId_importJobId_entityType_idx" ON "LegacyImportMap"("tenantId", "importJobId", "entityType");

-- CreateIndex
CREATE INDEX "LegacyImportMap_tenantId_entityType_entityId_idx" ON "LegacyImportMap"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyImportMap_tenantId_sourceSystem_entityType_legacyId_key" ON "LegacyImportMap"("tenantId", "sourceSystem", "entityType", "legacyId");

-- CreateIndex
CREATE INDEX "ImportIssue_tenantId_importJobId_severity_idx" ON "ImportIssue"("tenantId", "importJobId", "severity");

-- CreateIndex
CREATE INDEX "ImportIssue_importFileId_rowNumber_idx" ON "ImportIssue"("importFileId", "rowNumber");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdByPlatformUserId_fkey" FOREIGN KEY ("createdByPlatformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMapping" ADD CONSTRAINT "ImportMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMapping" ADD CONSTRAINT "ImportMapping_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMapping" ADD CONSTRAINT "ImportMapping_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyImportMap" ADD CONSTRAINT "LegacyImportMap_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyImportMap" ADD CONSTRAINT "LegacyImportMap_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "ImportFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
