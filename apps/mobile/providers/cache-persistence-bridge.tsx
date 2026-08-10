import { useEffect } from "react";
import { useAuth } from "@/auth/auth-context";
import { persistSafeQueries, queryClient } from "@/lib/query-client";

export function CachePersistenceBridge() {
  const { session } = useAuth();
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tenantId = session.activeMembership.tenant.id;
    const userId = session.user.id;
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void persistSafeQueries(tenantId, userId);
      }, 500);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [session]);
  return null;
}
