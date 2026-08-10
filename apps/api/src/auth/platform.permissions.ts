import type { PlatformPermission } from "@prumo/contracts";
import { PlatformRole } from "@prisma/client";

const SUPPORT_PERMISSIONS = [
  "platform.dashboard.read",
  "platform.tenants.read",
  "platform.tenants.metrics",
  "platform.support.start",
  "platform.support.read",
  "platform.support.end",
  "platform.health.read",
] as const satisfies readonly PlatformPermission[];

const ADMIN_PERMISSIONS = [
  ...SUPPORT_PERMISSIONS,
  "platform.tenants.create",
  "platform.tenants.update",
  "platform.tenants.status",
  "platform.users.read",
  "platform.users.manage",
  "platform.users.roles",
  "platform.plans.read",
  "platform.plans.manage",
  "platform.subscriptions.read",
  "platform.subscriptions.manage",
  "platform.audit.read",
  "platform.settings.manage",
] as const satisfies readonly PlatformPermission[];

const ROLE_PERMISSIONS: Record<
  PlatformRole,
  readonly PlatformPermission[]
> = {
  [PlatformRole.USER]: [],
  [PlatformRole.PLATFORM_SUPPORT]: SUPPORT_PERMISSIONS,
  [PlatformRole.PLATFORM_ADMIN]: ADMIN_PERMISSIONS,
  [PlatformRole.PLATFORM_OWNER]: ADMIN_PERMISSIONS,
};

export function getPlatformPermissionsForRole(
  role: PlatformRole,
): PlatformPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}
