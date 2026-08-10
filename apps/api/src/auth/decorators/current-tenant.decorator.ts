import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type {
  AuthenticatedRequest,
  CurrentTenantContext,
} from "../auth.types";

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentTenantContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.tenant) {
      throw new Error("CurrentTenant requer o TenantGuard.");
    }

    return request.tenant;
  },
);
