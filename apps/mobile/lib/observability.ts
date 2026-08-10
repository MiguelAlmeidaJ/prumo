import Constants from "expo-constants";
import { Platform } from "react-native";

type Context = {
  route?: string;
  operation?: string;
  tenantId?: string;
  userId?: string;
  profile?: string;
};

function safe(context: Context) {
  return {
    route: context.route,
    operation: context.operation,
    tenant: context.tenantId?.slice(0, 8),
    user: context.userId?.slice(0, 8),
    profile: context.profile,
    appVersion: Constants.expoConfig?.version ?? "development",
    platform: Platform.OS,
  };
}

export const observability = {
  capture(error: unknown, context: Context = {}) {
    if (__DEV__) {
      console.error(
        "[Prumo]",
        safe(context),
        error instanceof Error ? error.name : typeof error,
      );
    }
  },
  breadcrumb(message: string, context: Context = {}) {
    if (__DEV__) console.info("[Prumo]", message, safe(context));
  },
};
