import {
  CashMovementType,
  ContractAdjustmentType,
  ContractItemSourceType,
  ExpenseStatus,
  FinancialServiceCategory,
  PaymentMethod,
  PaymentStatus,
  ReceivableStatus,
  ServicePlanStatus,
  StudentContractStatus,
} from "@prumo/database";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class FinancialPageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CreateServiceDto {
  @ApiProperty()
  @IsString()
  @Length(1, 50)
  code!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: FinancialServiceCategory })
  @IsEnum(FinancialServiceCategory)
  category!: FinancialServiceCategory;

  @ApiProperty()
  @IsInt()
  @Min(0)
  defaultPriceCents!: number;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

export class ActiveDto {
  @IsBoolean()
  active!: boolean;
}

export class ServiceQueryDto extends FinancialPageQueryDto {
  @IsOptional()
  @IsEnum(FinancialServiceCategory)
  category?: FinancialServiceCategory;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value);
    return normalized === "true"
      ? true
      : normalized === "false"
        ? false
        : normalized;
  })
  @IsBoolean()
  active?: boolean;
}

export class PlanItemDto {
  @IsUUID()
  serviceId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountCents = 0;
}

export class CreateServicePlanDto {
  @IsString()
  @Length(2, 150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlanItemDto)
  items: PlanItemDto[] = [];
}

export class UpdateServicePlanDto extends PartialType(CreateServicePlanDto) {}

export class PlanQueryDto extends FinancialPageQueryDto {
  @IsOptional()
  @IsEnum(ServicePlanStatus)
  status?: ServicePlanStatus;
}

export class ContractItemDto {
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsString()
  @Length(2, 500)
  description!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsInt()
  @Min(0)
  unitPriceCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountCents = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  surchargeCents = 0;

  @IsOptional()
  @IsEnum(ContractItemSourceType)
  sourceType: ContractItemSourceType = ContractItemSourceType.MANUAL;

  @IsOptional()
  @IsUUID()
  sourceId?: string;
}

export class CreateContractDto {
  @IsUUID()
  unitId!: string;

  @IsOptional()
  @IsUUID()
  processId?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsString()
  @Length(1, 100)
  contractNumber!: string;

  @IsOptional()
  @IsDateString()
  signedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountCents = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  surchargeCents = 0;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ContractItemDto)
  items: ContractItemDto[] = [];
}

export class UpdateContractDto extends PartialType(CreateContractDto) {}

export class ReasonDto {
  @IsString()
  @Length(2, 1000)
  reason!: string;
}

export class ContractAdjustmentDto extends ReasonDto {
  @IsEnum(ContractAdjustmentType)
  type!: ContractAdjustmentType;

  @IsInt()
  @Min(1)
  amountCents!: number;
}

export class InstallmentDto {
  @IsDateString()
  dueDate!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;
}

export class GenerateInstallmentsDto {
  @IsInt()
  @Min(1)
  @Max(120)
  quantity!: number;

  @IsDateString()
  firstDueDate!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  downPaymentCents = 0;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => InstallmentDto)
  customInstallments?: InstallmentDto[];
}

export class ReceivableQueryDto extends FinancialPageQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsEnum(ReceivableStatus)
  status?: ReceivableStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AmountReasonDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @Length(2, 1000)
  reason!: string;
}

export class PaymentAllocationDto {
  @IsUUID()
  installmentId!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;
}

export class CreatePaymentDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsDateString()
  receivedAt!: string;

  @IsOptional()
  @IsUUID()
  cashRegisterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}

export class PaymentQueryDto extends FinancialPageQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class OpenCashRegisterDto {
  @IsUUID()
  unitId!: string;

  @IsInt()
  @Min(0)
  openingBalanceCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CashMovementDto extends AmountReasonDto {
  @IsOptional()
  @IsEnum(CashMovementType)
  type?: CashMovementType;
}

export class CloseCashRegisterDto {
  @IsInt()
  @Min(0)
  countedBalanceCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CashRegisterQueryDto extends FinancialPageQueryDto {
  @IsOptional()
  @IsUUID()
  unitId?: string;
}

export class CreateExpenseCategoryDto {
  @IsString()
  @Length(2, 150)
  name!: string;
}

export class UpdateExpenseCategoryDto extends PartialType(
  CreateExpenseCategoryDto,
) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateExpenseDto {
  @IsUUID()
  unitId!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @IsString()
  @Length(2, 500)
  description!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsDateString()
  dueDate!: string;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class PayExpenseDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsUUID()
  cashRegisterId?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class ExpenseQueryDto extends FinancialPageQueryDto {
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class FinancialReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class UpdateFinancialSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoChargeExamRetest?: boolean;

  @IsOptional()
  @IsBoolean()
  autoChargeExtraLesson?: boolean;

  @IsOptional()
  @IsBoolean()
  blockSchedulingWithDebt?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  debtToleranceCents?: number;

  @IsOptional()
  @IsBoolean()
  requireOpenCashRegisterForCashPayment?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultFinePercentageBasisPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultMonthlyInterestBasisPoints?: number;
}

export const CONTRACT_OPERATIONAL_STATUSES = [
  StudentContractStatus.ACTIVE,
  StudentContractStatus.DEFAULTED,
];
