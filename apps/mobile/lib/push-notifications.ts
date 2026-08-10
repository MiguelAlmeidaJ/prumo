import * as Device from "expo-device";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "prumo.push-device-id";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushNotifications(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("prumo", {
      name: "Prumo",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: "#46D4C5",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.status === "granted"
      ? current
      : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const registration = await request<{ id: string }>("/devices/push-token", {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
      deviceName: Device.deviceName ?? undefined,
    }),
  });
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(DEVICE_ID_KEY, registration.id);
  return registration.id;
}

export async function clearPushRegistration(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const SecureStore = await import("expo-secure-store");
  const id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
  return id;
}
