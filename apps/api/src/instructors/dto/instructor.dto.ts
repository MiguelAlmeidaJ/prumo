import { PartialType } from "@nestjs/swagger";
import { RegistryStatus } from "@prumo/database";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { digits, upper } from "../../common/registration.utils";

export class CreateInstructorDto {
  @ApiProperty({ example: "Carlos Oliveira" })
  @IsString()
  @Length(2, 150)
  name!: string;

  @ApiProperty({ example: "529.982.247-25" })
  @Transform(({ value }: { value: unknown }) => digits(value))
  @Matches(/^\d{11}$/, { message: "cpf deve conter 11 dígitos" })
  cpf!: string;

  @ApiPropertyOptional({ example: "carlos@email.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: "(11) 99999-9999" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: "01234567890" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  license?: string;

  @ApiPropertyOptional({ example: "AB" })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => upper(value))
  @IsString()
  @MaxLength(10)
  licenseCategory?: string;

  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @IsDateString()
  licenseExpiresAt?: string;

  @ApiPropertyOptional({ example: "INSTR-1234" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  credentialNumber?: string;

  @ApiPropertyOptional({ enum: RegistryStatus })
  @IsOptional()
  @IsEnum(RegistryStatus)
  status?: RegistryStatus;
}

export class UpdateInstructorDto extends PartialType(CreateInstructorDto) {}

export class InstructorResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  cpf!: string;

  @ApiProperty({ enum: RegistryStatus })
  status!: RegistryStatus;
}

export class InstructorListResponseDto {
  @ApiProperty({ type: [InstructorResponseDto] })
  data!: InstructorResponseDto[];

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
