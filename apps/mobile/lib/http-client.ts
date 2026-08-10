import type { AuthResponse } from "@prumo/contracts";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { observability } from "./observability";

const REQUEST_TIMEOUT_MS = 15_000;
const APP_VERSION = Constants.expoConfig?.version ?? "development";

export function apiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  }
  const developmentHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (developmentHost) return `http://${developmentHost}:3333/api`;
  return `http://${Platform.OS === "android" ? "10.0.2.2" : "localhost"}:3333/api`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type AuthBridge = {
  getSession: () => AuthResponse | null;
  refresh: () => Promise<AuthResponse>;
  expired: () => Promise<void> | void;
};

let authBridge: AuthBridge | null = null;
let refreshPromise: Promise<AuthResponse> | null = null;

export function configureHttpAuth(bridge: AuthBridge | null) {
  authBridge = bridge;
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      code?: string;
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new ApiError(
      message ?? "Não foi possível concluir a solicitação.",
      response.status,
      body?.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function raw<T>(
  path: string,
  init: RequestInit,
  accessToken?: string,
  retryNetwork = true,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const method = (init.method ?? "GET").toUpperCase();
  const onAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-App-Version": APP_VERSION,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
    return await parse<T>(response);
  } catch (error) {
    if (
      retryNetwork &&
      method === "GET" &&
      (!(error instanceof ApiError) || error.status >= 500)
    ) {
      return raw<T>(path, init, accessToken, false);
    }
    if (error instanceof ApiError) throw error;
    observability.capture(error, {
      operation: method,
      route: path.replace(/[0-9a-f-]{20,}/gi, ":resource"),
    });
    throw new ApiError(
      error instanceof Error && error.name === "AbortError"
        ? timedOut
          ? "A solicitação excedeu o tempo limite."
          : "Solicitação cancelada."
        : "Sem conexão com o servidor.",
      0,
      timedOut
        ? "REQUEST_TIMEOUT"
        : init.signal?.aborted
          ? "REQUEST_CANCELLED"
          : "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

export function publicRequest<T>(path: string, init: RequestInit = {}) {
  return raw<T>(path, init);
}

export async function mobileRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const bridge = authBridge;
  const session = bridge?.getSession();
  if (!bridge || !session) throw new ApiError("Autenticação necessária.", 401);
  try {
    return await raw<T>(path, init, session.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    try {
      refreshPromise ??= bridge.refresh().finally(() => {
        refreshPromise = null;
      });
      const refreshed = await refreshPromise;
      return await raw<T>(path, init, refreshed.accessToken);
    } catch (refreshError) {
      await bridge.expired();
      throw refreshError;
    }
  }
}

export function idempotencyHeaders(key: string): HeadersInit {
  return { "Idempotency-Key": key };
}
