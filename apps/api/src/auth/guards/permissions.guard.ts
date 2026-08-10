import type { Permission } from "@prumo/contracts";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "../auth.types";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const granted = request.user?.permissions;

    if (!granted) {
      throw new UnauthorizedException("Autenticação necessária.");
    }

    const allowed =
      granted.includes("*") ||
      required.every((permission) => granted.includes(permission));

    if (!allowed) {
      throw new ForbiddenException("Permissão insuficiente.");
    }

    return true;
  }
}
