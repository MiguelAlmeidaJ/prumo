import NetInfo from "@react-native-community/netinfo";
import {
  focusManager,
  onlineManager,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useEffect, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { queryClient } from "@/lib/query-client";

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      onlineManager.setOnline(
        Boolean(state.isConnected && state.isInternetReachable !== false),
      );
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });
    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
