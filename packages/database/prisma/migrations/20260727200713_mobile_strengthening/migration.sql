-- CreateEnum
CREATE TYPE "LessonChangeRequestType" AS ENUM ('CANCEL', 'RESCHEDULE');

-- CreateEnum
CREATE TYPE "LessonChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LessonEvaluationValue" AS ENUM ('NEEDS_IMPROVEMENT', 'DEVELOPING', 'SATISFACTORY', 'GOOD', 'EXCELLENT');

-- CreateEnum
CREATE TYPE "VehicleOccurrenceType" AS ENUM ('VEHICLE_ISSUE', 'ACCIDENT', 'DAMAGE', 'MECHANICAL_PROBLEM', 'CLEANING_REQUIRED', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleOccurrenceStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "MobileOperationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentUploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "endOdometerKm" INTEGER,
ADD COLUMN     "startOdometerKm" INTEGER,
ADD COLUMN     "studentNotes" TEXT;

-- AlterTable
ALTER TABLE "StudentDocument" ADD COLUMN     "fileMimeType" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSizeBytes" INTEGER,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "uploadedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LessonChangeRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "type" "LessonChangeRequestType" NOT NULL,
    "status" "LessonChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "preferredStartsAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonEvaluation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "evaluatorUserId" UUID NOT NULL,
    "control" "LessonEvaluationValue" NOT NULL,
    "attention" "LessonEvaluationValue" NOT NULL,
    "signaling" "LessonEvaluationValue" NOT NULL,
    "parking" "LessonEvaluationValue" NOT NULL,
    "gearShift" "LessonEvaluationValue" NOT NULL,
    "trafficRules" "LessonEvaluationValue" NOT NULL,
    "confidence" "LessonEvaluationValue" NOT NULL,
    "overallRating" "LessonEvaluationValue" NOT NULL,
    "notes" TEXT,
    "visibleToStudent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleOccurrence" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "lessonId" UUID,
    "reportedByUserId" UUID NOT NULL,
    "type" "VehicleOccurrenceType" NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "VehicleOccurrenceStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileOperation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "resourceId" UUID,
    "status" "MobileOperationStatus" NOT NULL DEFAULT 'PROCESSING',
    "response" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentUploadSession" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "documentId" UUID,
    "tokenHash" TEXT NOT NULL,
    "documentType" "StudentDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "DocumentUploadStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentUploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonChangeRequest_tenantId_studentId_status_createdAt_idx" ON "LessonChangeRequest"("tenantId", "studentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LessonChangeRequest_tenantId_lessonId_idx" ON "LessonChangeRequest"("tenantId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonChangeRequest_tenantId_lessonId_requestedByUserId_typ_key" ON "LessonChangeRequest"("tenantId", "lessonId", "requestedByUserId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LessonEvaluation_lessonId_key" ON "LessonEvaluation"("lessonId");

-- CreateIndex
CREATE INDEX "LessonEvaluation_tenantId_studentId_createdAt_idx" ON "LessonEvaluation"("tenantId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "LessonEvaluation_tenantId_instructorId_createdAt_idx" ON "LessonEvaluation"("tenantId", "instructorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonEvaluation_id_tenantId_key" ON "LessonEvaluation"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonEvaluation_lessonId_tenantId_key" ON "LessonEvaluation"("lessonId", "tenantId");

-- CreateIndex
CREATE INDEX "VehicleOccurrence_tenantId_vehicleId_status_occurredAt_idx" ON "VehicleOccurrence"("tenantId", "vehicleId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "VehicleOccurrence_tenantId_instructorId_occurredAt_idx" ON "VehicleOccurrence"("tenantId", "instructorId", "occurredAt");

-- CreateIndex
CREATE INDEX "VehicleOccurrence_tenantId_lessonId_idx" ON "VehicleOccurrence"("tenantId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleOccurrence_id_tenantId_key" ON "VehicleOccurrence"("id", "tenantId");

-- CreateIndex
CREATE INDEX "MobileOperation_tenantId_userId_status_createdAt_idx" ON "MobileOperation"("tenantId", "userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MobileOperation_tenantId_userId_idempotencyKey_key" ON "MobileOperation"("tenantId", "userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentUploadSession_tokenHash_key" ON "DocumentUploadSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DocumentUploadSession_tenantId_studentId_status_expiresAt_idx" ON "DocumentUploadSession"("tenantId", "studentId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentUploadSession_id_tenantId_key" ON "DocumentUploadSession"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "LessonChangeRequest" ADD CONSTRAINT "LessonChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonChangeRequest" ADD CONSTRAINT "LessonChangeRequest_lessonId_tenantId_fkey" FOREIGN KEY ("lessonId", "tenantId") REFERENCES "Lesson"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonChangeRequest" ADD CONSTRAINT "LessonChangeRequest_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonChangeRequest" ADD CONSTRAINT "LessonChangeRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEvaluation" ADD CONSTRAINT "LessonEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEvaluation" ADD CONSTRAINT "LessonEvaluation_lessonId_tenantId_fkey" FOREIGN KEY ("lessonId", "tenantId") REFERENCES "Lesson"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEvaluation" ADD CONSTRAINT "LessonEvaluation_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEvaluation" ADD CONSTRAINT "LessonEvaluation_instructorId_tenantId_fkey" FOREIGN KEY ("instructorId", "tenantId") REFERENCES "Instructor"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEvaluation" ADD CONSTRAINT "LessonEvaluation_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOccurrence" ADD CONSTRAINT "VehicleOccurrence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOccurrence" ADD CONSTRAINT "VehicleOccurrence_vehicleId_tenantId_fkey" FOREIGN KEY ("vehicleId", "tenantId") REFERENCES "Vehicle"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOccurrence" ADD CONSTRAINT "VehicleOccurrence_instructorId_tenantId_fkey" FOREIGN KEY ("instructorId", "tenantId") REFERENCES "Instructor"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOccurrence" ADD CONSTRAINT "VehicleOccurrence_lessonId_tenantId_fkey" FOREIGN KEY ("lessonId", "tenantId") REFERENCES "Lesson"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOccurrence" ADD CONSTRAINT "VehicleOccurrence_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileOperation" ADD CONSTRAINT "MobileOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileOperation" ADD CONSTRAINT "MobileOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUploadSession" ADD CONSTRAINT "DocumentUploadSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUploadSession" ADD CONSTRAINT "DocumentUploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUploadSession" ADD CONSTRAINT "DocumentUploadSession_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUploadSession" ADD CONSTRAINT "DocumentUploadSession_documentId_tenantId_fkey" FOREIGN KEY ("documentId", "tenantId") REFERENCES "StudentDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CommunicationCampaignRecipient_tenantId_campaignId_destination_" RENAME TO "CommunicationCampaignRecipient_tenantId_campaignId_destinat_key";
