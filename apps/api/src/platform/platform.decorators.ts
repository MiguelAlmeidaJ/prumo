import type {
  PlatformPermission,
  PlatformRole,
} from "@prumo/contracts";
import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common";
import type {
  AuthenticatedRequest,
  AuthenticatedPrincipal,
  CurrentSupportSessionContext,
} from "../auth/auth.types";

export const PLATFORM_ROLES_KEY = "platformRoles";
export const PLATFORM_PERMISSIONS_KEY = "platformPermissions";

export const PlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);

export const PlatformPermissions = (...permissions: PlatformPermission[]) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);

export const CurrentPlatformUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user as AuthenticatedPrincipal;
  },
);

export const CurrentSupportSession = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): CurrentSupportSessionContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.supportSession as CurrentSupportSessionContext;
  },
);
