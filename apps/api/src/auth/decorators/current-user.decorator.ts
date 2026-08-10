import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from "../auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new Error("CurrentUser requer autenticação.");
    }

    return request.user as AuthenticatedUser;
  },
);
