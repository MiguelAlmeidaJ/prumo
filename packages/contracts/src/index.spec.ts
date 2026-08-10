import { describe, expect, it } from "vitest";
import {
  loginSchema,
  refreshSchema,
  selectTenantSchema,
  tenantContextSchema,
} from "./index";

describe("loginSchema", () => {
  it("accepts a valid login payload", () => {
    const result = loginSchema.safeParse({
      email: " USUARIO@PRUMO.COM.BR ",
      password: "senha-segura",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("usuario@prumo.com.br");
  });

  it("rejects invalid credentials", () => {
    expect(
      loginSchema.safeParse({
        email: "email-invalido",
        password: "curta",
      }).success,
    ).toBe(false);
  });
});

describe("tenantContextSchema", () => {
  it("requires a UUID tenant identifier", () => {
    expect(
      tenantContextSchema.safeParse({
        tenantId: "c8db475c-7a64-4f6d-8436-c84aa7bd3f31",
      }).success,
    ).toBe(true);
    expect(
      tenantContextSchema.safeParse({ tenantId: "tenant-do-frontend" }).success,
    ).toBe(false);
  });
});

describe("refresh and tenant selection schemas", () => {
  const refreshToken = "refresh-token-com-tamanho-suficiente";

  it("requires both tenant and refresh token for tenant selection", () => {
    expect(
      selectTenantSchema.safeParse({
        tenantId: "c8db475c-7a64-4f6d-8436-c84aa7bd3f31",
        refreshToken,
      }).success,
    ).toBe(true);
    expect(
      selectTenantSchema.safeParse({
        tenantId: "c8db475c-7a64-4f6d-8436-c84aa7bd3f31",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed refresh tokens", () => {
    expect(refreshSchema.safeParse({ refreshToken }).success).toBe(true);
    expect(refreshSchema.safeParse({ refreshToken: "curto" }).success).toBe(
      false,
    );
  });
});
