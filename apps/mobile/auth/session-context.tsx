import { createContext, useContext, type PropsWithChildren } from "react";
import type { AuthResponse } from "@prumo/contracts";
import { useAuth } from "./auth-context";

const SessionContext = createContext<AuthResponse | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
