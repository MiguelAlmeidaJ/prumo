import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  CampaignRecipientStatus,
  CommunicationAudienceType,
  CommunicationCampaignStatus,
  DomainEventStatus,
  DomainEventType,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  PushPlatform,
} from "@prumo/database";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class PageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class NotificationQueryDto extends PageDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class PreferenceItemDto {
  @IsEnum(DomainEventType)
  eventType!: DomainEventType;

  @IsBoolean()
  inAppEnabled!: boolean;

  @IsBoolean()
  emailEnabled!: boolean;

  @IsBoolean()
  pushEnabled!: boolean;

  @IsBoolean()
  smsEnabled!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(525_600)
  reminderMinutesBefore?: number | null;
}

export class UpdatePreferencesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences!: PreferenceItemDto[];
}

export class UpdateCommunicationSettingsDto {
  @IsBoolean()
  emailEnabled!: boolean;

  @IsBoolean()
  pushEnabled!: boolean;

  @IsBoolean()
  smsEnabled!: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursStart?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursEnd?: string | null;

  @IsString()
  @MaxLength(100)
  timezone!: string;

  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  language!: string;
}

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  token!: string;

  @IsEnum(PushPlatform)
  platform!: PushPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

export class TemplateQueryDto extends PageDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class CreateTemplateDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,99}$/)
  code!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  active = true;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  allowedVariables!: string[];
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  allowedVariables?: string[];
}

export class DeliveryQueryDto extends PageDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsEnum(NotificationDeliveryStatus)
  status?: NotificationDeliveryStatus;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  provider?: string;
}

export class EventQueryDto extends PageDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(DomainEventType)
  type?: DomainEventType;

  @IsOptional()
  @IsEnum(DomainEventStatus)
  status?: DomainEventStatus;

  @IsOptional()
  @IsString()
  aggregateType?: string;
}

export class TestEmailDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject = "Teste de e-mail do Prumo";
}

export class CreateCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsEnum(CommunicationAudienceType)
  audienceType!: CommunicationAudienceType;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body!: string;

  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, unknown>;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEnum(CommunicationAudienceType)
  audienceType?: CommunicationAudienceType;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body?: string;

  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, unknown>;
}

export class ScheduleCampaignDto {
  @IsDateString()
  scheduledAt!: string;
}

export class CampaignQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: CommunicationCampaignStatus })
  @IsOptional()
  @IsEnum(CommunicationCampaignStatus)
  status?: CommunicationCampaignStatus;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;
}

export class CampaignRecipientQueryDto extends PageDto {
  @IsOptional()
  @IsEnum(CampaignRecipientStatus)
  status?: CampaignRecipientStatus;
}

export class UpdateReminderRuleDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525_600)
  minutesBefore?: number;
}
