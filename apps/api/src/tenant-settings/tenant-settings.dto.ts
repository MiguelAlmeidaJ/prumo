import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator";

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 64)
  timezone?: string;

  @IsOptional()
  @Matches(/^[a-z]{2}-[A-Z]{2}$/)
  locale?: string;

  @IsOptional()
  @IsBoolean()
  supportAccessEnabled?: boolean;
}
