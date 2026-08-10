import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

const tenantScopedModels = [
  "Membership",
  "Student",
  "StudentAddress",
  "StudentDocument",
  "StudentNote",
  "StudentProcess",
  "Instructor",
  "Vehicle",
  "Lesson",
  "SchoolUnit",
  "Classroom",
  "InstructorAvailability",
  "ScheduleBlock",
  "TheoreticalClass",
  "TheoreticalClassStudent",
  "StudentLicenseProcess",
  "StudentProcessCategory",
  "ProcessStage",
  "ProcessStageDependency",
  "ProcessDocumentRequirement",
  "Exam",
  "Service",
  "ServicePlan",
  "ServicePlanItem",
  "StudentContract",
  "StudentContractItem",
  "ContractAdjustment",
  "ReceivableInstallment",
  "Payment",
  "PaymentAllocation",
  "PaymentRefund",
  "CashRegister",
  "CashMovement",
  "ExpenseCategory",
  "Expense",
  "TenantFinancialSettings",
  "TenantSettings",
  "TenantSubscription",
  "SupportSession",
  "Notification",
  "NotificationPreference",
  "NotificationDelivery",
  "ReminderRule",
  "CommunicationCampaign",
  "CommunicationCampaignRecipient",
  "LessonChangeRequest",
  "LessonEvaluation",
  "VehicleOccurrence",
  "MobileOperation",
  "DocumentUploadSession",
] as const;

describe.each(tenantScopedModels)("%s tenant isolation", (modelName) => {
  const model = Prisma.dmmf.datamodel.models.find(
    ({ name }) => name === modelName,
  );

  it("requires tenantId on the model", () => {
    expect(model).toBeDefined();
    expect(model?.fields).toContainEqual(
      expect.objectContaining({
        name: "tenantId",
        kind: "scalar",
        type: "String",
        isRequired: true,
      }),
    );
  });

  it("relates to Tenant through tenantId", () => {
    expect(model?.fields).toContainEqual(
      expect.objectContaining({
        name: "tenant",
        kind: "object",
        type: "Tenant",
        relationFromFields: ["tenantId"],
        relationToFields: ["id"],
      }),
    );
  });
});

describe("tenant-scoped natural identifiers", () => {
  it.each([
    ["Membership", ["tenantId", "userId"]],
    ["Student", ["tenantId", "cpf"]],
    ["Instructor", ["tenantId", "cpf"]],
    ["Vehicle", ["tenantId", "plate"]],
    ["Service", ["tenantId", "code"]],
    ["StudentContract", ["tenantId", "contractNumber"]],
    ["ExpenseCategory", ["tenantId", "name"]],
  ])("scopes %s uniqueness by tenant", (modelName, fields) => {
    const model = Prisma.dmmf.datamodel.models.find(
      ({ name }) => name === modelName,
    );

    expect(model?.uniqueFields).toContainEqual(fields);
  });
});

describe("global authentication scope", () => {
  it("allows RefreshSession without tenant only for platform sessions", () => {
    const model = Prisma.dmmf.datamodel.models.find(
      ({ name }) => name === "RefreshSession",
    );
    expect(model?.fields).toContainEqual(
      expect.objectContaining({
        name: "tenantId",
        kind: "scalar",
        type: "String",
        isRequired: false,
      }),
    );
    expect(model?.fields).toContainEqual(
      expect.objectContaining({
        name: "membershipId",
        kind: "scalar",
        type: "String",
        isRequired: false,
      }),
    );
  });
});

describe("tenant-scoped foreign keys", () => {
  it.each([
    [
      "ProcessDocumentRequirement",
      "student",
      ["studentId", "tenantId"],
      "Student",
    ],
    [
      "DocumentUploadSession",
      "processRequirement",
      ["processRequirementId", "tenantId"],
      "ProcessDocumentRequirement",
    ],
    [
      "CommunicationCampaignRecipient",
      "student",
      ["studentId", "tenantId"],
      "Student",
    ],
    [
      "CommunicationCampaignRecipient",
      "instructor",
      ["instructorId", "tenantId"],
      "Instructor",
    ],
  ])(
    "scopes %s.%s by tenant",
    (modelName, fieldName, relationFromFields, relatedModel) => {
      const model = Prisma.dmmf.datamodel.models.find(
        ({ name }) => name === modelName,
      );
      expect(model?.fields).toContainEqual(
        expect.objectContaining({
          name: fieldName,
          kind: "object",
          type: relatedModel,
          relationFromFields,
          relationToFields: ["id", "tenantId"],
        }),
      );
    },
  );
});
