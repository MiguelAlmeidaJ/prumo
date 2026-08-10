import { createContext, useContext, type PropsWithChildren } from "react";
import type { MembershipSummary } from "@prumo/contracts";
import { useAuth } from "./auth-context";

const TenantContext = createContext<MembershipSummary | null>(null);

export function TenantProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  return <TenantContext.Provider value={session?.activeMembership ?? null}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}
