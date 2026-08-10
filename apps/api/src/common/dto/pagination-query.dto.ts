import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { RegistryStatus } from "@prisma/client";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class PaginationQueryDto {
  @ApiPropertyOptional({ description: "Busca textual.", example: "Maria" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: RegistryStatus })
  @IsOptional()
  @IsEnum(RegistryStatus)
  status?: RegistryStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class PaginationMetaDto {
  page!: number;
  pageSize!: number;
  total!: number;
  totalPages!: number;
}
