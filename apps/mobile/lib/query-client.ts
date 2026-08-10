import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  QueryClient,
  type Query,
  type QueryKey,
} from "@tanstack/react-query";

const CACHE_PREFIX = "prumo.query.";
const SAFE_QUERY_SCOPES = new Set([
  "mobile-home",
  "schedule",
  "lessons",
  "lesson",
  "instructor-students",
  "instructor-student",
  "vehicles",
  "vehicle",
]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,
      retry: (count, error) =>
        count < 2 &&
        (!(error instanceof Error) ||
          !("status" in error) ||
          Number((error as { status?: number }).status) >= 500),
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
});

function safeKey(queryKey: QueryKey): boolean {
  return typeof queryKey[0] === "string" && SAFE_QUERY_SCOPES.has(queryKey[0]);
}

function storageKey(tenantId: string, userId: string) {
  return `${CACHE_PREFIX}${tenantId}.${userId}`;
}

export async function restoreSafeQueries(
  tenantId: string,
  userId: string,
): Promise<void> {
  const raw = await AsyncStorage.getItem(storageKey(tenantId, userId));
  if (!raw) return;
  try {
    const entries = JSON.parse(raw) as {
      queryKey: QueryKey;
      data: unknown;
      updatedAt: number;
    }[];
    for (const entry of entries) {
      if (safeKey(entry.queryKey)) {
        queryClient.setQueryData(entry.queryKey, entry.data, {
          updatedAt: entry.updatedAt,
        });
      }
    }
  } catch {
    await AsyncStorage.removeItem(storageKey(tenantId, userId));
  }
}

export async function persistSafeQueries(
  tenantId: string,
  userId: string,
): Promise<void> {
  const entries = queryClient
    .getQueryCache()
    .getAll()
    .filter(
      (query: Query) =>
        safeKey(query.queryKey) && query.state.status === "success",
    )
    .map((query: Query) => ({
      queryKey: query.queryKey,
      data: query.state.data,
      updatedAt: query.state.dataUpdatedAt,
    }));
  await AsyncStorage.setItem(storageKey(tenantId, userId), JSON.stringify(entries));
}

export async function clearMobileCache(): Promise<void> {
  queryClient.clear();
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
  if (cacheKeys.length) await AsyncStorage.multiRemove(cacheKeys);
}
