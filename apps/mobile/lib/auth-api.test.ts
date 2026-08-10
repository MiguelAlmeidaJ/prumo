import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { hostUri: "192.168.1.25:8081" } },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

import { authApi } from "./auth-api";

describe("authApi mobile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("usa o host do Expo para alcançar a API na rede local", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: {}, activeMembership: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await authApi.me("access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.25:3333/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("envia refresh token e tenant selecionado para a troca segura", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "new-access" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await authApi.selectTenant("access", "refresh", "tenant-id");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.25:3333/api/auth/select-tenant",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          tenantId: "tenant-id",
          refreshToken: "refresh",
        }),
      }),
    );
  });
});
