import { describe, expect, it } from "vitest";
import { safeActionRoute } from "./deep-links";

const id = "11111111-1111-4111-8111-111111111111";

describe("safeActionRoute", () => {
  it("direciona uma aula para o perfil autenticado", () => {
    expect(safeActionRoute(`/practical-lessons/${id}`, "STUDENT")).toBe(
      `/(student)/lessons/${id}`,
    );
    expect(safeActionRoute(`/practical-lessons/${id}`, "INSTRUCTOR")).toBe(
      `/(instructor)/lessons/${id}`,
    );
  });

  it("rejeita destino administrativo e recurso incompatível com o perfil", () => {
    expect(safeActionRoute(`/students/${id}`, "INSTRUCTOR")).toBeNull();
    expect(safeActionRoute(`/contracts/${id}`, "INSTRUCTOR")).toBeNull();
    expect(
      safeActionRoute(`/(student)/financial/contracts/${id}`, "INSTRUCTOR"),
    ).toBeNull();
    expect(
      safeActionRoute(`/(instructor)/lessons/${id}`, "STUDENT"),
    ).toBeNull();
  });

  it("interpreta deep link do esquema do aplicativo", () => {
    expect(
      safeActionRoute(`prumo://exams/${id}`, "STUDENT"),
    ).toBe(`/(student)/exams/${id}`);
  });
});
