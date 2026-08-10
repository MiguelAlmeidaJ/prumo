import type { PlatformPermission } from "@prumo/contracts";

export const platformNavigation = [
  ["/platform", "Visão geral", "platform.dashboard.read"],
  ["/platform/tenants", "Autoescolas", "platform.tenants.read"],
  ["/platform/users", "Usuários", "platform.users.read"],
  ["/platform/plans", "Planos", "platform.plans.read"],
  [
    "/platform/subscriptions",
    "Assinaturas",
    "platform.subscriptions.read",
  ],
  ["/platform/support", "Suporte", "platform.support.read"],
  ["/platform/audit", "Auditoria", "platform.audit.read"],
  ["/platform/health", "Saúde", "platform.health.read"],
  ["/platform/settings", "Configurações", "platform.settings.manage"],
] as const satisfies ReadonlyArray<
  readonly [string, string, PlatformPermission]
>;

export function visiblePlatformNavigation(
  permissions: readonly PlatformPermission[],
) {
  return platformNavigation.filter(([, , permission]) =>
    permissions.includes(permission),
  );
}
