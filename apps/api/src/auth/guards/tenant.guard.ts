import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { TenantStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { getPermissionsForRole } from "../auth.permissions";
import type { AuthenticatedRequest } from "../auth.types";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.user;

    if (
      !principal ||
      principal.scope !== "tenant" ||
      !principal.membershipId ||
      !principal.tenantId ||
      !principal.role
    ) {
      throw new UnauthorizedException("Autenticação necessária.");
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: principal.membershipId,
        userId: principal.id,
        tenantId: principal.tenantId,
        active: true,
        tenant: {
          status: {
            in: [TenantStatus.TRIAL, TenantStatus.ACTIVE],
          },
        },
      },
      select: {
        id: true,
        role: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException("Membership ou tenant indisponível.");
    }

    if (
      membership.tenant.status !== TenantStatus.TRIAL &&
      membership.tenant.status !== TenantStatus.ACTIVE
    ) {
      throw new ForbiddenException("Tenant indisponível.");
    }

    const permissions = getPermissionsForRole(membership.role);
    request.user = {
      ...principal,
      scope: "tenant",
      tenantId: membership.tenant.id,
      membershipId: membership.id,
      role: membership.role,
      permissions,
    };
    request.tenant = {
      id: membership.tenant.id,
      name: membership.tenant.name,
      slug: membership.tenant.slug,
      status: membership.tenant.status,
      membershipId: membership.id,
      role: membership.role,
      permissions,
    };

    return true;
  }
}
