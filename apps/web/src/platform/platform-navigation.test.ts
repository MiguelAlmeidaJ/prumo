import { describe, expect, it } from "vitest";
import {
  platformNavigation,
  visiblePlatformNavigation,
} from "./platform-navigation";

describe("navegação do console da plataforma", () => {
  it("mantém todas as áreas administrativas previstas", () => {
    expect(platformNavigation.map(([href]) => href)).toEqual([
      "/platform",
      "/platform/tenants",
      "/platform/users",
      "/platform/plans",
      "/platform/subscriptions",
      "/platform/support",
      "/platform/migrations",
      "/platform/audit",
      "/platform/health",
      "/platform/settings",
    ]);
  });

  it("não mostra administração para PLATFORM_SUPPORT", () => {
    const visible = visiblePlatformNavigation([
      "platform.dashboard.read",
      "platform.tenants.read",
      "platform.support.read",
      "platform.health.read",
    ]).map(([href]) => href);
    expect(visible).toContain("/platform/support");
    expect(visible).not.toContain("/platform/users");
    expect(visible).not.toContain("/platform/settings");
    expect(visible).not.toContain("/platform/migrations");
  });

  it("mostra migrações somente com a permissão de sistema", () => {
    expect(
      visiblePlatformNavigation(["system.migrations.read"]).map(
        ([href]) => href,
      ),
    ).toEqual(["/platform/migrations"]);
  });

  it("mostra planos e assinaturas somente com as permissões do proprietário", () => {
    expect(
      visiblePlatformNavigation([
        "platform.plans.read",
        "platform.subscriptions.read",
      ]).map(([href]) => href),
    ).toEqual(["/platform/plans", "/platform/subscriptions"]);

    expect(
      visiblePlatformNavigation(["platform.audit.read"]).map(([href]) => href),
    ).not.toContain("/platform/plans");
  });
});
