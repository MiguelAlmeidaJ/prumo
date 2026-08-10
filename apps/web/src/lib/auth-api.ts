import type {
  ActionMessage,
  AuthResponse,
  CredentialTokenInfo,
  ForgotPasswordInput,
  LoginInput,
  MeResponse,
  MembershipSummary,
  SetCredentialPasswordInput,
} from "@prumo/contracts";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333/api"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;

    throw new ApiError(
      message ?? "Não foi possível concluir a solicitação.",
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function sessionRequest<T>(
  action: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/session/${action}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new ApiError(
      message ?? "Não foi possível concluir a autenticação.",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const authApi = {
  login(input: LoginInput) {
    return sessionRequest<AuthResponse>("login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  selectTenant(accessToken: string, tenantId: string) {
    return sessionRequest<AuthResponse>("select-tenant", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ tenantId }),
    });
  },

  selectPlatform(accessToken: string) {
    return sessionRequest<AuthResponse>("select-platform", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({}),
    });
  },

  refresh() {
    return sessionRequest<AuthResponse>("refresh", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  logout() {
    return sessionRequest<void>("logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  me(accessToken: string) {
    return apiRequest<MeResponse>("/auth/me", {
      headers: bearer(accessToken),
    });
  },

  memberships(accessToken: string) {
    return apiRequest<MembershipSummary[]>("/auth/memberships", {
      headers: bearer(accessToken),
    });
  },

  inspectCredentialToken(token: string) {
    return apiRequest<CredentialTokenInfo>(
      `/auth/credential-token?token=${encodeURIComponent(token)}`,
    );
  },

  setPassword(input: SetCredentialPasswordInput) {
    return apiRequest<ActionMessage>("/auth/set-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  forgotPassword(input: ForgotPasswordInput) {
    return apiRequest<ActionMessage>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
