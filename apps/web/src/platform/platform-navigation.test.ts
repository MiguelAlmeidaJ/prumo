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
  });
});
