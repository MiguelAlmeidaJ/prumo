import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useState, type PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/auth/auth-context";
import {
  queuedOperations,
  syncOfflineQueue,
} from "@/offline/offline-queue";

export function ConnectivityProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  const sync = useCallback(async () => {
    if (!session) return;
    await syncOfflineQueue(
      session.activeMembership.tenant.id,
      session.user.id,
    );
    setPending(
      (
        await queuedOperations(
          session.activeMembership.tenant.id,
          session.user.id,
        )
      ).length,
    );
  }, [session]);

  useEffect(() => {
    if (!session) {
      setPending(0);
      return;
    }
    const update = () =>
      void queuedOperations(
        session.activeMembership.tenant.id,
        session.user.id,
      ).then((items) => setPending(items.length));
    update();
    const timer = setInterval(update, 3000);
    return () => clearInterval(timer);
  }, [session]);

  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        const next = Boolean(
          state.isConnected && state.isInternetReachable !== false,
        );
        setOnline(next);
        if (next && session) {
          void sync();
        }
      }),
    [session, sync],
  );

  return (
    <>
      {!online ? (
        <View
          accessibilityRole="alert"
          style={{ backgroundColor: "#9A3412", padding: 8 }}
        >
          <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>
            Você está offline. Ações operacionais serão sincronizadas depois.
          </Text>
        </View>
      ) : null}
      {pending > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void sync()}
          style={{ backgroundColor: "#7C2D12", padding: 8 }}
        >
          <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>
            {pending} ação(ões) aguardando sincronização · toque para tentar
          </Text>
        </Pressable>
      ) : null}
      {children}
    </>
  );
}
