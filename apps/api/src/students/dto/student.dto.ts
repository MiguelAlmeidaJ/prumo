import { PartialType } from "@nestjs/swagger";
import {
  RegistryStatus,
  StudentDocumentType,
  StudentProcessStatus,
} from "@prumo/database";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { digits, upper } from "../../common/registration.utils";

export class StudentAddressDto {
  @ApiProperty({ example: "01310-100" })
  @IsString()
  @Length(8, 9)
  zipCode!: string;

  @ApiProperty({ example: "Avenida Paulista" })
  @IsString()
  @Length(2, 150)
  street!: string;

  @ApiProperty({ example: "1000" })
  @IsString()
  @Length(1, 20)
  number!: string;

  @ApiPropertyOptional({ example: "Sala 12" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  complement?: string;

  @ApiProperty({ example: "Bela Vista" })
  @IsString()
  @Length(2, 100)
  neighborhood!: string;

  @ApiProperty({ example: "São Paulo" })
  @IsString()
  @Length(2, 100)
  city!: string;

  @ApiProperty({ example: "SP" })
  @Transform(({ value }: { value: unknown }) => upper(value))
  @Matches(/^[A-Z]{2}$/)
  state!: string;
}

export class StudentDocumentDto {
  @ApiProperty({ enum: StudentDocumentType })
  @IsEnum(StudentDocumentType)
  type!: StudentDocumentType;

  @ApiProperty({ example: "12.345.678-9" })
  @IsString()
  @Length(1, 40)
  number!: string;

  @ApiPropertyOptional({ example: "SSP/SP" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  issuingAuthority?: string;

  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class StudentNoteDto {
  @ApiProperty({ example: "Prefere contato por WhatsApp." })
  @IsString()
  @Length(1, 2000)
  content!: string;
}

export class StudentProcessDto {
  @ApiProperty({ example: "AB" })
  @Transform(({ value }: { value: unknown }) => upper(value))
  @IsString()
  @Length(1, 10)
  category!: string;

  @ApiPropertyOptional({ example: "12345678901" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  renach?: string;

  @ApiPropertyOptional({
    enum: StudentProcessStatus,
    default: StudentProcessStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(StudentProcessStatus)
  status?: StudentProcessStatus;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  openedAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateStudentDto {
  @ApiProperty({ example: "Maria da Silva" })
  @IsString()
  @Length(2, 150)
  name!: string;

  @ApiPropertyOptional({ example: "Maria Silva" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  socialName?: string;

  @ApiProperty({ example: "529.982.247-25" })
  @Transform(({ value }: { value: unknown }) => digits(value))
  @Matches(/^\d{11}$/, { message: "cpf deve conter 11 dígitos" })
  cpf!: string;

  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: "maria@email.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: "(11) 99999-9999" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  secondaryPhone?: string;

  @ApiPropertyOptional({ enum: RegistryStatus })
  @IsOptional()
  @IsEnum(RegistryStatus)
  status?: RegistryStatus;

  @ApiPropertyOptional({ type: StudentAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudentAddressDto)
  address?: StudentAddressDto;

  @ApiPropertyOptional({ type: [StudentDocumentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StudentDocumentDto)
  documents?: StudentDocumentDto[];

  @ApiPropertyOptional({ type: [StudentNoteDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StudentNoteDto)
  notes?: StudentNoteDto[];

  @ApiPropertyOptional({ type: [StudentProcessDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StudentProcessDto)
  processes?: StudentProcessDto[];
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export class StudentResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  cpf!: string;

  @ApiProperty({ enum: RegistryStatus })
  status!: RegistryStatus;
}

export class StudentListResponseDto {
  @ApiProperty({ type: [StudentResponseDto] })
  data!: StudentResponseDto[];

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
