import type {
  ActionMessage,
  AuthResponse,
  ForgotPasswordInput,
  LoginInput,
  MeResponse,
} from "@prumo/contracts";
import { publicRequest } from "./http-client";

export const authApi = {
  login(input: LoginInput) {
    return publicRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  forgotPassword(input: ForgotPasswordInput) {
    return publicRequest<ActionMessage>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  selectTenant(accessToken: string, refreshToken: string, tenantId: string) {
    return publicRequest<AuthResponse>("/auth/select-tenant", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ tenantId, refreshToken }),
    });
  },
  refresh(refreshToken: string) {
    return publicRequest<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },
  logout(refreshToken: string) {
    return publicRequest<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },
  me(accessToken: string) {
    return publicRequest<MeResponse>("/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
};

export { ApiError, publicRequest as apiRequest } from "./http-client";
