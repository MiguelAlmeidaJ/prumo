import type {
  MembershipRole,
  Permission,
  PlatformPermission,
  PlatformRole,
  UserSummary,
} from "@prumo/contracts";

export interface AccessTokenPayload {
  sub: string;
  scope: "tenant" | "platform";
  tenantId?: string;
  membershipId?: string;
  role?: MembershipRole;
  permissions: Permission[];
  platformRole?: PlatformRole;
  platformPermissions?: PlatformPermission[];
  tokenType: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  scope: "tenant" | "platform";
  tenantId?: string;
  membershipId?: string;
  sid: string;
  tokenType: "refresh";
}

export interface AuthenticatedPrincipal extends UserSummary {
  scope: "tenant" | "platform";
  tenantId?: string;
  membershipId?: string;
  role?: MembershipRole;
  permissions: Permission[];
  platformRole: PlatformRole;
  platformPermissions: PlatformPermission[];
  mfaEnabled: boolean;
}

export interface AuthenticatedUser extends AuthenticatedPrincipal {
  scope: "tenant";
  tenantId: string;
  membershipId: string;
  role: MembershipRole;
}

export interface CurrentTenantContext {
  id: string;
  name: string;
  slug: string;
  status: "TRIAL" | "ACTIVE";
  membershipId: string;
  role: MembershipRole;
  permissions: Permission[];
}

export interface AuthenticatedRequest {
  user?: AuthenticatedPrincipal;
  tenant?: CurrentTenantContext;
  supportSession?: CurrentSupportSessionContext;
}

export interface CurrentSupportSessionContext {
  id: string;
  tenantId: string;
  platformUserId: string;
  reason: string;
  ticketReference: string | null;
  expiresAt: Date;
}
