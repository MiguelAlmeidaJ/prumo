CREATE TYPE "Weekday" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');
CREATE TYPE "ScheduleResourceType" AS ENUM ('INSTRUCTOR', 'VEHICLE', 'CLASSROOM', 'UNIT');
CREATE TYPE "AttendanceStatus" AS ENUM ('ENROLLED', 'PRESENT', 'ABSENT', 'EXCUSED');

CREATE TABLE "SchoolUnit" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "openingTime" TEXT NOT NULL,
  "closingTime" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolUnit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolUnit_hours_check" CHECK ("openingTime" < "closingTime")
);

CREATE TABLE "Classroom" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Classroom_capacity_check" CHECK ("capacity" > 0)
);

CREATE TABLE "InstructorAvailability" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "instructorId" UUID NOT NULL,
  "weekday" "Weekday" NOT NULL,
  "startsAt" TEXT NOT NULL,
  "endsAt" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstructorAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstructorAvailability_time_check" CHECK ("startsAt" < "endsAt")
);

CREATE TABLE "ScheduleBlock" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "resourceType" "ScheduleResourceType" NOT NULL,
  "instructorId" UUID,
  "vehicleId" UUID,
  "classroomId" UUID,
  "unitId" UUID,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduleBlock_time_check" CHECK ("startsAt" < "endsAt"),
  CONSTRAINT "ScheduleBlock_resource_check" CHECK (
    ("resourceType" = 'INSTRUCTOR' AND "instructorId" IS NOT NULL AND "vehicleId" IS NULL AND "classroomId" IS NULL AND "unitId" IS NULL) OR
    ("resourceType" = 'VEHICLE' AND "instructorId" IS NULL AND "vehicleId" IS NOT NULL AND "classroomId" IS NULL AND "unitId" IS NULL) OR
    ("resourceType" = 'CLASSROOM' AND "instructorId" IS NULL AND "vehicleId" IS NULL AND "classroomId" IS NOT NULL AND "unitId" IS NULL) OR
    ("resourceType" = 'UNIT' AND "instructorId" IS NULL AND "vehicleId" IS NULL AND "classroomId" IS NULL AND "unitId" IS NOT NULL)
  )
);

CREATE TABLE "TheoreticalClass" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "classroomId" UUID NOT NULL,
  "instructorId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "capacity" INTEGER NOT NULL,
  "status" "LessonStatus" NOT NULL DEFAULT 'PENDING',
  "createdByUserId" UUID NOT NULL,
  "completedAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TheoreticalClass_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TheoreticalClass_time_check" CHECK ("startsAt" < "endsAt"),
  CONSTRAINT "TheoreticalClass_capacity_check" CHECK ("capacity" > 0)
);

CREATE TABLE "TheoreticalClassStudent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "theoreticalClassId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "attendanceStatus" "AttendanceStatus" NOT NULL DEFAULT 'ENROLLED',
  "checkInAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TheoreticalClassStudent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" UUID NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Lesson"
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "createdByUserId" UUID NOT NULL,
  ADD COLUMN "rescheduledFromId" UUID,
  ADD COLUMN "unitId" UUID NOT NULL,
  ALTER COLUMN "instructorId" SET NOT NULL,
  ALTER COLUMN "vehicleId" SET NOT NULL,
  ALTER COLUMN "type" SET DEFAULT 'PRACTICAL',
  ADD CONSTRAINT "Lesson_time_check" CHECK ("startsAt" < "endsAt");

