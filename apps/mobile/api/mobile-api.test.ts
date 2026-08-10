import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("@/lib/http-client", () => ({
  mobileRequest: (...args: unknown[]) => request(...args),
  idempotencyHeaders: (key: string) => ({ "Idempotency-Key": key }),
}));

import { notificationsApi } from "./mobile-api";

describe("API mobile de notificações", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({});
  });

  it("usa os endpoints reais de configurações e preferências", async () => {
    await notificationsApi.settings();
    await notificationsApi.preferences();
    await notificationsApi.updateSettings({
      emailEnabled: true,
      pushEnabled: true,
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/communication/settings",
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/communication/preferences",
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      "/communication/settings",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
