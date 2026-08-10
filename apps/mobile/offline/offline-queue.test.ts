import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => void storage.set(key, value)),
    removeItem: vi.fn(async (key: string) => void storage.delete(key)),
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: vi.fn(() => `uuid-${Math.random()}`) }));
const request = vi.fn();
vi.mock("@/lib/http-client", () => ({
  mobileRequest: (...args: unknown[]) => request(...args),
  idempotencyHeaders: (key: string) => ({ "Idempotency-Key": key }),
}));

import {
  enqueueOperation,
  hasPendingOperations,
  syncOfflineQueue,
} from "./offline-queue";

describe("fila operacional offline", () => {
  beforeEach(() => {
    storage.clear();
    request.mockReset();
  });

  it("isola operações por tenant e sincroniza sem duplicar", async () => {
    await enqueueOperation({
      tenantId: "tenant-a",
      userId: "user-a",
      kind: "START_LESSON",
      resourceId: "lesson-a",
      payload: { odometerKm: 100 },
    });
    expect(await hasPendingOperations("tenant-a", "user-a")).toBe(true);
    expect(await hasPendingOperations("tenant-b", "user-a")).toBe(false);
    request.mockResolvedValue({ ok: true });
    expect(await syncOfflineQueue("tenant-a", "user-a")).toEqual({
      synced: 1,
      failed: 0,
    });
    expect(await hasPendingOperations("tenant-a", "user-a")).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("mantém a operação para retry quando a rede falha", async () => {
    await enqueueOperation({
      tenantId: "tenant-a",
      userId: "user-a",
      kind: "NO_SHOW",
      resourceId: "lesson-a",
      payload: {},
    });
    request.mockRejectedValue(new Error("offline"));
    expect(await syncOfflineQueue("tenant-a", "user-a")).toEqual({
      synced: 0,
      failed: 1,
    });
    expect(await hasPendingOperations("tenant-a", "user-a")).toBe(true);
  });

  it("serializa tentativas concorrentes de sincronização", async () => {
    await enqueueOperation({
      tenantId: "tenant-a",
      userId: "user-a",
      kind: "COMPLETE_LESSON",
      resourceId: "lesson-a",
      payload: { odometerKm: 120 },
    });
    request.mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true }), 5),
        ),
    );
    const [first, second] = await Promise.all([
      syncOfflineQueue("tenant-a", "user-a"),
      syncOfflineQueue("tenant-a", "user-a"),
    ]);
    expect(first).toEqual({ synced: 1, failed: 0 });
    expect(second).toEqual(first);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
