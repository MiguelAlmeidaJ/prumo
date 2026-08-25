ALTER TYPE "TenantSubscriptionStatus" ADD VALUE 'DRAFT';
ALTER TYPE "TenantSubscriptionStatus" ADD VALUE 'EXPIRED';

ALTER TYPE "BillingCycle" ADD VALUE 'QUARTERLY';
ALTER TYPE "BillingCycle" ADD VALUE 'SEMIANNUAL';

ALTER TABLE "PlatformPlan"
ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "defaultBillingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN "maxInstructors" INTEGER,
ADD COLUMN "maxVehicles" INTEGER;

ALTER TABLE "TenantSubscription"
ADD COLUMN "contractedPriceCents" INTEGER,
ADD COLUMN "endsAt" TIMESTAMP(3),
ADD COLUMN "contractNumber" TEXT,
ADD COLUMN "notes" TEXT;

UPDATE "TenantSubscription" AS subscription
SET "contractedPriceCents" = plan."monthlyPriceCents"
FROM "PlatformPlan" AS plan
WHERE subscription."planId" = plan."id";

ALTER TABLE "TenantSubscription"
ALTER COLUMN "contractedPriceCents" SET NOT NULL;

DROP INDEX "PlatformPlan_status_name_idx";
CREATE INDEX "PlatformPlan_status_displayOrder_name_idx"
ON "PlatformPlan"("status", "displayOrder", "name");

CREATE INDEX "TenantSubscription_billingCycle_status_idx"
ON "TenantSubscription"("billingCycle", "status");
