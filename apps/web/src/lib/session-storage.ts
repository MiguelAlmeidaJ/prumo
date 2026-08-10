import type { AuthResponse } from "@prumo/contracts";

const SESSION_KEY = "prumo.auth.session";

export function readSession(): AuthResponse | null {
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    return value ? (JSON.parse(value) as AuthResponse) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthResponse): void {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function removeSession(): void {
  window.sessionStorage.removeItem(SESSION_KEY);
}
