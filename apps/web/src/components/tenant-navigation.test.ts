import { describe, expect, it } from "vitest";
import {
  canAccessTenantPath,
  isTenantNavigationItemActive,
  visibleTenantNavigation,
  visibleTenantNavigationGroups,
} from "./tenant-navigation";

describe("navegação tenant por permissão", () => {
  const studentPermissions = [
    "profile:read",
    "tenant:select",
    "memberships:read",
    "notifications.read",
  ] as const;

  it("mostra ao aluno somente visão geral e notificações", () => {
    expect(
      visibleTenantNavigation(studentPermissions).map(({ href }) => href),
    ).toEqual(["/", "/notifications"]);
  });

  it("bloqueia acesso direto do aluno aos cadastros e financeiro", () => {
    expect(canAccessTenantPath("/students", studentPermissions)).toBe(false);
    expect(canAccessTenantPath("/students/id/edit", studentPermissions)).toBe(
      false,
    );
    expect(canAccessTenantPath("/financial", studentPermissions)).toBe(false);
    expect(canAccessTenantPath("/notifications", studentPermissions)).toBe(
      true,
    );
  });

  it("diferencia leitura, criação e edição e falha fechado", () => {
    expect(canAccessTenantPath("/students", ["students.read"])).toBe(true);
    expect(canAccessTenantPath("/students/new", ["students.read"])).toBe(false);
    expect(canAccessTenantPath("/students/abc/edit", ["students.read"])).toBe(
      false,
    );
    expect(canAccessTenantPath("/students/new", ["students.create"])).toBe(
      true,
    );
    expect(canAccessTenantPath("/rota-desconhecida", ["profile:read"])).toBe(
      false,
    );
  });

  it("aceita acesso total com wildcard", () => {
    expect(canAccessTenantPath("/students", ["*"])).toBe(true);
    expect(canAccessTenantPath("/financial/reports", ["*"])).toBe(true);
  });

  it("agrupa somente itens permitidos e remove grupos vazios", () => {
    expect(
      visibleTenantNavigationGroups(studentPermissions).map((group) => [
        group.label,
        group.items.map((item) => item.href),
      ]),
    ).toEqual([
      ["Principal", ["/"]],
      ["Comunicação", ["/notifications"]],
    ]);
  });

  it("marca apenas a rota mais específica como ativa", () => {
    expect(
      isTenantNavigationItemActive("/financial/reports", "/financial"),
    ).toBe(false);
    expect(
      isTenantNavigationItemActive("/financial/reports", "/financial/reports"),
    ).toBe(true);
    expect(isTenantNavigationItemActive("/students/abc", "/students")).toBe(
      true,
    );
  });
});
