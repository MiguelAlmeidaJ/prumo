import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBase64,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  ImportConflictPolicy,
  ImportEntityType,
  ImportJobStatus,
} from "@prumo/database";

export class CreateImportJobDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  sourceSystem!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  migrationType!: string;

  @IsDateString()
  cutoverDate!: string;
}

export class ImportJobListQueryDto {
  @IsOptional()
  @IsEnum(ImportJobStatus)
  status?: ImportJobStatus;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export class UploadImportFileDto {
  @IsEnum(ImportEntityType)
  entityType!: ImportEntityType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  mimeType!: string;

  @IsBase64()
  contentBase64!: string;
}

export class ImportColumnMappingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sourceColumn!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  targetField!: string;
}

export class SaveImportMappingDto {
  @IsEnum(ImportConflictPolicy)
  conflictPolicy!: ImportConflictPolicy;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportColumnMappingDto)
  mappings!: ImportColumnMappingDto[];
}

export class RollbackImportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  confirmation!: string;
}
