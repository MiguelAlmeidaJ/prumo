import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobileOfflineOperation } from "@prumo/contracts";
import * as Crypto from "expo-crypto";
import { idempotencyHeaders, mobileRequest } from "@/lib/http-client";

const QUEUE_KEY = "prumo.mobile.operational-queue";
const syncPromises = new Map<
  string,
  Promise<{ synced: number; failed: number }>
>();

const endpoints: Record<
  MobileOfflineOperation["kind"],
  (operation: MobileOfflineOperation) => { path: string; method: string }
> = {
  START_LESSON: ({ resourceId }) => ({
    path: `/mobile/instructor/lessons/${resourceId}/start`,
    method: "POST",
  }),
  COMPLETE_LESSON: ({ resourceId }) => ({
    path: `/mobile/instructor/lessons/${resourceId}/complete`,
    method: "POST",
  }),
  NO_SHOW: ({ resourceId }) => ({
    path: `/mobile/instructor/lessons/${resourceId}/no-show`,
    method: "POST",
  }),
  LESSON_EVALUATION: ({ resourceId }) => ({
    path: `/mobile/instructor/lessons/${resourceId}/evaluation`,
    method: "PUT",
  }),
  THEORETICAL_ATTENDANCE: ({ resourceId }) => ({
    path: `/mobile/instructor/theoretical-classes/${resourceId}/attendance`,
    method: "PUT",
  }),
  VEHICLE_OCCURRENCE: ({ resourceId }) => ({
    path: `/mobile/instructor/vehicles/${resourceId}/occurrences`,
    method: "POST",
  }),
};

async function read(): Promise<MobileOfflineOperation[]> {
  try {
    const value = await AsyncStorage.getItem(QUEUE_KEY);
    return value ? (JSON.parse(value) as MobileOfflineOperation[]) : [];
  } catch {
    return [];
  }
}

async function write(items: MobileOfflineOperation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueOperation(
  input: Pick<
    MobileOfflineOperation,
    "tenantId" | "userId" | "kind" | "resourceId" | "payload"
  >,
): Promise<MobileOfflineOperation> {
  const item: MobileOfflineOperation = {
    ...input,
    localOperationId: Crypto.randomUUID(),
    idempotencyKey: Crypto.randomUUID(),
    status: "PENDING",
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  const items = await read();
  items.push(item);
  await write(items);
  return item;
}

export async function queuedOperations(
  tenantId?: string,
  userId?: string,
): Promise<MobileOfflineOperation[]> {
  const items = await read();
  return items.filter(
    (item) =>
      (!tenantId || item.tenantId === tenantId) &&
      (!userId || item.userId === userId),
  );
}

export async function hasPendingOperations(
  tenantId: string,
  userId: string,
): Promise<boolean> {
  return (await queuedOperations(tenantId, userId)).length > 0;
}

export async function clearOfflineQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function discardOperations(
  tenantId: string,
  userId: string,
): Promise<void> {
  const items = await read();
  await write(
    items.filter(
      (item) => item.tenantId !== tenantId || item.userId !== userId,
    ),
  );
}

async function performSync(
  tenantId: string,
  userId: string,
): Promise<{ synced: number; failed: number }> {
  const all = await read();
  let synced = 0;
  let failed = 0;
  for (const operation of all.filter(
    (item) => item.tenantId === tenantId && item.userId === userId,
  )) {
    const endpoint = endpoints[operation.kind];
    operation.status = "SYNCING";
    operation.attempts += 1;
    await write(all);
    try {
      await mobileRequest(endpoint(operation).path, {
        method: endpoint(operation).method,
        headers: idempotencyHeaders(operation.idempotencyKey),
        body: JSON.stringify(operation.payload),
      });
      operation.status = "SYNCED";
      const index = all.findIndex(
        (item) => item.localOperationId === operation.localOperationId,
      );
      if (index >= 0) all.splice(index, 1);
      synced += 1;
    } catch (error) {
      operation.status = "FAILED";
      operation.lastError =
        error instanceof Error ? error.message.slice(0, 300) : "Falha ao sincronizar";
      failed += 1;
      break;
    }
    await write(all);
  }
  await write(all);
  return { synced, failed };
}

export function syncOfflineQueue(
  tenantId: string,
  userId: string,
): Promise<{ synced: number; failed: number }> {
  const scope = `${tenantId}:${userId}`;
  const running = syncPromises.get(scope);
  if (running) return running;
  const promise = performSync(tenantId, userId).finally(() => {
    syncPromises.delete(scope);
  });
  syncPromises.set(scope, promise);
  return promise;
}
