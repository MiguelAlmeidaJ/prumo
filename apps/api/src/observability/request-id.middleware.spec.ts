import { describe, expect, it, vi } from "vitest";
import { RequestIdMiddleware } from "./request-id.middleware";

describe("RequestIdMiddleware", () => {
  it("preserva um request ID válido e o devolve no cabeçalho", () => {
    const request: {
      headers: { "x-request-id": string };
      requestId?: string;
    } = { headers: { "x-request-id": "trace-123" } };
    const setHeader = vi.fn();
    const next = vi.fn();
    new RequestIdMiddleware().use(request, { setHeader }, next);

    expect(request).toMatchObject({ requestId: "trace-123" });
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", "trace-123");
    expect(next).toHaveBeenCalledOnce();
  });

  it("substitui valores potencialmente maliciosos", () => {
    const request: {
      headers: { "x-request-id": string };
      requestId?: string;
    } = { headers: { "x-request-id": "token secreto com espaços" } };
    const setHeader = vi.fn();
    new RequestIdMiddleware().use(request, { setHeader }, vi.fn());

    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.requestId).not.toContain("token");
  });
});
