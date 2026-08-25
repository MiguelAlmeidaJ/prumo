import type {
  PlatformPermission,
  PlatformRole,
} from "@prumo/contracts";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  PlatformRole as PrismaPlatformRole,
  SupportSessionStatus,
} from "@prumo/database";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import {
  PLATFORM_PERMISSIONS_KEY,
  PLATFORM_ROLES_KEY,
} from "./platform.decorators";

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles =
      this.reflector.getAllAndOverride<PlatformRole[]>(
        PLATFORM_ROLES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new UnauthorizedException();
    if (user.scope !== "platform") {
      throw new ForbiddenException(
        "Selecione o console para iniciar uma sessão global.",
      );
    }
    if (user.platformRole === PrismaPlatformRole.USER) {
      throw new ForbiddenException("Acesso exclusivo da plataforma.");
    }
    if (roles.length > 0 && !roles.includes(user.platformRole)) {
      throw new ForbiddenException("Papel global insuficiente.");
    }
    return true;
  }
}

@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions =
      this.reflector.getAllAndOverride<PlatformPermission[]>(
        PLATFORM_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new UnauthorizedException();
    if (
      permissions.some(
        (permission) => !user.platformPermissions.includes(permission),
      )
    ) {
      throw new ForbiddenException("Capacidade global insuficiente.");
    }
    return true;
  }
}

@Injectable()
export class SupportSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<
        AuthenticatedRequest & {
          headers: Record<string, string | string[] | undefined>;
          params: Record<string, string | undefined>;
        }
      >();
    const sessionId = request.headers["x-support-session-id"];
    if (typeof sessionId !== "string") {
      throw new ForbiddenException("Sessão de suporte obrigatória.");
    }
    const session = await this.prisma.supportSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        tenantId: true,
        platformUserId: true,
        reason: true,
        ticketReference: true,
        status: true,
        expiresAt: true,
      },
    });
    if (
      !session ||
      !request.user ||
      session.platformUserId !== request.user.id
    ) {
      throw new ForbiddenException("Sessão de suporte inválida.");
    }
    if (
      session.status !== SupportSessionStatus.ACTIVE ||
      session.expiresAt <= new Date()
    ) {
      if (
        session.status === SupportSessionStatus.ACTIVE &&
        session.expiresAt <= new Date()
      ) {
        await this.prisma.supportSession.updateMany({
          where: {
            id: session.id,
            status: SupportSessionStatus.ACTIVE,
          },
          data: { status: SupportSessionStatus.EXPIRED },
        });
      }
      throw new ForbiddenException("Sessão de suporte expirada ou encerrada.");
    }
    const routeTenantId =
      request.params.tenantId ?? request.params.id;
    if (routeTenantId && routeTenantId !== session.tenantId) {
      throw new ForbiddenException(
        "Sessão de suporte pertence a outro tenant.",
      );
    }
    request.supportSession = {
      id: session.id,
      tenantId: session.tenantId,
      platformUserId: session.platformUserId,
      reason: session.reason,
      ticketReference: session.ticketReference,
      expiresAt: session.expiresAt,
    };
    return true;
  }
}

@Injectable()
export class PlatformRateLimitGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { startedAt: number; requests: number }
  >();

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { ip?: string }>();
    const now = Date.now();
    const key = request.user?.id ?? request.ip ?? "anonymous";
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= 60_000) {
      this.windows.set(key, { startedAt: now, requests: 1 });
      return true;
    }
    current.requests += 1;
    if (current.requests > 240) {
      throw new ForbiddenException(
        "Limite temporário de requisições da plataforma excedido.",
      );
    }
    return true;
  }
}
