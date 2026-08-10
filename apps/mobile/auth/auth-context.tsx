import type {
  AuthResponse,
  LoginInput,
  MembershipSummary,
} from "@prumo/contracts";
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
import { Alert, Platform } from "react-native";
import { authApi } from "@/lib/auth-api";
import {
  ApiError,
  configureHttpAuth,
  mobileRequest,
} from "@/lib/http-client";
import { clearPushRegistration } from "@/lib/push-notifications";
import {
  clearMobileCache,
  persistSafeQueries,
  restoreSafeQueries,
} from "@/lib/query-client";
import {
  readRefreshToken,
  removeRefreshToken,
  saveRefreshToken,
} from "@/lib/session-storage";
import {
  clearOfflineQueue,
  discardOperations,
  hasPendingOperations,
} from "@/offline/offline-queue";

export type AuthStatus =
  | "booting"
  | "signed-out"
  | "selecting-tenant"
  | "signed-in"
  | "session-expired";

interface AuthContextValue {
  status: AuthStatus;
  session: MobileSession | null;
  error: string | null;
  isSubmitting: boolean;
  login: (input: LoginInput) => Promise<void>;
  selectTenant: (tenantId: string) => Promise<void>;
  showTenantSelection: () => void;
  cancelTenantSelection: () => void;
  logout: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  clearError: () => void;
}

export type MobileSession = AuthResponse & {
  activeMembership: MembershipSummary;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "E-mail ou senha inválidos.";
    return error.message;
  }
  return "Não foi possível falar com a API. Verifique a conexão.";
}

function confirmDiscard(): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(
      window.confirm(
        "Há operações ainda não sincronizadas. Descartá-las e trocar de autoescola?",
      ),
    );
  }
  return new Promise((resolve) => {
    Alert.alert(
      "Operações pendentes",
      "Trocar agora descartará ações ainda não sincronizadas.",
      [
        { text: "Continuar aqui", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Descartar e trocar",
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: false },
    );
  });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [session, setSession] = useState<MobileSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sessionRef = useRef<MobileSession | null>(null);

  const persist = useCallback(async (next: AuthResponse) => {
    if (!next.activeMembership) {
      throw new ApiError(
        "Contas globais devem usar o console web do Prumo.",
        403,
      );
    }
    const mobileSession = next as MobileSession;
    sessionRef.current = mobileSession;
    setSession(mobileSession);
    await saveRefreshToken(mobileSession.refreshToken);
    await restoreSafeQueries(
      mobileSession.activeMembership.tenant.id,
      mobileSession.user.id,
    );
    return mobileSession;
  }, []);

  const clearLocal = useCallback(async (expired = false) => {
    sessionRef.current = null;
    setSession(null);
    await Promise.all([
      removeRefreshToken(),
      clearMobileCache(),
      clearOfflineQueue(),
    ]);
    setStatus(expired ? "session-expired" : "signed-out");
  }, []);

  const refresh = useCallback(async () => {
    const refreshToken =
      sessionRef.current?.refreshToken ?? (await readRefreshToken());
    if (!refreshToken) throw new ApiError("Sessão expirada.", 401);
    const next = await authApi.refresh(refreshToken);
    return persist(next);
  }, [persist]);

  useEffect(() => {
    configureHttpAuth({
      getSession: () => sessionRef.current,
      refresh,
      expired: () => clearLocal(true),
    });
    return () => configureHttpAuth(null);
  }, [clearLocal, refresh]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const refreshToken = await readRefreshToken();
      if (!refreshToken) {
        if (active) setStatus("signed-out");
        return;
      }
      try {
        const restored = await authApi.refresh(refreshToken);
        if (!active) return;
        await persist(restored);
        setStatus("signed-in");
      } catch {
        if (active) await clearLocal(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [clearLocal, persist]);

  const login = useCallback(
    async (input: LoginInput) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const response = await authApi.login(input);
        await persist(response);
        setStatus(
          response.memberships.length > 1 ? "selecting-tenant" : "signed-in",
        );
      } catch (cause) {
        setError(friendlyMessage(cause));
      } finally {
        setIsSubmitting(false);
      }
    },
    [persist],
  );

  const selectTenant = useCallback(
    async (tenantId: string) => {
      if (!session) return;
      if (session.activeMembership.tenant.id === tenantId) {
        setStatus("signed-in");
        return;
      }
      const currentTenantId = session.activeMembership.tenant.id;
      if (await hasPendingOperations(currentTenantId, session.user.id)) {
        if (!(await confirmDiscard())) return;
        await discardOperations(currentTenantId, session.user.id);
      }
      setIsSubmitting(true);
      setError(null);
      try {
        await persistSafeQueries(currentTenantId, session.user.id);
        await clearMobileCache();
        const response = await authApi.selectTenant(
          session.accessToken,
          session.refreshToken,
          tenantId,
        );
        await persist(response);
        setStatus("signed-in");
      } catch (cause) {
        setError(friendlyMessage(cause));
      } finally {
        setIsSubmitting(false);
      }
    },
    [persist, session],
  );

  const logout = useCallback(async () => {
    setIsSubmitting(true);
    const current = sessionRef.current;
    try {
      if (current) {
        const deviceId = await clearPushRegistration();
        if (deviceId) {
          await mobileRequest<void>(`/devices/${deviceId}`, {
            method: "DELETE",
          }).catch(() => undefined);
        }
        await authApi.logout(current.refreshToken);
      }
    } catch {
      // O logout local sempre vence, inclusive quando o aparelho está offline.
    } finally {
      await clearLocal();
      setError(null);
      setIsSubmitting(false);
    }
  }, [clearLocal]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      error,
      isSubmitting,
      login,
      selectTenant,
      showTenantSelection: () => {
        setError(null);
        setStatus("selecting-tenant");
      },
      cancelTenantSelection: () => {
        setError(null);
        setStatus("signed-in");
      },
      logout,
      request: mobileRequest,
      clearError: () => setError(null),
    }),
    [error, isSubmitting, login, logout, selectTenant, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}
