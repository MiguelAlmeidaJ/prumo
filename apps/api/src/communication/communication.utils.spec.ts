import { describe, expect, it } from "vitest";
import {
  isValidTimeZone,
  isWithinQuietHours,
  maskDestination,
  safeError,
  stableKey,
} from "./communication.utils";

describe("communication utils", () => {
  it("calcula horário silencioso que cruza a meia-noite no timezone do usuário", () => {
    expect(
      isWithinQuietHours(
        new Date("2026-07-28T02:30:00.000Z"),
        "America/Sao_Paulo",
        "22:00",
        "07:00",
      ),
    ).toBe(true);
    expect(
      isWithinQuietHours(
        new Date("2026-07-28T15:00:00.000Z"),
        "America/Sao_Paulo",
        "22:00",
        "07:00",
      ),
    ).toBe(false);
  });

  it("valida timezone IANA", () => {
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("timezone-inexistente")).toBe(false);
  });

  it("produz chave estável e mascara destinos", () => {
    expect(stableKey(["a", 1])).toBe(stableKey(["a", 1]));
    expect(stableKey(["a", 1])).not.toBe(stableKey(["a", 2]));
    expect(maskDestination("aluno@example.com")).toBe("al***@example.com");
  });

  it("remove segredos de erros persistidos", () => {
    expect(safeError(new Error("token=abc123 password: xyz"))).toBe(
      "token=[REDACTED] password=[REDACTED]",
    );
  });
});
