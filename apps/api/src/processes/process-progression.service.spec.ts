import {
  LicenseProcessType,
  ProcessStageType,
  StudentDocumentType,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ProcessProgressionService } from "./process-progression.service";

const service = new ProcessProgressionService({} as never);

describe("ProcessProgressionService", () => {
  it("gera o fluxo completo para primeira habilitação", () => {
    expect(service.stageTypes(LicenseProcessType.FIRST_LICENSE)).toEqual([
      ProcessStageType.REGISTRATION,
      ProcessStageType.DOCUMENT_REVIEW,
      ProcessStageType.MEDICAL_EXAM,
      ProcessStageType.PSYCHOLOGICAL_EXAM,
      ProcessStageType.THEORETICAL_COURSE,
      ProcessStageType.THEORETICAL_EXAM,
      ProcessStageType.PRACTICAL_CLASSES,
      ProcessStageType.PRACTICAL_EXAM,
      ProcessStageType.LICENSE_ISSUANCE,
    ]);
  });

  it("não inclui etapas práticas na renovação", () => {
    const stages = service.stageTypes(LicenseProcessType.RENEWAL);
    expect(stages).not.toContain(ProcessStageType.PRACTICAL_CLASSES);
    expect(stages).not.toContain(ProcessStageType.PRACTICAL_EXAM);
  });

  it("exige CNH nos processos que não são primeira habilitação", () => {
    expect(service.documentTypes(LicenseProcessType.RENEWAL)).toContain(
      StudentDocumentType.CNH,
    );
    expect(
      service.documentTypes(LicenseProcessType.FIRST_LICENSE),
    ).not.toContain(StudentDocumentType.CNH);
  });
});
