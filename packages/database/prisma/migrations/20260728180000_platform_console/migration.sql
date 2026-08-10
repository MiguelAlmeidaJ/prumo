CREATE TYPE "PlatformRole" AS ENUM ('USER', 'PLATFORM_SUPPORT', 'PLATFORM_ADMIN', 'PLATFORM_OWNER');
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'PLATFORM_USER', 'SUPPORT', 'SYSTEM');
CREATE TYPE "SupportSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ENDED', 'REVOKED');
CREATE TYPE "PlatformPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL', 'MANUAL');

UPDATE "Membership" SET "role" = 'TENANT_ADMIN' WHERE "role" = 'PLATFORM_ADMIN';
BEGIN;
CREATE TYPE "MembershipRole_new" AS ENUM ('TENANT_OWNER', 'TENANT_ADMIN', 'SECRETARY', 'FINANCE', 'INSTRUCTOR', 'STUDENT');
ALTER TABLE "Membership" ALTER COLUMN "role" TYPE "MembershipRole_new" USING ("role"::text::"MembershipRole_new");
ALTER TYPE "MembershipRole" RENAME TO "MembershipRole_old";
ALTER TYPE "MembershipRole_new" RENAME TO "MembershipRole";
DROP TYPE "public"."MembershipRole_old";
COMMIT;

ALTER TYPE "TenantStatus" ADD VALUE 'PAST_DUE';
ALTER TYPE "TenantStatus" ADD VALUE 'ARCHIVED';

ALTER TABLE "AuditLog" ADD COLUMN "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
ADD COLUMN "impersonatedUserId" UUID,
ADD COLUMN "ipAddress" TEXT,
ADD COLUMN "platformUserId" UUID,
ADD COLUMN "reason" TEXT,
ADD COLUMN "supportSessionId" UUID,
ADD COLUMN "userAgent" TEXT,
ALTER COLUMN "tenantId" DROP NOT NULL,
ALTER COLUMN "entityId" SET DATA TYPE TEXT,
ALTER COLUMN "actorUserId" DROP NOT NULL;

ALTER TABLE "RefreshSession" ALTER COLUMN "tenantId" DROP NOT NULL,
ALTER COLUMN "membershipId" DROP NOT NULL;

ALTER TABLE "Tenant" ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "createdByPlatformUserId" UUID,
ADD COLUMN "planCode" TEXT,
ADD COLUMN "provisioningKey" TEXT,
ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspensionReason" TEXT,
ADD COLUMN "trialEndsAt" TIMESTAMP(3),
ADD COLUMN "trialStartsAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

CREATE TABLE "TenantSettings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "supportAccessEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requireMfaForManagers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformPlan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PlatformPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "monthlyPriceCents" INTEGER NOT NULL,
    "annualPriceCents" INTEGER,
    "maxUsers" INTEGER,
    "maxStudents" INTEGER,
    "maxUnits" INTEGER,
    "maxStorageBytes" BIGINT,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantSubscription" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "TenantSubscriptionStatus" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStartsAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodEndsAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportSession" (
    "id" UUID NOT NULL,
    "platformUserId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "ticketReference" TEXT,
    "status" "SupportSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedByUserId" UUID,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");
CREATE UNIQUE INDEX "PlatformPlan_code_key" ON "PlatformPlan"("code");
CREATE INDEX "PlatformPlan_status_name_idx" ON "PlatformPlan"("status", "name");
CREATE INDEX "TenantSubscription_tenantId_status_currentPeriodEndsAt_idx" ON "TenantSubscription"("tenantId", "status", "currentPeriodEndsAt");
CREATE INDEX "TenantSubscription_planId_status_idx" ON "TenantSubscription"("planId", "status");
CREATE INDEX "SupportSession_platformUserId_status_expiresAt_idx" ON "SupportSession"("platformUserId", "status", "expiresAt");
CREATE INDEX "SupportSession_tenantId_status_expiresAt_idx" ON "SupportSession"("tenantId", "status", "expiresAt");
CREATE INDEX "AuditLog_platformUserId_createdAt_idx" ON "AuditLog"("platformUserId", "createdAt");
CREATE INDEX "AuditLog_supportSessionId_createdAt_idx" ON "AuditLog"("supportSessionId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE UNIQUE INDEX "Tenant_provisioningKey_key" ON "Tenant"("provisioningKey");
CREATE INDEX "Tenant_status_createdAt_idx" ON "Tenant"("status", "createdAt");
CREATE INDEX "Tenant_planCode_status_idx" ON "Tenant"("planCode", "status");
CREATE INDEX "Tenant_trialEndsAt_idx" ON "Tenant"("trialEndsAt");
CREATE INDEX "User_platformRole_active_idx" ON "User"("platformRole", "active");

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_createdByPlatformUserId_fkey" FOREIGN KEY ("createdByPlatformUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_supportSessionId_fkey" FOREIGN KEY ("supportSessionId") REFERENCES "SupportSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
