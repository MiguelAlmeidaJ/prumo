import {
  membershipRoleValues,
  type ChangePasswordInput,
  type CredentialTokenInput,
  type ForgotPasswordInput,
  type InviteTeamMemberInput,
  type MembershipRole,
  type SetCredentialPasswordInput,
  type UpdateTeamMemberInput,
} from "@prumo/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from "class-validator";

export class InviteTeamMemberDto implements InviteTeamMemberInput {
  @ApiProperty({ example: "Maria Almeida" })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ example: "maria@autoescola.com.br" })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: membershipRoleValues })
  @IsIn(membershipRoleValues)
  role!: MembershipRole;

  @ApiPropertyOptional({
    format: "uuid",
    description: "Aluno ou instrutor vinculado quando o papel exigir.",
  })
  @IsOptional()
  @IsUUID()
  profileId?: string;
}

export class UpdateTeamMemberDto implements UpdateTeamMemberInput {
  @ApiPropertyOptional({ enum: membershipRoleValues })
  @IsOptional()
  @IsIn(membershipRoleValues)
  role?: MembershipRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CredentialTokenDto implements CredentialTokenInput {
  @ApiProperty()
  @IsString()
  @Length(32, 512)
  token!: string;
}

export class SetCredentialPasswordDto
  extends CredentialTokenDto
  implements SetCredentialPasswordInput
{
  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class ForgotPasswordDto implements ForgotPasswordInput {
  @ApiProperty({ example: "maria@autoescola.com.br" })
  @IsEmail()
  email!: string;
}

export class ChangePasswordDto implements ChangePasswordInput {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
