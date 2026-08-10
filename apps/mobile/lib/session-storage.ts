import { Platform } from "react-native";

const REFRESH_TOKEN_KEY = "prumo.auth.refresh-token";
let volatileWebRefreshToken: string | null = null;

export async function readRefreshToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return volatileWebRefreshToken;
    }
    const SecureStore = await import("expo-secure-store");
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveRefreshToken(refreshToken: string): Promise<void> {
  if (Platform.OS === "web") {
    volatileWebRefreshToken = refreshToken;
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function removeRefreshToken(): Promise<void> {
  if (Platform.OS === "web") {
    volatileWebRefreshToken = null;
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
