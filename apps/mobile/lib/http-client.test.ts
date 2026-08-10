import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { hostUri: "127.0.0.1:8081", version: "1.0.0" } },
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { configureHttpAuth, mobileRequest } from "./http-client";

describe("http client autenticado", () => {
  afterEach(() => {
    configureHttpAuth(null);
    vi.unstubAllGlobals();
  });

  it("usa uma única renovação para respostas 401 concorrentes", async () => {
    let token = "old";
    const refresh = vi.fn(async () => {
      token = "new";
      return {
        accessToken: token,
        refreshToken: "refresh-token-long-enough",
        accessTokenExpiresIn: 1,
        refreshTokenExpiresIn: 2,
        user: { id: "u", name: "U", email: "u@example.com" },
        activeMembership: {
          id: "m",
          role: "STUDENT" as const,
          permissions: [],
          tenant: { id: "t", name: "T", slug: "t", status: "ACTIVE" as const },
        },
        memberships: [],
      };
    });
    configureHttpAuth({
      getSession: () => ({
        accessToken: token,
        refreshToken: "refresh-token-long-enough",
        accessTokenExpiresIn: 1,
        refreshTokenExpiresIn: 2,
        user: { id: "u", name: "U", email: "u@example.com" },
        activeMembership: {
          id: "m",
          role: "STUDENT",
          permissions: [],
          tenant: { id: "t", name: "T", slug: "t", status: "ACTIVE" },
        },
        memberships: [],
      }),
      refresh,
      expired: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get("Authorization");
        return authorization === "Bearer old"
          ? new Response(JSON.stringify({ message: "expired" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            })
          : new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
      }),
    );
    const [first, second] = await Promise.all([
      mobileRequest<{ ok: boolean }>("/one"),
      mobileRequest<{ ok: boolean }>("/two"),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
