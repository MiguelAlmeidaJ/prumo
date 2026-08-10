-- CreateEnum
CREATE TYPE "RegistryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StudentDocumentType" AS ENUM ('RG', 'CNH', 'BIRTH_CERTIFICATE', 'PROOF_OF_ADDRESS', 'OTHER');

-- CreateEnum
CREATE TYPE "StudentProcessStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- Drop legacy lesson foreign keys before replacing them with tenant-safe composites
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_instructorId_fkey";
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_studentId_fkey";
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_vehicleId_fkey";

-- Evolve base records while preserving the legacy active flag
ALTER TABLE "Instructor"
ADD COLUMN "credentialNumber" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "licenseCategory" TEXT,
ADD COLUMN "licenseExpiresAt" TIMESTAMP(3),
ADD COLUMN "phone" TEXT,
ADD COLUMN "status" "RegistryStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "Instructor" SET "status" = 'INACTIVE' WHERE "active" = false;
ALTER TABLE "Instructor" DROP COLUMN "active";

ALTER TABLE "Student"
ADD COLUMN "birthDate" TIMESTAMP(3),
ADD COLUMN "secondaryPhone" TEXT,
ADD COLUMN "socialName" TEXT,
ADD COLUMN "status" "RegistryStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "Student" SET "status" = 'INACTIVE' WHERE "active" = false;
ALTER TABLE "Student" DROP COLUMN "active";

ALTER TABLE "Vehicle"
ADD COLUMN "category" TEXT,
ADD COLUMN "chassis" TEXT,
ADD COLUMN "color" TEXT,
ADD COLUMN "renavam" TEXT,
ADD COLUMN "status" "RegistryStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "Vehicle" SET "status" = 'INACTIVE' WHERE "active" = false;
ALTER TABLE "Vehicle" DROP COLUMN "active";

-- CreateTable
CREATE TABLE "StudentAddress" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "zipCode" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentDocument" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "type" "StudentDocumentType" NOT NULL,
    "number" TEXT NOT NULL,
    "issuingAuthority" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentNote" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentProcess" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "renach" TEXT,
    "status" "StudentProcessStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentProcess_pkey" PRIMARY KEY ("id")
);

-- Tenant indexes and uniqueness
CREATE INDEX "StudentAddress_tenantId_studentId_idx" ON "StudentAddress"("tenantId", "studentId");
CREATE UNIQUE INDEX "StudentAddress_studentId_tenantId_key" ON "StudentAddress"("studentId", "tenantId");
CREATE INDEX "StudentDocument_tenantId_studentId_idx" ON "StudentDocument"("tenantId", "studentId");
CREATE UNIQUE INDEX "StudentDocument_tenantId_studentId_type_number_key" ON "StudentDocument"("tenantId", "studentId", "type", "number");
CREATE INDEX "StudentNote_tenantId_studentId_createdAt_idx" ON "StudentNote"("tenantId", "studentId", "createdAt");
CREATE INDEX "StudentProcess_tenantId_studentId_status_idx" ON "StudentProcess"("tenantId", "studentId", "status");
CREATE INDEX "StudentProcess_tenantId_renach_idx" ON "StudentProcess"("tenantId", "renach");
CREATE INDEX "Instructor_tenantId_status_idx" ON "Instructor"("tenantId", "status");
CREATE INDEX "Instructor_tenantId_email_idx" ON "Instructor"("tenantId", "email");
CREATE INDEX "Instructor_tenantId_phone_idx" ON "Instructor"("tenantId", "phone");
CREATE UNIQUE INDEX "Instructor_id_tenantId_key" ON "Instructor"("id", "tenantId");
CREATE INDEX "Student_tenantId_status_idx" ON "Student"("tenantId", "status");
CREATE INDEX "Student_tenantId_email_idx" ON "Student"("tenantId", "email");
CREATE INDEX "Student_tenantId_phone_idx" ON "Student"("tenantId", "phone");
CREATE UNIQUE INDEX "Student_id_tenantId_key" ON "Student"("id", "tenantId");
CREATE INDEX "Vehicle_tenantId_status_idx" ON "Vehicle"("tenantId", "status");
CREATE INDEX "Vehicle_tenantId_model_idx" ON "Vehicle"("tenantId", "model");
CREATE UNIQUE INDEX "Vehicle_id_tenantId_key" ON "Vehicle"("id", "tenantId");
CREATE UNIQUE INDEX "Vehicle_tenantId_renavam_key" ON "Vehicle"("tenantId", "renavam");

-- Tenant-safe relations for student children
ALTER TABLE "StudentAddress" ADD CONSTRAINT "StudentAddress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentAddress" ADD CONSTRAINT "StudentAddress_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentNote" ADD CONSTRAINT "StudentNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentNote" ADD CONSTRAINT "StudentNote_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentProcess" ADD CONSTRAINT "StudentProcess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentProcess" ADD CONSTRAINT "StudentProcess_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prevent cross-tenant scheduling links
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_instructorId_tenantId_fkey" FOREIGN KEY ("instructorId", "tenantId") REFERENCES "Instructor"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_vehicleId_tenantId_fkey" FOREIGN KEY ("vehicleId", "tenantId") REFERENCES "Vehicle"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
