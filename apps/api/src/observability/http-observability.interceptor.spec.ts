import {
  UnauthorizedException,
  type CallHandler,
  type ExecutionContext,
} from "@nestjs/common";
import { throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { HttpObservabilityInterceptor } from "./http-observability.interceptor";

describe("HttpObservabilityInterceptor", () => {
  it("registra status real sem corpo, token ou mensagem do erro", async () => {
    const observeHttp = vi.fn();
    const write = vi.fn();
    const request = {
      method: "POST",
      path: "/api/private",
      requestId: "request-1",
      headers: { authorization: "Bearer secret" },
      body: { password: "never-log-this" },
      user: { id: "user-1", tenantId: "tenant-1" },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ statusCode: 201 }),
      }),
    } as ExecutionContext;
    const handler = {
      handle: () =>
        throwError(() => new UnauthorizedException("token inválido")),
    } as CallHandler;
    const interceptor = new HttpObservabilityInterceptor(
      { observeHttp } as never,
      { write } as never,
    );

    await new Promise<void>((resolve) => {
      interceptor
        .intercept(context, handler)
        .subscribe({ error: () => resolve() });
    });

    expect(observeHttp).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
    );
    const serialized = JSON.stringify(write.mock.calls);
    expect(serialized).toContain("UnauthorizedException");
    expect(serialized).not.toContain("never-log-this");
    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("token inválido");
  });
});
