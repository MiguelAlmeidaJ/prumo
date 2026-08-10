-- CreateEnum
CREATE TYPE "FinancialServiceCategory" AS ENUM ('ENROLLMENT', 'THEORETICAL_COURSE', 'PRACTICAL_LESSON', 'PRACTICAL_LESSON_PACKAGE', 'THEORETICAL_EXAM', 'PRACTICAL_EXAM', 'MEDICAL_EXAM', 'PSYCHOLOGICAL_EXAM', 'RETEST', 'DOCUMENT_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "ServicePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StudentContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "ContractItemSourceType" AS ENUM ('PLAN', 'PROCESS', 'PRACTICAL_LESSON', 'THEORETICAL_CLASS', 'EXAM', 'MANUAL');

-- CreateEnum
CREATE TYPE "ContractAdjustmentType" AS ENUM ('DISCOUNT', 'SURCHARGE', 'CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'NEGOTIATED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'BANK_SLIP', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'SUPPLY', 'ADJUSTMENT', 'REFUND', 'CLOSING');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "FinancialServiceCategory" NOT NULL,
    "defaultPriceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePlan" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ServicePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPriceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePlanItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentContract" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "processId" UUID,
    "unitId" UUID NOT NULL,
    "planId" UUID,
    "contractNumber" TEXT NOT NULL,
    "status" "StudentContractStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "surchargeCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "signedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentContractItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "serviceId" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "surchargeCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "sourceType" "ContractItemSourceType" NOT NULL,
    "sourceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentContractItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAdjustment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "type" "ContractAdjustmentType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivableInstallment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "originalAmountCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "interestCents" INTEGER NOT NULL DEFAULT 0,
    "fineCents" INTEGER NOT NULL DEFAULT 0,
    "adjustmentCents" INTEGER NOT NULL DEFAULT 0,
    "amountDueCents" INTEGER NOT NULL,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "balanceCents" INTEGER NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivableInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "contractId" UUID,
    "amountCents" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "cashRegisterId" UUID,
    "externalReference" TEXT,
    "notes" TEXT,
    "receivedByUserId" UUID NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PaymentRefundStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'OPEN',
    "openingBalanceCents" INTEGER NOT NULL,
    "expectedBalanceCents" INTEGER NOT NULL,
    "countedBalanceCents" INTEGER,
    "differenceCents" INTEGER,
    "openedByUserId" UUID NOT NULL,
    "closedByUserId" UUID,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "cashRegisterId" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentId" UUID,
    "expenseId" UUID,
    "description" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "supplierName" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod",
    "cashRegisterId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantFinancialSettings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "autoChargeExamRetest" BOOLEAN NOT NULL DEFAULT false,
    "autoChargeExtraLesson" BOOLEAN NOT NULL DEFAULT false,
    "blockSchedulingWithDebt" BOOLEAN NOT NULL DEFAULT false,
    "debtToleranceCents" INTEGER NOT NULL DEFAULT 0,
    "requireOpenCashRegisterForCashPayment" BOOLEAN NOT NULL DEFAULT true,
    "defaultFinePercentageBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "defaultMonthlyInterestBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFinancialSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_tenantId_name_idx" ON "Service"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Service_tenantId_category_active_idx" ON "Service"("tenantId", "category", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Service_tenantId_code_key" ON "Service"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Service_id_tenantId_key" ON "Service"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ServicePlan_tenantId_status_name_idx" ON "ServicePlan"("tenantId", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePlan_id_tenantId_key" ON "ServicePlan"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ServicePlanItem_tenantId_planId_idx" ON "ServicePlanItem"("tenantId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePlanItem_tenantId_planId_serviceId_key" ON "ServicePlanItem"("tenantId", "planId", "serviceId");

-- CreateIndex
CREATE INDEX "StudentContract_tenantId_studentId_status_idx" ON "StudentContract"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "StudentContract_tenantId_unitId_status_idx" ON "StudentContract"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "StudentContract_tenantId_processId_idx" ON "StudentContract"("tenantId", "processId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentContract_tenantId_contractNumber_key" ON "StudentContract"("tenantId", "contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StudentContract_id_tenantId_key" ON "StudentContract"("id", "tenantId");

-- CreateIndex
CREATE INDEX "StudentContractItem_tenantId_contractId_idx" ON "StudentContractItem"("tenantId", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentContractItem_tenantId_sourceType_sourceId_key" ON "StudentContractItem"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentContractItem_id_tenantId_key" ON "StudentContractItem"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ContractAdjustment_tenantId_contractId_createdAt_idx" ON "ContractAdjustment"("tenantId", "contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ReceivableInstallment_tenantId_studentId_status_dueDate_idx" ON "ReceivableInstallment"("tenantId", "studentId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ReceivableInstallment_tenantId_status_dueDate_idx" ON "ReceivableInstallment"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivableInstallment_tenantId_contractId_installmentNumber_key" ON "ReceivableInstallment"("tenantId", "contractId", "installmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivableInstallment_id_tenantId_key" ON "ReceivableInstallment"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_studentId_receivedAt_idx" ON "Payment"("tenantId", "studentId", "receivedAt");

-- CreateIndex
CREATE INDEX "Payment_tenantId_status_receivedAt_idx" ON "Payment"("tenantId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "Payment_tenantId_contractId_idx" ON "Payment"("tenantId", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_id_tenantId_key" ON "Payment"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_tenantId_installmentId_idx" ON "PaymentAllocation"("tenantId", "installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_tenantId_paymentId_installmentId_key" ON "PaymentAllocation"("tenantId", "paymentId", "installmentId");

-- CreateIndex
CREATE INDEX "PaymentRefund_tenantId_paymentId_createdAt_idx" ON "PaymentRefund"("tenantId", "paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_unitId_status_idx" ON "CashRegister"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_openedByUserId_status_idx" ON "CashRegister"("tenantId", "openedByUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_id_tenantId_key" ON "CashRegister"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_cashRegisterId_createdAt_idx" ON "CashMovement"("tenantId", "cashRegisterId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_paymentId_idx" ON "CashMovement"("tenantId", "paymentId");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_expenseId_idx" ON "CashMovement"("tenantId", "expenseId");

-- CreateIndex
CREATE INDEX "ExpenseCategory_tenantId_active_idx" ON "ExpenseCategory"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_tenantId_name_key" ON "ExpenseCategory"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_id_tenantId_key" ON "ExpenseCategory"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_unitId_status_dueDate_idx" ON "Expense"("tenantId", "unitId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Expense_tenantId_categoryId_status_idx" ON "Expense"("tenantId", "categoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_id_tenantId_key" ON "Expense"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFinancialSettings_tenantId_key" ON "TenantFinancialSettings"("tenantId");

-- CreateIndex
CREATE INDEX "TenantFinancialSettings_tenantId_idx" ON "TenantFinancialSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlan" ADD CONSTRAINT "ServicePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanItem" ADD CONSTRAINT "ServicePlanItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanItem" ADD CONSTRAINT "ServicePlanItem_planId_tenantId_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "ServicePlan"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanItem" ADD CONSTRAINT "ServicePlanItem_serviceId_tenantId_fkey" FOREIGN KEY ("serviceId", "tenantId") REFERENCES "Service"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract" ADD CONSTRAINT "StudentContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract" ADD CONSTRAINT "StudentContract_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract" ADD CONSTRAINT "StudentContract_processId_tenantId_fkey" FOREIGN KEY ("processId", "tenantId") REFERENCES "StudentLicenseProcess"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract" ADD CONSTRAINT "StudentContract_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "SchoolUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract" ADD CONSTRAINT "StudentContract_planId_tenantId_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "ServicePlan"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract" ADD CONSTRAINT "StudentContract_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContractItem" ADD CONSTRAINT "StudentContractItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContractItem" ADD CONSTRAINT "StudentContractItem_contractId_tenantId_fkey" FOREIGN KEY ("contractId", "tenantId") REFERENCES "StudentContract"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContractItem" ADD CONSTRAINT "StudentContractItem_serviceId_tenantId_fkey" FOREIGN KEY ("serviceId", "tenantId") REFERENCES "Service"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAdjustment" ADD CONSTRAINT "ContractAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAdjustment" ADD CONSTRAINT "ContractAdjustment_contractId_tenantId_fkey" FOREIGN KEY ("contractId", "tenantId") REFERENCES "StudentContract"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAdjustment" ADD CONSTRAINT "ContractAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableInstallment" ADD CONSTRAINT "ReceivableInstallment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableInstallment" ADD CONSTRAINT "ReceivableInstallment_contractId_tenantId_fkey" FOREIGN KEY ("contractId", "tenantId") REFERENCES "StudentContract"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableInstallment" ADD CONSTRAINT "ReceivableInstallment_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_contractId_tenantId_fkey" FOREIGN KEY ("contractId", "tenantId") REFERENCES "StudentContract"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashRegisterId_tenantId_fkey" FOREIGN KEY ("cashRegisterId", "tenantId") REFERENCES "CashRegister"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_tenantId_fkey" FOREIGN KEY ("paymentId", "tenantId") REFERENCES "Payment"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_installmentId_tenantId_fkey" FOREIGN KEY ("installmentId", "tenantId") REFERENCES "ReceivableInstallment"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentId_tenantId_fkey" FOREIGN KEY ("paymentId", "tenantId") REFERENCES "Payment"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "SchoolUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashRegisterId_tenantId_fkey" FOREIGN KEY ("cashRegisterId", "tenantId") REFERENCES "CashRegister"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_paymentId_tenantId_fkey" FOREIGN KEY ("paymentId", "tenantId") REFERENCES "Payment"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_expenseId_tenantId_fkey" FOREIGN KEY ("expenseId", "tenantId") REFERENCES "Expense"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "SchoolUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_tenantId_fkey" FOREIGN KEY ("categoryId", "tenantId") REFERENCES "ExpenseCategory"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashRegisterId_tenantId_fkey" FOREIGN KEY ("cashRegisterId", "tenantId") REFERENCES "CashRegister"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFinancialSettings" ADD CONSTRAINT "TenantFinancialSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
