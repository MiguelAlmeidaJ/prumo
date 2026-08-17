-- Replace single-column relations with tenant-scoped composite foreign keys.
ALTER TABLE "ImportFile" DROP CONSTRAINT "ImportFile_importJobId_fkey";
ALTER TABLE "ImportIssue" DROP CONSTRAINT "ImportIssue_importFileId_fkey";
ALTER TABLE "ImportIssue" DROP CONSTRAINT "ImportIssue_importJobId_fkey";
ALTER TABLE "ImportMapping" DROP CONSTRAINT "ImportMapping_importFileId_fkey";
ALTER TABLE "ImportMapping" DROP CONSTRAINT "ImportMapping_importJobId_fkey";
ALTER TABLE "LegacyImportMap" DROP CONSTRAINT "LegacyImportMap_importJobId_fkey";

CREATE UNIQUE INDEX "ImportFile_id_tenantId_key" ON "ImportFile"("id", "tenantId");
CREATE UNIQUE INDEX "ImportJob_id_tenantId_key" ON "ImportJob"("id", "tenantId");

ALTER TABLE "ImportFile"
  ADD CONSTRAINT "ImportFile_importJobId_tenantId_fkey"
  FOREIGN KEY ("importJobId", "tenantId") REFERENCES "ImportJob"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportMapping"
  ADD CONSTRAINT "ImportMapping_importJobId_tenantId_fkey"
  FOREIGN KEY ("importJobId", "tenantId") REFERENCES "ImportJob"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportMapping"
  ADD CONSTRAINT "ImportMapping_importFileId_tenantId_fkey"
  FOREIGN KEY ("importFileId", "tenantId") REFERENCES "ImportFile"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegacyImportMap"
  ADD CONSTRAINT "LegacyImportMap_importJobId_tenantId_fkey"
  FOREIGN KEY ("importJobId", "tenantId") REFERENCES "ImportJob"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportIssue"
  ADD CONSTRAINT "ImportIssue_importJobId_tenantId_fkey"
  FOREIGN KEY ("importJobId", "tenantId") REFERENCES "ImportJob"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportIssue"
  ADD CONSTRAINT "ImportIssue_importFileId_tenantId_fkey"
  FOREIGN KEY ("importFileId", "tenantId") REFERENCES "ImportFile"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
