-- Replace the global student reference with a tenant-scoped relation.
ALTER TABLE "ProcessDocumentRequirement"
DROP CONSTRAINT "ProcessDocumentRequirement_studentId_fkey";

ALTER TABLE "ProcessDocumentRequirement"
ADD CONSTRAINT "ProcessDocumentRequirement_studentId_tenantId_fkey"
FOREIGN KEY ("studentId", "tenantId")
REFERENCES "Student"("id", "tenantId")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Keep upload requirements inside the same tenant at database level.
ALTER TABLE "DocumentUploadSession"
ADD CONSTRAINT "DocumentUploadSession_processRequirementId_tenantId_fkey"
FOREIGN KEY ("processRequirementId", "tenantId")
REFERENCES "ProcessDocumentRequirement"("id", "tenantId")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Campaign targets must belong to the campaign tenant.
ALTER TABLE "CommunicationCampaignRecipient"
ADD CONSTRAINT "CommunicationCampaignRecipient_studentId_tenantId_fkey"
FOREIGN KEY ("studentId", "tenantId")
REFERENCES "Student"("id", "tenantId")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "CommunicationCampaignRecipient"
ADD CONSTRAINT "CommunicationCampaignRecipient_instructorId_tenantId_fkey"
FOREIGN KEY ("instructorId", "tenantId")
REFERENCES "Instructor"("id", "tenantId")
ON DELETE RESTRICT
ON UPDATE CASCADE;
