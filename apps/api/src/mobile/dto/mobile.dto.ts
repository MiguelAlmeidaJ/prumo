import {
  AttendanceStatus,
  LessonChangeRequestType,
  LessonEvaluationValue,
  StudentDocumentType,
  VehicleOccurrenceType,
} from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
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

export class MobileRangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}

export class LessonChangeRequestDto {
  @IsEnum(LessonChangeRequestType)
  type!: LessonChangeRequestType;

  @IsString()
  @Length(3, 1000)
  reason!: string;

  @IsOptional()
  @IsDateString()
  preferredStartsAt?: string;
}

export class StartLessonMobileDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9_999_999)
  odometerKm!: number;
}

export class CompleteLessonMobileDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9_999_999)
  odometerKm!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  studentNotes?: string;
}

export class LessonEvaluationDto {
  @IsEnum(LessonEvaluationValue)
  control!: LessonEvaluationValue;

  @IsEnum(LessonEvaluationValue)
  attention!: LessonEvaluationValue;

  @IsEnum(LessonEvaluationValue)
  signaling!: LessonEvaluationValue;

  @IsEnum(LessonEvaluationValue)
  parking!: LessonEvaluationValue;

  @IsEnum(LessonEvaluationValue)
  gearShift!: LessonEvaluationValue;

  @IsEnum(LessonEvaluationValue)
  trafficRules!: LessonEvaluationValue;

  @IsEnum(LessonEvaluationValue)
  confidence!: LessonEvaluationValue;

  @IsEnum(LessonEvaluationValue)
  overallRating!: LessonEvaluationValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsBoolean()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === "true",
  )
  visibleToStudent = false;
}

export class AttendanceItemDto {
  @IsUUID()
  studentId!: string;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class BulkAttendanceDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  attendance!: AttendanceItemDto[];
}

export class VehicleOccurrenceDto {
  @IsEnum(VehicleOccurrenceType)
  type!: VehicleOccurrenceType;

  @IsString()
  @Length(3, 2000)
  description!: string;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsUUID()
  lessonId?: string;
}

export class CreateDocumentUploadDto {
  @IsEnum(StudentDocumentType)
  documentType!: StudentDocumentType;

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

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsUUID()
  processRequirementId?: string;
}

export class CompleteDocumentUploadDto {
  @IsBase64()
  contentBase64!: string;
}
