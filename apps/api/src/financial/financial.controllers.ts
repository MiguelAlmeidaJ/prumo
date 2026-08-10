import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type {
  AuthenticatedUser,
  CurrentTenantContext,
} from "../auth/auth.types";
import { CurrentTenant } from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { CashExpensesService } from "./cash-expenses.service";
import { CatalogsService } from "./catalogs.service";
import {
  ActiveDto,
  AmountReasonDto,
  CashMovementDto,
  CashRegisterQueryDto,
  CloseCashRegisterDto,
  ContractAdjustmentDto,
  CreateContractDto,
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  CreatePaymentDto,
  CreateServiceDto,
  CreateServicePlanDto,
  ExpenseQueryDto,
  FinancialPageQueryDto,
  FinancialReportQueryDto,
  GenerateInstallmentsDto,
  OpenCashRegisterDto,
  PayExpenseDto,
  PaymentQueryDto,
  PlanQueryDto,
  ReasonDto,
  ReceivableQueryDto,
  ServiceQueryDto,
  UpdateContractDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
  UpdateFinancialSettingsDto,
  UpdateServiceDto,
  UpdateServicePlanDto,
} from "./dto/financial.dto";
import {
  FinancialEligibilityService,
  FinancialReportsService,
} from "./reports-eligibility.service";
import { ReceivablesPaymentsService } from "./receivables-payments.service";

const guards = [JwtAuthGuard, TenantGuard, PermissionsGuard];

@ApiTags("financial-services")
@ApiBearerAuth("bearer")
@UseGuards(...guards)
@Controller("services")
export class ServicesController {
  constructor(private readonly service: CatalogsService) {}

  @Post()
  @Permissions("services.create")
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateServiceDto,
  ) {
    return this.service.createService(tenant.id, user.id, input);
  }

  @Get()
  @Permissions("services.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: ServiceQueryDto,
  ) {
    return this.service.listServices(tenant.id, query);
  }

  @Get(":id")
  @Permissions("services.read")
  find(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findService(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("services.update")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateServiceDto,
  ) {
    return this.service.updateService(tenant.id, user.id, id, input);
  }

  @Patch(":id/status")
  @Permissions("services.update")
  status(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ActiveDto,
  ) {
    return this.service.setServiceStatus(tenant.id, user.id, id, input);
  }
}

@ApiTags("service-plans")
@ApiBearerAuth("bearer")
@UseGuards(...guards)
@Controller("service-plans")
export class ServicePlansController {
  constructor(private readonly service: CatalogsService) {}

  @Post()
  @Permissions("plans.create")
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateServicePlanDto,
  ) {
    return this.service.createPlan(tenant.id, user.id, input);
  }

  @Get()
  @Permissions("plans.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: PlanQueryDto,
  ) {
    return this.service.listPlans(tenant.id, query);
  }

  @Get(":id")
  @Permissions("plans.read")
  find(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findPlan(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("plans.update")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateServicePlanDto,
  ) {
    return this.service.updatePlan(tenant.id, user.id, id, input);
  }

  @Post(":id/activate")
  @Permissions("plans.update")
  activate(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.activatePlan(tenant.id, user.id, id);
  }

  @Post(":id/deactivate")
  @Permissions("plans.update")
  deactivate(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivatePlan(tenant.id, user.id, id);
  }

  @Post(":id/archive")
  @Permissions("plans.update")
  archive(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.archivePlan(tenant.id, user.id, id);
  }
}

@ApiTags("student-contracts")
@ApiBearerAuth("bearer")
@UseGuards(...guards)
@Controller()
export class ContractsController {
  constructor(private readonly service: CatalogsService) {}

  @Post("students/:studentId/contracts")
  @Permissions("contracts.create")
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("studentId", ParseUUIDPipe) studentId: string,
    @Body() input: CreateContractDto,
  ) {
    return this.service.createContract(tenant.id, user.id, studentId, input);
  }

  @Get("students/:studentId/contracts")
  @Permissions("contracts.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("studentId", ParseUUIDPipe) studentId: string,
    @Query() query: FinancialPageQueryDto,
  ) {
    return this.service.listStudentContracts(tenant.id, studentId, query);
  }

  @Get("contracts/:id")
  @Permissions("contracts.read")
  find(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findContract(tenant.id, id);
  }

  @Patch("contracts/:id")
  @Permissions("contracts.update")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateContractDto,
  ) {
    return this.service.updateContract(tenant.id, user.id, id, input);
  }

  @Post("contracts/:id/activate")
  @Permissions("contracts.activate")
  activate(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.activateContract(tenant.id, user.id, id);
  }

  @Post("contracts/:id/complete")
  @Permissions("contracts.complete")
  complete(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.completeContract(tenant.id, user.id, id);
  }

  @Post("contracts/:id/cancel")
  @Permissions("contracts.cancel")
  cancel(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.cancelContract(tenant.id, user.id, id, input.reason);
  }

  @Post("contracts/:id/adjustments")
  @Permissions("contracts.update")
  adjustment(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ContractAdjustmentDto,
  ) {
    return this.service.addAdjustment(tenant.id, user.id, id, input);
  }
}

