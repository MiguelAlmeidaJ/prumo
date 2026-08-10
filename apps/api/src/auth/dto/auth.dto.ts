import {
  membershipRoleValues,
  permissionValues,
  platformPermissionValues,
  platformRoleValues,
  type AuthResponse,
  type MembershipRole,
  type MembershipSummary,
  type MeResponse,
  type Permission,
  type PlatformAccessSummary,
  type PlatformPermission,
  type TenantSummary,
  type UserSummary,
} from "@prumo/contracts";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "admin@prumo.local" })
  email!: string;

  @ApiProperty({ example: "PrumoDev@123", minLength: 8 })
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: "Refresh token JWT recebido na autenticação." })
  refreshToken!: string;
}

export class SelectTenantDto extends RefreshTokenDto {
  @ApiProperty({ format: "uuid" })
  tenantId!: string;
}

export class UserSummaryDto implements UserSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: "email" })
  email!: string;
}

export class TenantSummaryDto implements TenantSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: ["TRIAL", "ACTIVE"] })
  status!: "TRIAL" | "ACTIVE";
}

export class MembershipSummaryDto implements MembershipSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: membershipRoleValues })
  role!: MembershipRole;

  @ApiProperty({ enum: permissionValues, isArray: true })
  permissions!: Permission[];

  @ApiProperty({ type: TenantSummaryDto })
  tenant!: TenantSummaryDto;
}

export class PlatformAccessSummaryDto implements PlatformAccessSummary {
  @ApiProperty({
    enum: platformRoleValues.filter((role) => role !== "USER"),
  })
  role!: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN" | "PLATFORM_OWNER";

  @ApiProperty({ enum: platformPermissionValues, isArray: true })
  permissions!: PlatformPermission[];

  @ApiProperty()
  mfaEnabled!: boolean;
}

export class AuthResponseDto implements AuthResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ description: "Validade do access token em segundos." })
  accessTokenExpiresIn!: number;

  @ApiProperty({ description: "Validade do refresh token em segundos." })
  refreshTokenExpiresIn!: number;

  @ApiProperty({ type: UserSummaryDto })
  user!: UserSummaryDto;

  @ApiProperty({ type: MembershipSummaryDto, nullable: true })
  activeMembership!: MembershipSummaryDto | null;

  @ApiProperty({ type: MembershipSummaryDto, isArray: true })
  memberships!: MembershipSummaryDto[];

  @ApiProperty({ type: () => PlatformAccessSummaryDto, required: false })
  platform?: PlatformAccessSummaryDto;
}

export class MeResponseDto implements MeResponse {
  @ApiProperty({ type: UserSummaryDto })
  user!: UserSummaryDto;

  @ApiProperty({ type: MembershipSummaryDto, nullable: true })
  activeMembership!: MembershipSummaryDto | null;

  @ApiProperty({ type: () => PlatformAccessSummaryDto, required: false })
  platform?: PlatformAccessSummaryDto;
}
