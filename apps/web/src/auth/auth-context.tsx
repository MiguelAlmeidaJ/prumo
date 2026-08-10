"use client";

import type { AuthResponse, LoginInput } from "@prumo/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { ApiError, apiRequest, authApi } from "@/lib/auth-api";
import { readSession, removeSession, saveSession } from "@/lib/session-storage";

type AuthStatus = "booting" | "signed-out" | "selecting-tenant" | "signed-in";

interface AuthContextValue {
  status: AuthStatus;
  session: AuthResponse | null;
  error: string | null;
  isSubmitting: boolean;
  login: (input: LoginInput) => Promise<void>;
  selectTenant: (tenantId: string) => Promise<void>;
  selectPlatform: () => Promise<void>;
  requestTenantSelection: () => void;
  cancelTenantSelection: () => void;
  logout: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "E-mail ou senha inválidos.";
    }
    return error.message;
  }

  return "Não foi possível conectar ao Prumo. Verifique se a API está rodando.";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const refreshPromiseRef = useRef<Promise<AuthResponse> | null>(null);

  const persist = useCallback((nextSession: AuthResponse) => {
    saveSession(nextSession);
    setSession(nextSession);
  }, []);

  const signOutLocally = useCallback(() => {
    removeSession();
    setSession(null);
    setStatus("signed-out");
  }, []);

  const refreshSession = useCallback((): Promise<AuthResponse> => {
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = authApi
        .refresh()
        .then((refreshed) => {
          persist(refreshed);
          return refreshed;
        })
        .finally(() => {
          refreshPromiseRef.current = null;
        });
    }
    return refreshPromiseRef.current;
  }, [persist]);

  useEffect(() => {
    let active = true;

    async function restore() {
      const stored = readSession();
      if (!stored) {
        if (active) setStatus("signed-out");
        return;
      }

      try {
        const [me, memberships] = await Promise.all([
          authApi.me(stored.accessToken),
          authApi.memberships(stored.accessToken),
        ]);
        if (!active) return;
        const reconciled: AuthResponse = {
          ...stored,
          user: me.user,
          activeMembership: me.activeMembership,
          memberships,
          platform: me.platform,
        };
        persist(reconciled);
        if (!me.activeMembership && !me.platform) {
          if (memberships.length === 0) {
            signOutLocally();
            return;
          }
          setStatus("selecting-tenant");
          return;
        }
        setStatus("signed-in");
      } catch (restoreError) {
        if (
          !(restoreError instanceof ApiError) ||
          restoreError.status !== 401
        ) {
          if (active) signOutLocally();
          return;
        }

        try {
          await refreshSession();
          if (!active) return;
          setStatus("signed-in");
        } catch {
          if (active) signOutLocally();
        }
      }
    }

    void restore();
    return () => {
      active = false;
    };
  }, [persist, refreshSession, signOutLocally]);

  const login = useCallback(
    async (input: LoginInput) => {
      setIsSubmitting(true);
      setError(null);

      try {
        const response = await authApi.login(input);
        persist(response);
        setStatus(
          response.memberships.length > 1 ||
            Boolean(response.platform && response.memberships.length > 0)
            ? "selecting-tenant"
            : "signed-in",
        );
      } catch (loginError) {
        setError(friendlyMessage(loginError));
      } finally {
        setIsSubmitting(false);
      }
    },
    [persist],
  );

  const selectTenant = useCallback(
    async (tenantId: string) => {
      if (!session) return;

      if (session.activeMembership?.tenant.id === tenantId) {
        setStatus("signed-in");
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const response = await authApi.selectTenant(
          session.accessToken,
          tenantId,
        );
        persist(response);
        setStatus("signed-in");
      } catch (tenantError) {
        setError(friendlyMessage(tenantError));
      } finally {
        setIsSubmitting(false);
      }
    },
    [persist, session],
  );

  const selectPlatform = useCallback(async () => {
    if (!session?.platform) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await authApi.selectPlatform(session.accessToken);
      persist(response);
      setStatus("signed-in");
    } catch (platformError) {
      setError(friendlyMessage(platformError));
    } finally {
      setIsSubmitting(false);
    }
  }, [persist, session]);

  const logout = useCallback(async () => {
    if (!session) {
      signOutLocally();
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.logout();
    } catch {
      // A sessão local deve ser removida mesmo se a API estiver indisponível.
    } finally {
      signOutLocally();
      setIsSubmitting(false);
      setError(null);
    }
  }, [session, signOutLocally]);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      if (!session) {
        throw new ApiError("Autenticação necessária.", 401);
      }

      const execute = (accessToken: string) =>
        apiRequest<T>(path, {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        });

      try {
        return await execute(session.accessToken);
      } catch (requestError) {
        if (
          !(requestError instanceof ApiError) ||
          requestError.status !== 401
        ) {
          throw requestError;
        }

        try {
          const refreshed = await refreshSession();
          return await execute(refreshed.accessToken);
        } catch (refreshError) {
          signOutLocally();
          throw refreshError;
        }
      }
    },
    [refreshSession, session, signOutLocally],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      error,
      isSubmitting,
      login,
      selectTenant,
      selectPlatform,
      requestTenantSelection: () => {
        setError(null);
        setStatus("selecting-tenant");
      },
      cancelTenantSelection: () => {
        setError(null);
        setStatus("signed-in");
      },
      logout,
      request,
      clearError: () => setError(null),
    }),
    [
      error,
      isSubmitting,
      login,
      logout,
      request,
      selectPlatform,
      selectTenant,
      session,
      status,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return context;
}
