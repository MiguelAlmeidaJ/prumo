import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, authApi } from "./auth-api";

describe("authApi web", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envia o login pelo BFF que protege o refresh token", async () => {
    const responseBody = { accessToken: "access", refreshToken: "refresh" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      authApi.login({
        email: "admin@prumo.local",
        password: "PrumoDev@123",
      }),
    ).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "admin@prumo.local",
          password: "PrumoDev@123",
        }),
      }),
    );
  });

  it("preserva status e mensagem de erro da API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Credenciais inválidas" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const error = await authApi
      .login({ email: "admin@prumo.local", password: "senha-invalida" })
      .catch((requestError: unknown) => requestError);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: "Credenciais inválidas",
      status: 401,
    });
  });

  it("rotaciona para o escopo global ao selecionar o console", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "global" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await authApi.selectPlatform("tenant-access");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/select-platform",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tenant-access",
        }),
        body: JSON.stringify({}),
      }),
    );
  });

  it("renova a sessão sem expor refresh token ao JavaScript", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: "new-access",
            refreshToken: "http-only",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await authApi.refresh();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/refresh",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
        credentials: "same-origin",
      }),
    );
  });
});