@ApiTags("receivables")
@ApiBearerAuth("bearer")
@UseGuards(...guards)
@Controller()
export class ReceivablesController {
  constructor(private readonly service: ReceivablesPaymentsService) {}

  @Get("receivables")
  @Permissions("receivables.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: ReceivableQueryDto,
  ) {
    return this.service.listReceivables(tenant.id, query);
  }

  @Get("receivables/:id")
  @Permissions("receivables.read")
  find(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findReceivable(tenant.id, id);
  }

  @Post("contracts/:id/installments")
  @Permissions("receivables.manage")
  generate(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: GenerateInstallmentsDto,
  ) {
    return this.service.generateInstallments(tenant.id, user.id, id, input);
  }

  @Post("receivables/:id/discount")
  @Permissions("receivables.discount")
  discount(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: AmountReasonDto,
  ) {
    return this.service.discount(tenant.id, user.id, id, input);
  }

  @Post("receivables/:id/interest")
  @Permissions("receivables.manage")
  interest(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: AmountReasonDto,
  ) {
    return this.service.interest(tenant.id, user.id, id, input);
  }

  @Post("receivables/:id/fine")
  @Permissions("receivables.manage")
  fine(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: AmountReasonDto,
  ) {
    return this.service.fine(tenant.id, user.id, id, input);
  }

  @Post("receivables/:id/adjustment")
  @Permissions("receivables.manage")
  adjustment(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: AmountReasonDto,
  ) {
    return this.service.adjustment(tenant.id, user.id, id, input);
  }

  @Post("receivables/:id/cancel")
  @Permissions("receivables.manage")
  cancel(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.cancelReceivable(tenant.id, user.id, id, input.reason);
  }
}

@ApiTags("payments")
@ApiBearerAuth("bearer")
@UseGuards(...guards)
@Controller("payments")
export class PaymentsController {
  constructor(private readonly service: ReceivablesPaymentsService) {}

  @Post()
  @Permissions("payments.create")
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreatePaymentDto,
  ) {
    return this.service.createPayment(tenant.id, user.id, input);
  }

  @Get()
  @Permissions("payments.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: PaymentQueryDto,
  ) {
    return this.service.listPayments(tenant.id, query);
  }

  @Get(":id")
  @Permissions("payments.read")
  find(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findPayment(tenant.id, id);
  }

  @Post(":id/confirm")
  @Permissions("payments.confirm")
  confirm(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.confirmPayment(tenant.id, user.id, id);
  }

  @Post(":id/cancel")
  @Permissions("payments.cancel")
  cancel(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.cancelPayment(tenant.id, user.id, id, input.reason);
  }

  @Post(":id/refunds")
  @Permissions("payments.refund")
  refund(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: AmountReasonDto,
  ) {
    return this.service.refundPayment(tenant.id, user.id, id, input);
  }
}

@ApiTags("cash-registers")
@ApiBearerAuth("bearer")
@UseGuards(...guards)
@Controller("cash-registers")
export class CashRegistersController {
  constructor(private readonly service: CashExpensesService) {}

  @Post("open")
  @Permissions("cash_registers.open")
  open(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: OpenCashRegisterDto,
  ) {
    return this.service.openCash(tenant.id, user.id, input);
  }

  @Get("current")
  @Permissions("cash_registers.read")
  current(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query("unitId") unitId?: string,
  ) {
    return this.service.currentCash(tenant.id, user.id, unitId);
  }

  @Get()
  @Permissions("cash_registers.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: CashRegisterQueryDto,
  ) {
    return this.service.listCash(tenant.id, query);
  }

  @Get(":id")
  @Permissions("cash_registers.read")
  find(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findCash(tenant.id, id);
  }

  @Post(":id/supply")
  @Permissions("cash_registers.manage")
  supply(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CashMovementDto,
  ) {
    return this.service.supply(tenant.id, user.id, id, input);
  }

