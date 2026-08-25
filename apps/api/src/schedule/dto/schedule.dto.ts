import {
  AttendanceStatus,
  ExamResult,
  ExamType,
  LessonStatus,
  ScheduleResourceType,
  Weekday,
} from "@prumo/database";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { digits } from "../../common/registration.utils";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class PageQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  active?: boolean;
}

export class ActiveStatusDto {
  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}

export class CreateSchoolUnitDto {
  @ApiProperty()
  @IsString()
  @Length(2, 150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => digits(value))
  @IsString()
  @MaxLength(20)
  document?: string;

  @ApiProperty()
  @IsString()
  @Length(8, 30)
  phone!: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(5, 300)
  address!: string;

  @ApiProperty({ example: "07:00" })
  @Matches(TIME_PATTERN)
  openingTime!: string;

  @ApiProperty({ example: "22:00" })
  @Matches(TIME_PATTERN)
  closingTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSchoolUnitDto extends PartialType(CreateSchoolUnitDto) {}

export class ClassroomQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  unitId?: string;
}

export class CreateClassroomDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  unitId!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateClassroomDto extends PartialType(CreateClassroomDto) {}

export class AvailabilityQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @ApiPropertyOptional({ enum: Weekday })
  @IsOptional()
  @IsEnum(Weekday)
  weekday?: Weekday;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  active?: boolean;
}

export class CreateInstructorAvailabilityDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  instructorId!: string;

  @ApiProperty({ enum: Weekday })
  @IsEnum(Weekday)
  weekday!: Weekday;

  @ApiProperty({ example: "08:00" })
  @Matches(TIME_PATTERN)
  startsAt!: string;

  @ApiProperty({ example: "12:00" })
  @Matches(TIME_PATTERN)
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateInstructorAvailabilityDto extends PartialType(
  CreateInstructorAvailabilityDto,
) {}

export class ScheduleBlockQueryDto {
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ScheduleResourceType })
  @IsOptional()
  @IsEnum(ScheduleResourceType)
  resourceType?: ScheduleResourceType;
}

export class CreateScheduleBlockDto {
  @ApiProperty({ enum: ScheduleResourceType })
  @IsEnum(ScheduleResourceType)
  resourceType!: ScheduleResourceType;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  endsAt!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 500)
  reason!: string;
}

export class UpdateScheduleBlockDto extends PartialType(
  CreateScheduleBlockDto,
) {}

export class CreatePracticalLessonDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  unitId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  instructorId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  vehicleId!: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  processId?: string;
}

export class UpdatePracticalLessonDto extends PartialType(
  CreatePracticalLessonDto,
) {}

export class ReschedulePracticalLessonDto {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CancellationDto {
  @ApiProperty()
  @IsString()
  @Length(2, 500)
  reason!: string;
}

export class LessonQueryDto {
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ enum: LessonStatus })
  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;
}

export class CreateTheoreticalClassDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  unitId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  classroomId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  instructorId!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 150)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  endsAt!: string;

  @ApiProperty({ minimum: 1, maximum: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity!: number;

  @ApiPropertyOptional({ type: [String], format: "uuid" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("4", { each: true })
  studentIds?: string[];
}

export class UpdateTheoreticalClassDto extends PartialType(
  CreateTheoreticalClassDto,
) {}

export class AddTheoreticalStudentDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  processId?: string;
}

export class AttendanceDto {
  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  attendanceStatus!: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ScheduleQueryDto {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  from!: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    enum: [
      "PRACTICAL_LESSON",
      "THEORETICAL_CLASS",
      "SCHEDULE_BLOCK",
      "EXAM",
    ],
  })
  @IsOptional()
  @IsIn([
    "PRACTICAL_LESSON",
    "THEORETICAL_CLASS",
    "SCHEDULE_BLOCK",
    "EXAM",
  ])
  type?:
    | "PRACTICAL_LESSON"
    | "THEORETICAL_CLASS"
    | "SCHEDULE_BLOCK"
    | "EXAM";

  @ApiPropertyOptional({ enum: LessonStatus })
  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;

  @ApiPropertyOptional({ enum: ExamType })
  @IsOptional()
  @IsEnum(ExamType)
  examType?: ExamType;

  @ApiPropertyOptional({ enum: ExamResult })
  @IsOptional()
  @IsEnum(ExamResult)
  result?: ExamResult;
}

export class ScheduleAvailabilityQueryDto {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  from!: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  to!: string;

  @ApiProperty({ minimum: 15, maximum: 480 })
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  unitId!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  classroomId?: string;
}
