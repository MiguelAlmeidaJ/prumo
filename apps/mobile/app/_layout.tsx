import { Stack } from "expo-router";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/auth-context";
import { SessionProvider } from "@/auth/session-context";
import { TenantProvider } from "@/auth/tenant-context";
import { PushNotificationBridge } from "@/components/push-notification-bridge";
import { ThemeProvider } from "@/design/theme";
import { AppProviders } from "@/providers/app-providers";
import { ConnectivityProvider } from "@/providers/connectivity-provider";
import { CachePersistenceBridge } from "@/providers/cache-persistence-bridge";

export { ErrorBoundary } from "expo-router";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProviders>
          <AuthProvider>
            <SessionProvider>
              <TenantProvider>
                <ConnectivityProvider>
                  <CachePersistenceBridge />
                  <PushNotificationBridge />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(public)" />
                    <Stack.Screen name="(student)" />
                    <Stack.Screen name="(instructor)" />
                  </Stack>
                </ConnectivityProvider>
              </TenantProvider>
            </SessionProvider>
          </AuthProvider>
        </AppProviders>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
