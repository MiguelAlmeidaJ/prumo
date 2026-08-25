import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import {
  BillingCycle,
  PlatformPlanStatus,
  PlatformRole,
  SupportSessionStatus,
  TenantStatus,
  TenantSubscriptionStatus,
} from "@prumo/database";

export class PlatformPaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class TenantListQueryDto extends PlatformPaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsString()
  planCode?: string;

  @IsOptional()
  @IsString()
  createdFrom?: string;

  @IsOptional()
  @IsString()
  createdTo?: string;

  @IsOptional()
  @IsString()
  trialFrom?: string;

  @IsOptional()
  @IsString()
  trialTo?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  subscriptionExpired?: boolean;
}

export class OwnerProvisionDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  password?: string;
}

export class CreateTenantDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsString()
  @Length(2, 80)
  slug!: string;

  @IsOptional()
  @IsString()
  @Length(3, 32)
  document?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsString()
  planCode?: string;

  @IsOptional()
  @IsString()
  trialEndsAt?: string;

  @IsOptional()
  @IsString()
  provisioningKey?: string;

  @IsOptional()
  @Type(() => OwnerProvisionDto)
  owner?: OwnerProvisionDto;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(3, 32)
  document?: string;

  @IsOptional()
  @IsString()
  planCode?: string;
}

export class CriticalActionDto {
  @IsString()
  @IsNotEmpty()
  @Length(5, 500)
  reason!: string;

  @IsString()
  @MinLength(8)
  currentPassword!: string;
}

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @Length(5, 500)
  reason!: string;
}

export class ExtendTrialDto extends CriticalActionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}

export class UserListQueryDto extends PlatformPaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PlatformRole)
  platformRole?: PlatformRole;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class ChangePlatformRoleDto extends CriticalActionDto {
  @IsEnum(PlatformRole)
  role!: PlatformRole;
}

export class SupportSessionQueryDto extends PlatformPaginationDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsEnum(SupportSessionStatus)
  status?: SupportSessionStatus;
}

export class StartSupportSessionDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @Length(5, 500)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  ticketReference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(120)
  durationMinutes?: number;
}

export class EndSupportSessionDto {
  @IsOptional()
  @IsString()
  @Length(5, 500)
  reason?: string;
}

export class PlanListQueryDto extends PlatformPaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PlatformPlanStatus)
  status?: PlatformPlanStatus;
}

export class CreatePlatformPlanDto {
  @IsString()
  @Length(2, 40)
  code!: string;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptional()
  @IsEnum(PlatformPlanStatus)
  status?: PlatformPlanStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsEnum(BillingCycle)
  defaultBillingCycle?: BillingCycle;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyPriceCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  annualPriceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStudents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxInstructors?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxVehicles?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStorageBytes?: number;

  @IsObject()
  features!: Record<string, boolean>;
}

export class UpdatePlatformPlanDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptional()
  @IsEnum(PlatformPlanStatus)
  status?: PlatformPlanStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsEnum(BillingCycle)
  defaultBillingCycle?: BillingCycle;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyPriceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  annualPriceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsers?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStudents?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUnits?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxInstructors?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxVehicles?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStorageBytes?: number | null;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;
}

export class SubscriptionListQueryDto extends PlatformPaginationDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsEnum(TenantSubscriptionStatus)
  status?: TenantSubscriptionStatus;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;
}

export class CreateSubscriptionDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  planId!: string;

  @IsOptional()
  @IsEnum(TenantSubscriptionStatus)
  status?: TenantSubscriptionStatus;

  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  contractedPriceCents!: number;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;

  @IsOptional()
  @IsDateString()
  currentPeriodStartsAt?: string;

  @IsOptional()
  @IsDateString()
  currentPeriodEndsAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  contractNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsEnum(TenantSubscriptionStatus)
  status?: TenantSubscriptionStatus;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  contractedPriceCents?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsDateString()
  currentPeriodStartsAt?: string;

  @IsOptional()
  @IsDateString()
  currentPeriodEndsAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  contractNumber?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string | null;
}

export class SubscriptionActionDto {
  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}

export class AuditQueryDto extends PlatformPaginationDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  platformUserId?: string;

  @IsOptional()
  @IsString()
  action?: string;
}

export class UpdateSettingsDto {
  @ArrayMaxSize(30)
  settings!: Array<{
    key: string;
    value: unknown;
    description?: string;
  }>;
}

export class EntitlementQueryDto {
  @IsUUID()
  tenantId!: string;

  @ValidateIf((value: EntitlementQueryDto) => Boolean(value.feature))
  @IsString()
  feature?: string;
}
