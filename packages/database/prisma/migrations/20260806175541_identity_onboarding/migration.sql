-- CreateEnum
CREATE TYPE "UserCredentialTokenType" AS ENUM ('INVITATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserCredentialToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    "type" "UserCredentialTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCredentialToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCredentialToken_tokenHash_key" ON "UserCredentialToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserCredentialToken_userId_type_consumedAt_expiresAt_idx" ON "UserCredentialToken"("userId", "type", "consumedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "UserCredentialToken_tenantId_type_createdAt_idx" ON "UserCredentialToken"("tenantId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "UserCredentialToken" ADD CONSTRAINT "UserCredentialToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCredentialToken" ADD CONSTRAINT "UserCredentialToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
