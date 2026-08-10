ALTER TABLE "Student" ADD COLUMN "userId" UUID;
ALTER TABLE "Instructor" ADD COLUMN "userId" UUID;

CREATE UNIQUE INDEX "Student_tenantId_userId_key"
ON "Student"("tenantId", "userId");

CREATE UNIQUE INDEX "Instructor_tenantId_userId_key"
ON "Instructor"("tenantId", "userId");

ALTER TABLE "Student"
ADD CONSTRAINT "Student_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Instructor"
ADD CONSTRAINT "Instructor_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