CREATE INDEX "SchoolUnit_tenantId_active_idx" ON "SchoolUnit"("tenantId", "active");
CREATE UNIQUE INDEX "SchoolUnit_tenantId_name_key" ON "SchoolUnit"("tenantId", "name");
CREATE UNIQUE INDEX "SchoolUnit_tenantId_document_key" ON "SchoolUnit"("tenantId", "document");
CREATE UNIQUE INDEX "SchoolUnit_id_tenantId_key" ON "SchoolUnit"("id", "tenantId");
CREATE INDEX "Classroom_tenantId_unitId_active_idx" ON "Classroom"("tenantId", "unitId", "active");
CREATE UNIQUE INDEX "Classroom_tenantId_unitId_name_key" ON "Classroom"("tenantId", "unitId", "name");
CREATE UNIQUE INDEX "Classroom_id_tenantId_key" ON "Classroom"("id", "tenantId");
CREATE INDEX "InstructorAvailability_tenantId_instructorId_weekday_active_idx" ON "InstructorAvailability"("tenantId", "instructorId", "weekday", "active");
CREATE UNIQUE INDEX "InstructorAvailability_tenantId_instructorId_weekday_starts_key" ON "InstructorAvailability"("tenantId", "instructorId", "weekday", "startsAt", "endsAt");
CREATE UNIQUE INDEX "InstructorAvailability_id_tenantId_key" ON "InstructorAvailability"("id", "tenantId");
CREATE INDEX "ScheduleBlock_tenantId_startsAt_endsAt_idx" ON "ScheduleBlock"("tenantId", "startsAt", "endsAt");
CREATE INDEX "ScheduleBlock_tenantId_instructorId_startsAt_idx" ON "ScheduleBlock"("tenantId", "instructorId", "startsAt");
CREATE INDEX "ScheduleBlock_tenantId_vehicleId_startsAt_idx" ON "ScheduleBlock"("tenantId", "vehicleId", "startsAt");
CREATE INDEX "ScheduleBlock_tenantId_classroomId_startsAt_idx" ON "ScheduleBlock"("tenantId", "classroomId", "startsAt");
CREATE INDEX "ScheduleBlock_tenantId_unitId_startsAt_idx" ON "ScheduleBlock"("tenantId", "unitId", "startsAt");
CREATE UNIQUE INDEX "ScheduleBlock_id_tenantId_key" ON "ScheduleBlock"("id", "tenantId");
CREATE INDEX "TheoreticalClass_tenantId_startsAt_idx" ON "TheoreticalClass"("tenantId", "startsAt");
CREATE INDEX "TheoreticalClass_tenantId_unitId_startsAt_idx" ON "TheoreticalClass"("tenantId", "unitId", "startsAt");
CREATE INDEX "TheoreticalClass_tenantId_classroomId_startsAt_idx" ON "TheoreticalClass"("tenantId", "classroomId", "startsAt");
CREATE INDEX "TheoreticalClass_tenantId_instructorId_startsAt_idx" ON "TheoreticalClass"("tenantId", "instructorId", "startsAt");
CREATE UNIQUE INDEX "TheoreticalClass_id_tenantId_key" ON "TheoreticalClass"("id", "tenantId");
CREATE INDEX "TheoreticalClassStudent_tenantId_studentId_idx" ON "TheoreticalClassStudent"("tenantId", "studentId");
CREATE UNIQUE INDEX "TheoreticalClassStudent_tenantId_theoreticalClassId_student_key" ON "TheoreticalClassStudent"("tenantId", "theoreticalClassId", "studentId");
CREATE INDEX "AuditLog_tenantId_entityType_entityId_createdAt_idx" ON "AuditLog"("tenantId", "entityType", "entityId", "createdAt");
CREATE INDEX "AuditLog_tenantId_actorUserId_createdAt_idx" ON "AuditLog"("tenantId", "actorUserId", "createdAt");
CREATE UNIQUE INDEX "Lesson_rescheduledFromId_key" ON "Lesson"("rescheduledFromId");
CREATE INDEX "Lesson_tenantId_unitId_startsAt_idx" ON "Lesson"("tenantId", "unitId", "startsAt");
CREATE UNIQUE INDEX "Lesson_id_tenantId_key" ON "Lesson"("id", "tenantId");

ALTER TABLE "SchoolUnit" ADD CONSTRAINT "SchoolUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "SchoolUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstructorAvailability" ADD CONSTRAINT "InstructorAvailability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorAvailability" ADD CONSTRAINT "InstructorAvailability_instructorId_tenantId_fkey" FOREIGN KEY ("instructorId", "tenantId") REFERENCES "Instructor"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_instructorId_tenantId_fkey" FOREIGN KEY ("instructorId", "tenantId") REFERENCES "Instructor"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_vehicleId_tenantId_fkey" FOREIGN KEY ("vehicleId", "tenantId") REFERENCES "Vehicle"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_classroomId_tenantId_fkey" FOREIGN KEY ("classroomId", "tenantId") REFERENCES "Classroom"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "SchoolUnit"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TheoreticalClass" ADD CONSTRAINT "TheoreticalClass_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TheoreticalClass" ADD CONSTRAINT "TheoreticalClass_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "SchoolUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TheoreticalClass" ADD CONSTRAINT "TheoreticalClass_classroomId_tenantId_fkey" FOREIGN KEY ("classroomId", "tenantId") REFERENCES "Classroom"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TheoreticalClass" ADD CONSTRAINT "TheoreticalClass_instructorId_tenantId_fkey" FOREIGN KEY ("instructorId", "tenantId") REFERENCES "Instructor"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TheoreticalClass" ADD CONSTRAINT "TheoreticalClass_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TheoreticalClassStudent" ADD CONSTRAINT "TheoreticalClassStudent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TheoreticalClassStudent" ADD CONSTRAINT "TheoreticalClassStudent_theoreticalClassId_tenantId_fkey" FOREIGN KEY ("theoreticalClassId", "tenantId") REFERENCES "TheoreticalClass"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TheoreticalClassStudent" ADD CONSTRAINT "TheoreticalClassStudent_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "SchoolUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
