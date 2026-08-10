import {
  membershipRoleValues,
  permissionValues,
  platformPermissionValues,
  platformRoleValues,
  type MembershipRole,
  type PlatformRole,
} from "@prumo/contracts";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../database/prisma.service";
import type {
  AccessTokenPayload,
  AuthenticatedPrincipal,
} from "../auth.types";
import { getPlatformPermissionsForRole } from "../platform.permissions";

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<AccessTokenPayload>;
  const tenantScopeIsValid =
    payload.scope === "tenant" &&
    typeof payload.tenantId === "string" &&
    typeof payload.membershipId === "string" &&
    membershipRoleValues.includes(payload.role as MembershipRole);
  const platformScopeIsValid =
    payload.scope === "platform" &&
    platformRoleValues.includes(payload.platformRole as PlatformRole) &&
    payload.platformRole !== "USER" &&
    Array.isArray(payload.platformPermissions) &&
    payload.platformPermissions.every(
      (permission) =>
        typeof permission === "string" &&
        platformPermissionValues.includes(permission),
    );

  return (
    typeof payload.sub === "string" &&
    payload.tokenType === "access" &&
    (tenantScopeIsValid || platformScopeIsValid) &&
    Array.isArray(payload.permissions) &&
    payload.permissions.every(
      (permission) =>
        typeof permission === "string" &&
        permissionValues.includes(permission),
    )
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  async validate(payload: unknown): Promise<AuthenticatedPrincipal> {
    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException("Access token inválido.");
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        mfaEnabled: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Usuário indisponível.");
    }

    return {
      ...user,
      scope: payload.scope,
      tenantId: payload.tenantId,
      membershipId: payload.membershipId,
      role: payload.role,
      permissions: payload.permissions,
      platformRole: user.platformRole,
      platformPermissions: getPlatformPermissionsForRole(user.platformRole),
      mfaEnabled: user.mfaEnabled,
    };
  }
}