  @Post(":id/withdrawal")
  @Permissions("cash_registers.manage")
  withdrawal(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CashMovementDto,
  ) {
    return this.service.withdrawal(tenant.id, user.id, id, input);
  }

  @Post(":id/adjustment")
  @Permissions("cash_registers.manage")
  adjustment(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CashMovementDto,
  ) {
    return this.service.adjustment(tenant.id, user.id, id, input);
  }

  @Post(":id/close")
  @Permissions("cash_registers.close")
  close(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CloseCashRegisterDto,
  ) {
    return this.service.closeCash(tenant.id, user.id, id, input);
  }
}

@ApiTags("expenses")
@ApiBearerAuth("bearer")
@UseGuards(...guards)
@Controller()
export class ExpensesController {
  constructor(private readonly service: CashExpensesService) {}

  @Post("expense-categories")
  @Permissions("expenses.create")
  createCategory(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateExpenseCategoryDto,
  ) {
    return this.service.createExpenseCategory(tenant.id, user.id, input);
  }

  @Get("expense-categories")
  @Permissions("expenses.read")
  categories(@CurrentTenant() tenant: CurrentTenantContext) {
    return this.service.listExpenseCategories(tenant.id);
  }

  @Patch("expense-categories/:id")
  @Permissions("expenses.update")
  updateCategory(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateExpenseCategoryDto,
  ) {
    return this.service.updateExpenseCategory(tenant.id, user.id, id, input);
  }

  @Post("expenses")
  @Permissions("expenses.create")
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateExpenseDto,
  ) {
    return this.service.createExpense(tenant.id, user.id, input);
  }

  @Get("expenses")
  @Permissions("expenses.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.service.listExpenses(tenant.id, query);
  }

  @Get("expenses/:id")
  @Permissions("expenses.read")
  find(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findExpense(tenant.id, id);
  }

  @Patch("expenses/:id")
  @Permissions("expenses.update")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateExpenseDto,
  ) {
    return this.service.updateExpense(tenant.id, user.id, id, input);
  }

  @Post("expenses/:id/pay")
  @Permissions("expenses.pay")
  pay(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: PayExpenseDto,
  ) {
    return this.service.payExpense(tenant.id, user.id, id, input);
  }

  @Post("expenses/:id/cancel")
  @Permissions("expenses.cancel")
  cancel(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.service.cancelExpense(tenant.id, user.id, id, input.reason);
  }
}

@ApiTags("financial-reports")
@ApiBearerAuth("bearer")
@UseGuards(...guards)
@Controller("financial")
export class FinancialReportsController {
  constructor(
    private readonly reports: FinancialReportsService,
    private readonly eligibility: FinancialEligibilityService,
  ) {}

  @Get("dashboard")
  @Permissions("financial.dashboard.read")
  dashboard(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.reports.dashboard(tenant.id, query);
  }

  @Get("settings")
  @Permissions("financial.dashboard.read")
  settings(@CurrentTenant() tenant: CurrentTenantContext) {
    return this.reports.settings(tenant.id);
  }

  @Patch("settings")
  @Permissions("tenant:manage")
  updateSettings(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Body() input: UpdateFinancialSettingsDto,
  ) {
    return this.reports.updateSettings(tenant.id, input);
  }

  @Get("eligibility/:studentId")
  @Permissions("financial.dashboard.read")
  eligibilityForStudent(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("studentId", ParseUUIDPipe) studentId: string,
  ) {
    return this.eligibility.canScheduleLesson(tenant.id, studentId);
  }

  @Get("reports/receivables")
  @Permissions("financial_reports.read")
  receivables(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.reports.receivables(tenant.id, query);
  }

  @Get("reports/overdue")
  @Permissions("financial_reports.read")
  overdue(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.reports.overdue(tenant.id, query);
  }

  @Get("reports/payments")
  @Permissions("financial_reports.read")
  payments(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.reports.payments(tenant.id, query);
  }

  @Get("reports/cash-flow")
  @Permissions("financial_reports.read")
  cashFlow(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.reports.cashFlow(tenant.id, query);
  }

  @Get("reports/expenses")
  @Permissions("financial_reports.read")
  expenses(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.reports.expenses(tenant.id, query);
  }

  @Get("reports/revenue-by-service")
  @Permissions("financial_reports.read")
  revenueByService(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.reports.revenueByService(tenant.id, query);
  }

  @Get("reports/revenue-by-unit")
  @Permissions("financial_reports.read")
  revenueByUnit(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: FinancialReportQueryDto,
  ) {
    return this.reports.revenueByUnit(tenant.id, query);
  }
}
