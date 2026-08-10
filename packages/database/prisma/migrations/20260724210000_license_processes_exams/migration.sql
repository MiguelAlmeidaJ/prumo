-- CreateEnum
CREATE TYPE "LicenseProcessType" AS ENUM ('FIRST_LICENSE', 'CATEGORY_ADDITION', 'CATEGORY_CHANGE', 'RENEWAL', 'REHABILITATION', 'REFRESHER');

-- CreateEnum
CREATE TYPE "LicenseProcessStatus" AS ENUM ('DRAFT', 'PENDING_DOCUMENTS', 'IN_PROGRESS', 'SUSPENDED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProcessStageType" AS ENUM ('REGISTRATION', 'DOCUMENT_REVIEW', 'MEDICAL_EXAM', 'PSYCHOLOGICAL_EXAM', 'THEORETICAL_COURSE', 'THEORETICAL_EXAM', 'PRACTICAL_CLASSES', 'PRACTICAL_EXAM', 'LICENSE_ISSUANCE');

-- CreateEnum
CREATE TYPE "ProcessStageStatus" AS ENUM ('PENDING', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcessDocumentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'WAIVED');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('MEDICAL', 'PSYCHOLOGICAL', 'THEORETICAL', 'PRACTICAL');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "ExamResult" AS ENUM ('PENDING', 'APPROVED', 'FAILED', 'ABSENT', 'INCONCLUSIVE');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "processId" UUID;

-- AlterTable
ALTER TABLE "TheoreticalClassStudent" ADD COLUMN     "processId" UUID;

-- CreateTable
CREATE TABLE "LicenseCategory" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentLicenseProcess" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "processType" "LicenseProcessType" NOT NULL,
    "status" "LicenseProcessStatus" NOT NULL DEFAULT 'DRAFT',
    "protocolNumber" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentLicenseProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProcessCategory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "processId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentProcessCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStage" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "processId" UUID NOT NULL,
    "type" "ProcessStageType" NOT NULL,
    "status" "ProcessStageStatus" NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStageDependency" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "dependsOnStageId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessStageDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessDocumentRequirement" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "processId" UUID NOT NULL,
    "documentType" "StudentDocumentType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "ProcessDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "studentDocumentId" UUID,
    "expiresAt" TIMESTAMP(3),
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "studentId" UUID,

    CONSTRAINT "ProcessDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "processId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "type" "ExamType" NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "result" "ExamResult" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "externalProtocol" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "score" DECIMAL(6,2),
    "notes" TEXT,
    "cancellationReason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "completedAt" TIMESTAMP(3),
    "rescheduledFromId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LicenseCategory_code_key" ON "LicenseCategory"("code");

-- CreateIndex
CREATE INDEX "StudentLicenseProcess_tenantId_studentId_status_idx" ON "StudentLicenseProcess"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "StudentLicenseProcess_tenantId_unitId_status_idx" ON "StudentLicenseProcess"("tenantId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudentLicenseProcess_id_tenantId_key" ON "StudentLicenseProcess"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentLicenseProcess_tenantId_protocolNumber_key" ON "StudentLicenseProcess"("tenantId", "protocolNumber");

-- CreateIndex
CREATE INDEX "StudentProcessCategory_categoryId_idx" ON "StudentProcessCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProcessCategory_tenantId_processId_categoryId_key" ON "StudentProcessCategory"("tenantId", "processId", "categoryId");

-- CreateIndex
CREATE INDEX "ProcessStage_tenantId_processId_order_idx" ON "ProcessStage"("tenantId", "processId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessStage_id_tenantId_key" ON "ProcessStage"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessStage_tenantId_processId_type_key" ON "ProcessStage"("tenantId", "processId", "type");

-- CreateIndex
CREATE INDEX "ProcessStageDependency_tenantId_dependsOnStageId_idx" ON "ProcessStageDependency"("tenantId", "dependsOnStageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessStageDependency_tenantId_stageId_dependsOnStageId_key" ON "ProcessStageDependency"("tenantId", "stageId", "dependsOnStageId");

-- CreateIndex
CREATE INDEX "ProcessDocumentRequirement_tenantId_processId_status_idx" ON "ProcessDocumentRequirement"("tenantId", "processId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessDocumentRequirement_tenantId_processId_documentType_key" ON "ProcessDocumentRequirement"("tenantId", "processId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessDocumentRequirement_id_tenantId_key" ON "ProcessDocumentRequirement"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_rescheduledFromId_key" ON "Exam"("rescheduledFromId");

-- CreateIndex
CREATE INDEX "Exam_tenantId_studentId_scheduledAt_idx" ON "Exam"("tenantId", "studentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Exam_tenantId_processId_type_status_idx" ON "Exam"("tenantId", "processId", "type", "status");

-- CreateIndex
CREATE INDEX "Exam_tenantId_unitId_scheduledAt_idx" ON "Exam"("tenantId", "unitId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_id_tenantId_key" ON "Exam"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_tenantId_processId_type_attemptNumber_key" ON "Exam"("tenantId", "processId", "type", "attemptNumber");

-- CreateIndex
CREATE INDEX "Lesson_tenantId_processId_startsAt_idx" ON "Lesson"("tenantId", "processId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentDocument_id_tenantId_key" ON "StudentDocument"("id", "tenantId");

-- CreateIndex
CREATE INDEX "TheoreticalClassStudent_tenantId_processId_idx" ON "TheoreticalClassStudent"("tenantId", "processId");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_processId_tenantId_fkey" FOREIGN KEY ("processId", "tenantId") REFERENCES "StudentLicenseProcess"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheoreticalClassStudent" ADD CONSTRAINT "TheoreticalClassStudent_processId_tenantId_fkey" FOREIGN KEY ("processId", "tenantId") REFERENCES "StudentLicenseProcess"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLicenseProcess" ADD CONSTRAINT "StudentLicenseProcess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLicenseProcess" ADD CONSTRAINT "StudentLicenseProcess_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLicenseProcess" ADD CONSTRAINT "StudentLicenseProcess_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "SchoolUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLicenseProcess" ADD CONSTRAINT "StudentLicenseProcess_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProcessCategory" ADD CONSTRAINT "StudentProcessCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProcessCategory" ADD CONSTRAINT "StudentProcessCategory_processId_tenantId_fkey" FOREIGN KEY ("processId", "tenantId") REFERENCES "StudentLicenseProcess"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProcessCategory" ADD CONSTRAINT "StudentProcessCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LicenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStage" ADD CONSTRAINT "ProcessStage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStage" ADD CONSTRAINT "ProcessStage_processId_tenantId_fkey" FOREIGN KEY ("processId", "tenantId") REFERENCES "StudentLicenseProcess"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStageDependency" ADD CONSTRAINT "ProcessStageDependency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStageDependency" ADD CONSTRAINT "ProcessStageDependency_stageId_tenantId_fkey" FOREIGN KEY ("stageId", "tenantId") REFERENCES "ProcessStage"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStageDependency" ADD CONSTRAINT "ProcessStageDependency_dependsOnStageId_tenantId_fkey" FOREIGN KEY ("dependsOnStageId", "tenantId") REFERENCES "ProcessStage"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessDocumentRequirement" ADD CONSTRAINT "ProcessDocumentRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessDocumentRequirement" ADD CONSTRAINT "ProcessDocumentRequirement_processId_tenantId_fkey" FOREIGN KEY ("processId", "tenantId") REFERENCES "StudentLicenseProcess"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessDocumentRequirement" ADD CONSTRAINT "ProcessDocumentRequirement_studentDocumentId_tenantId_fkey" FOREIGN KEY ("studentDocumentId", "tenantId") REFERENCES "StudentDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessDocumentRequirement" ADD CONSTRAINT "ProcessDocumentRequirement_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessDocumentRequirement" ADD CONSTRAINT "ProcessDocumentRequirement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_processId_tenantId_fkey" FOREIGN KEY ("processId", "tenantId") REFERENCES "StudentLicenseProcess"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "SchoolUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
