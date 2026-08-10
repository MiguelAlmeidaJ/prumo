import { Module } from "@nestjs/common";
import { AuditService } from "../schedule/audit.service";
import { CashExpensesService } from "./cash-expenses.service";
import { CatalogsService } from "./catalogs.service";
import {
  CashRegistersController,
  ContractsController,
  ExpensesController,
  FinancialReportsController,
  PaymentsController,
  ReceivablesController,
  ServicePlansController,
  ServicesController,
} from "./financial.controllers";
import { ReceivablesPaymentsService } from "./receivables-payments.service";
import {
  AutomaticChargeService,
  FinancialEligibilityService,
  FinancialReportsService,
} from "./reports-eligibility.service";

@Module({
  controllers: [
    ServicesController,
    ServicePlansController,
    ContractsController,
    ReceivablesController,
    PaymentsController,
    CashRegistersController,
    ExpensesController,
    FinancialReportsController,
  ],
  providers: [
    CatalogsService,
    ReceivablesPaymentsService,
    CashExpensesService,
    FinancialEligibilityService,
    AutomaticChargeService,
    FinancialReportsService,
    AuditService,
  ],
  exports: [FinancialEligibilityService, AutomaticChargeService],
})
export class FinancialModule {}
