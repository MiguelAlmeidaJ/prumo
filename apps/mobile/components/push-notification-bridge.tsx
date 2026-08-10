import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect } from "react";

import { useAuth } from "@/auth/auth-context";
import { registerPushNotifications } from "@/lib/push-notifications";
import { safeActionRoute } from "@/lib/deep-links";

function openAction(actionUrl: unknown, role: Parameters<typeof safeActionRoute>[1]) {
  const route = safeActionRoute(
    typeof actionUrl === "string" ? actionUrl : undefined,
    role,
  );
  if (route) router.push(route);
}

export function PushNotificationBridge() {
  const { status, request, session } = useAuth();

  useEffect(() => {
    if (status !== "signed-in") return;
    void registerPushNotifications(request).catch(() => undefined);
  }, [request, status]);

  useEffect(() => {
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse?.notification) {
      openAction(
        lastResponse.notification.request.content.data?.actionUrl,
        session?.activeMembership.role,
      );
    }
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openAction(
          response.notification.request.content.data?.actionUrl,
          session?.activeMembership.role,
        );
      });
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      () => {
        void request<{ count: number }>("/notifications/unread-count")
          .then(({ count }) => Notifications.setBadgeCountAsync(count))
          .catch(() => undefined);
      },
    );
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      openAction(url, session?.activeMembership.role);
    });
    void Linking.getInitialURL().then((url) => {
      if (url) openAction(url, session?.activeMembership.role);
    });
    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
      linkingSubscription.remove();
    };
  }, [request, session?.activeMembership.role]);

  return null;
}
