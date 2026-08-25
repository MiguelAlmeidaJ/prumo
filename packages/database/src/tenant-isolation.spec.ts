import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);

function modelDefinition(modelName: string): string {
  const match = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );

  if (!match) {
    throw new Error(`Model ${modelName} não encontrado no schema Prisma.`);
  }

  return match[1].replace(/\s+/g, " ").trim();
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  const model = modelDefinition(modelName);

  it("requires tenantId on the model", () => {
    expect(model).toMatch(/\btenantId\s+String(?!\?)\b/);
  });

  it("relates to Tenant through tenantId", () => {
    expect(model).toMatch(
      /\btenant\s+Tenant\s+@relation\(fields:\s*\[tenantId\],\s*references:\s*\[id\]/,
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
    const model = modelDefinition(modelName);
    const uniqueFields = fields.map(escaped).join("\\s*,\\s*");

    expect(model).toMatch(new RegExp(`@@unique\\(\\[${uniqueFields}\\]`));
  });
});

describe("global authentication scope", () => {
  it("allows RefreshSession without tenant only for platform sessions", () => {
    const model = modelDefinition("RefreshSession");

    expect(model).toMatch(/\btenantId\s+String\?/);
    expect(model).toMatch(/\bmembershipId\s+String\?/);
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
      const model = modelDefinition(modelName);
      const fromFields = relationFromFields.map(escaped).join("\\s*,\\s*");

      expect(model).toMatch(
        new RegExp(
          `\\b${escaped(fieldName)}\\s+${escaped(relatedModel)}\\??\\s+@relation\\([^)]*fields:\\s*\\[${fromFields}\\][^)]*references:\\s*\\[id\\s*,\\s*tenantId\\]`,
        ),
      );
    },
  );
});
