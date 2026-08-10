import { PartialType } from "@nestjs/swagger";
import { RegistryStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { upper } from "../../common/registration.utils";

export class CreateVehicleDto {
  @ApiProperty({ example: "ABC1D23" })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string"
      ? value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
      : value,
  )
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/, {
    message: "plate deve ser uma placa brasileira válida",
  })
  plate!: string;

  @ApiPropertyOptional({ example: "Volkswagen" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiProperty({ example: "Polo" })
  @IsString()
  @Length(1, 100)
  model!: string;

  @ApiPropertyOptional({ example: 2025 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ example: "Branco" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @ApiPropertyOptional({ example: "12345678901" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  renavam?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => upper(value))
  @IsString()
  @MaxLength(50)
  chassis?: string;

  @ApiPropertyOptional({ example: "B" })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => upper(value))
  @IsString()
  @MaxLength(20)
  category?: string;

  @ApiPropertyOptional({ enum: RegistryStatus })
  @IsOptional()
  @IsEnum(RegistryStatus)
  status?: RegistryStatus;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

export class VehicleResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ enum: RegistryStatus })
  status!: RegistryStatus;
}

export class VehicleListResponseDto {
  @ApiProperty({ type: [VehicleResponseDto] })
  data!: VehicleResponseDto[];

  @ApiProperty({
    example: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })
  meta!: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
