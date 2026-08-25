import {
  ExamResult,
  ExamType,
  LicenseProcessType,
  ProcessStageStatus,
} from "@prumo/database";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBase64,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateLicenseProcessDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  unitId!: string;

  @ApiProperty({ enum: LicenseProcessType })
  @IsEnum(LicenseProcessType)
  processType!: LicenseProcessType;

  @ApiProperty({ type: [String], example: ["B"] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  categoryCodes!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  protocolNumber?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  openedAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
}

export class UpdateLicenseProcessDto extends PartialType(
  CreateLicenseProcessDto,
) {}

export class ProcessReasonDto {
  @ApiProperty()
  @IsString()
  @Length(2, 1000)
  reason!: string;
}

export class UpdateProcessStageDto {
  @ApiProperty({ enum: ProcessStageStatus })
  @IsEnum(ProcessStageStatus)
  status!: ProcessStageStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  blockedReason?: string;
}

export class LinkProcessDocumentDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentDocumentId!: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class RejectProcessDocumentDto {
  @ApiProperty()
  @IsString()
  @Length(2, 1000)
  reason!: string;
}

export class CreateExamDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  processId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  unitId!: string;

  @ApiProperty({ enum: ExamType })
  @IsEnum(ExamType)
  type!: ExamType;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalProtocol?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CompleteExamDto {
  @ApiProperty({ enum: ExamResult })
  @IsEnum(ExamResult)
  result!: ExamResult;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalProtocol?: string;
}

export class RescheduleExamDto {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 500)
  reason!: string;
}

export class ExamQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ enum: ExamType })
  @IsOptional()
  @IsEnum(ExamType)
  type?: ExamType;

  @ApiPropertyOptional({ enum: ExamResult })
  @IsOptional()
  @IsEnum(ExamResult)
  result?: ExamResult;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UploadProcessDocumentDto {
  @IsString()
  @Length(1, 255)
  fileName!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;

  @IsBase64()
  contentBase64!: string;
}
