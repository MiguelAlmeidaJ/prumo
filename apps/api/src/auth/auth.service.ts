import {
  type AuthResponse,
  type AuthTokens,
  type LoginInput,
  type LogoutInput,
  type MeResponse,
  type MembershipSummary,
  type PlatformAccessSummary,
  type RefreshInput,
  type SelectTenantInput,
  type UserSummary,
} from "@prumo/contracts";
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  AuditActorType,
  PlatformRole,
  Prisma,
  TenantStatus,
} from "@prisma/client";
import { compare } from "bcrypt";
import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { getPermissionsForRole } from "./auth.permissions";
import type { RefreshTokenPayload } from "./auth.types";
import { getPlatformPermissionsForRole } from "./platform.permissions";

const DUMMY_PASSWORD_HASH =
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxP5vTgtE5u/1RAkRkMpjoT7Z/q";
const AVAILABLE_TENANT_STATUSES = [
  TenantStatus.TRIAL,
  TenantStatus.ACTIVE,
] as const;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const membershipSelect = {
  id: true,
  userId: true,
  tenantId: true,
  role: true,
  active: true,
  tenant: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  },
} satisfies Prisma.MembershipSelect;

type MembershipWithTenant = Prisma.MembershipGetPayload<{
  select: typeof membershipSelect;
}>;

type SessionUser = UserSummary & {
  platformRole: PlatformRole;
  mfaEnabled: boolean;
};

interface TokenPairContext {
  user: SessionUser;
  membership?: MembershipWithTenant;
  previousSessionId?: string;
}

function parseDurationSeconds(value: string, variableName: string): number {
  const normalized = value.trim().toLowerCase();
  if (/^\d+$/.test(normalized) && Number(normalized) > 0) {
    return Number(normalized);
  }
  const match = normalized.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(
      `${variableName} deve usar segundos ou o formato 15m, 2h ou 7d.`,
    );
  }
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  return (
    Number(match[1]) *
    multipliers[match[2] as keyof typeof multipliers]
  );
}

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: number;
  private readonly refreshExpiresIn: number;
  private readonly platformAccessExpiresIn: number;
  private readonly platformRefreshExpiresIn: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.accessSecret =
      configService.getOrThrow<string>("JWT_ACCESS_SECRET");
    this.refreshSecret =
      configService.getOrThrow<string>("JWT_REFRESH_SECRET");
    this.accessExpiresIn = parseDurationSeconds(
      configService.get<string>("JWT_ACCESS_EXPIRES_IN") ?? "15m",
      "JWT_ACCESS_EXPIRES_IN",
    );
    this.refreshExpiresIn = parseDurationSeconds(
      configService.get<string>("JWT_REFRESH_EXPIRES_IN") ?? "7d",
      "JWT_REFRESH_EXPIRES_IN",
    );
    this.platformAccessExpiresIn = parseDurationSeconds(
      configService.get<string>("JWT_PLATFORM_ACCESS_EXPIRES_IN") ?? "5m",
      "JWT_PLATFORM_ACCESS_EXPIRES_IN",
    );
    this.platformRefreshExpiresIn = parseDurationSeconds(
      configService.get<string>("JWT_PLATFORM_REFRESH_EXPIRES_IN") ?? "8h",
      "JWT_PLATFORM_REFRESH_EXPIRES_IN",
    );
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        active: true,
        platformRole: true,
        mfaEnabled: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });
    const passwordMatches = await compare(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    const now = new Date();
    const locked = Boolean(user?.lockedUntil && user.lockedUntil > now);

    if (!user || !user.active || !passwordMatches || locked) {
      // Não prolonga indefinidamente o bloqueio a cada nova tentativa.
      if (user && !locked) await this.registerFailedLogin(user);
      throw new UnauthorizedException("E-mail ou senha inválidos.");
    }

    const memberships = await this.findActiveMemberships(user.id);
    const publicUser = this.toSessionUser(user);
    const isPlatformUser = user.platformRole !== PlatformRole.USER;
    const activeMembership = isPlatformUser ? undefined : memberships[0];

    if (!activeMembership && !isPlatformUser) {
      throw new ForbiddenException("Usuário sem membership ativa.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    });
    if (isPlatformUser) {
      await this.recordPlatformAuth(
        user.id,
        "PLATFORM_LOGIN_SUCCESS",
      );
    }

    const tokens = await this.issueTokenPair({
      user: publicUser,
      membership: activeMembership,
    });
    return this.buildAuthResponse(
      publicUser,
      activeMembership,
      memberships,
      tokens,
    );
  }

  async selectTenant(
    currentUserId: string,
    input: SelectTenantInput,
  ): Promise<AuthResponse> {
    const targetMembership = await this.prisma.membership.findFirst({
      where: {
        userId: currentUserId,
        tenantId: input.tenantId,
        active: true,
        tenant: { status: { in: [...AVAILABLE_TENANT_STATUSES] } },
      },
      select: membershipSelect,
    });
    if (!targetMembership) {
      throw new ForbiddenException(
        "O usuário não possui membership ativa neste tenant.",
      );
    }

    const session = await this.getRefreshSession(
      input.refreshToken,
      currentUserId,
    );
    const publicUser = this.toSessionUser(session.user);
    const memberships = await this.findActiveMemberships(currentUserId);
    const tokens = await this.issueTokenPair({
      user: publicUser,
      membership: targetMembership,
      previousSessionId: session.id,
    });
    return this.buildAuthResponse(
      publicUser,
      targetMembership,
      memberships,
      tokens,
    );
  }

  async selectPlatform(
    currentUserId: string,
    input: RefreshInput,
  ): Promise<AuthResponse> {
    const session = await this.getRefreshSession(
      input.refreshToken,
      currentUserId,
    );
    const publicUser = this.toSessionUser(session.user);
    if (publicUser.platformRole === PlatformRole.USER) {
      throw new ForbiddenException("Usuário sem papel global.");
    }
    const memberships = await this.findActiveMemberships(currentUserId);
    const tokens = await this.issueTokenPair({
      user: publicUser,
      previousSessionId: session.id,
    });
    return this.buildAuthResponse(
      publicUser,
      undefined,
      memberships,
      tokens,
    );
  }

  async refresh(input: RefreshInput): Promise<AuthResponse> {
    const session = await this.getRefreshSession(input.refreshToken);
    const publicUser = this.toSessionUser(session.user);
    const memberships = await this.findActiveMemberships(session.userId);
    const activeMembership = session.membershipId
      ? memberships.find(
          (membership) => membership.id === session.membershipId,
        )
      : undefined;

    if (session.membershipId && !activeMembership) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException("Membership do refresh indisponível.");
    }
    if (
      !session.membershipId &&
      publicUser.platformRole === PlatformRole.USER
    ) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException("Papel global indisponível.");
    }

    const tokens = await this.issueTokenPair({
      user: publicUser,
      membership: activeMembership,
      previousSessionId: session.id,
    });
    return this.buildAuthResponse(
      publicUser,
      activeMembership,
      memberships,
      tokens,
    );
  }

  async logout(input: LogoutInput): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.verifyRefreshToken(input.refreshToken, true);
    } catch {
      return;
    }
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      select: { id: true, userId: true, tokenHash: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      !this.matchesRefreshHash(input.refreshToken, session.tokenHash)
    ) {
      return;
    }
    await this.prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listMemberships(userId: string): Promise<MembershipSummary[]> {
    const memberships = await this.findActiveMemberships(userId);
    return memberships.map((membership) =>
      this.toMembershipSummary(membership),
    );
  }

  async getMe(user: {
    id: string;
    name: string;
    email: string;
    membershipId?: string;
    platformRole: PlatformRole;
    mfaEnabled: boolean;
  }): Promise<MeResponse> {
    const memberships = await this.findActiveMemberships(user.id);
    const activeMembership = user.membershipId
      ? memberships.find(
          (membership) => membership.id === user.membershipId,
        )
      : undefined;
    const platform =
      user.platformRole === PlatformRole.USER
        ? undefined
        : ({
            role: user.platformRole,
            permissions: getPlatformPermissionsForRole(user.platformRole),
            mfaEnabled: user.mfaEnabled,
          } satisfies PlatformAccessSummary);

    return {
      user: this.toUserSummary(user),
      activeMembership: activeMembership
        ? this.toMembershipSummary(activeMembership)
        : null,
      ...(platform ? { platform } : {}),
    };
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async getRefreshSession(
    refreshToken: string,
    expectedUserId?: string,
  ) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            platformRole: true,
            mfaEnabled: true,
          },
        },
        membership: { select: membershipSelect },
      },
    });
    const payloadTenantId = payload.tenantId ?? null;
    const payloadMembershipId = payload.membershipId ?? null;

    if (
      !session ||
      session.userId !== payload.sub ||
      session.tenantId !== payloadTenantId ||
      session.membershipId !== payloadMembershipId ||
      (expectedUserId && session.userId !== expectedUserId) ||
      !this.matchesRefreshHash(refreshToken, session.tokenHash)
    ) {
      throw new UnauthorizedException("Refresh token inválido.");
    }
    if (session.revokedAt) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException("Refresh token já utilizado.");
    }
    if (session.expiresAt <= new Date()) {
      await this.prisma.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Refresh token expirado.");
    }
    if (!session.user.active) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException("Sessão indisponível.");
    }

    if (session.membership) {
      const available =
        session.membership.active &&
        session.membership.userId === session.userId &&
        session.membership.tenantId === session.tenantId &&
        AVAILABLE_TENANT_STATUSES.includes(
          session.membership.tenant.status as (typeof AVAILABLE_TENANT_STATUSES)[number],
        );
      if (!available) {
        await this.revokeAllUserSessions(session.userId);
        throw new UnauthorizedException("Sessão indisponível.");
      }
    } else if (session.user.platformRole === PlatformRole.USER) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException("Sessão global indisponível.");
    }
    return session;
  }

  private async verifyRefreshToken(
    refreshToken: string,
    ignoreExpiration = false,
  ): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.refreshSecret, ignoreExpiration },
      );
    } catch {
      throw new UnauthorizedException("Refresh token inválido.");
    }
    const tenantPayloadValid =
      payload.scope === "tenant" &&
      typeof payload.tenantId === "string" &&
      typeof payload.membershipId === "string";
    const platformPayloadValid =
      payload.scope === "platform" &&
      payload.tenantId === undefined &&
      payload.membershipId === undefined;
    if (
      payload.tokenType !== "refresh" ||
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      (!tenantPayloadValid && !platformPayloadValid)
    ) {
      throw new UnauthorizedException("Refresh token inválido.");
    }
    return payload;
  }

  private async issueTokenPair(
    context: TokenPairContext,
  ): Promise<AuthTokens> {
    const scope = context.membership ? "tenant" : "platform";
    const permissions = context.membership
      ? getPermissionsForRole(context.membership.role)
      : [];
    const platformPermissions = getPlatformPermissionsForRole(
      context.user.platformRole,
    );
    const sessionId = randomUUID();
    const refreshExpiresIn = context.membership
      ? this.refreshExpiresIn
      : this.platformRefreshExpiresIn;
    const accessExpiresIn = context.membership
      ? this.accessExpiresIn
      : this.platformAccessExpiresIn;
    const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000);
    const tenantFields = context.membership
      ? {
          tenantId: context.membership.tenantId,
          membershipId: context.membership.id,
          role: context.membership.role,
        }
      : {};
    const platformFields =
      scope === "platform"
        ? {
            platformRole: context.user.platformRole,
            platformPermissions,
          }
        : {};
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: context.user.id,
          scope,
          ...tenantFields,
          permissions,
          ...platformFields,
          tokenType: "access",
        },
        {
          secret: this.accessSecret,
          expiresIn: accessExpiresIn,
          jwtid: randomUUID(),
        },
      ),
      this.jwtService.signAsync(
        {
          sub: context.user.id,
          scope,
          ...(context.membership
            ? {
                tenantId: context.membership.tenantId,
                membershipId: context.membership.id,
              }
            : {}),
          sid: sessionId,
          tokenType: "refresh",
        },
        {
          secret: this.refreshSecret,
          expiresIn: refreshExpiresIn,
          jwtid: randomUUID(),
        },
      ),
    ]);
    const createData = {
      id: sessionId,
      userId: context.user.id,
      tenantId: context.membership?.tenantId,
      membershipId: context.membership?.id,
      tokenHash: this.hashRefreshToken(refreshToken),
      expiresAt,
    };

    if (context.previousSessionId) {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.refreshSession.create({ data: createData });
        const rotated = await transaction.refreshSession.updateMany({
          where: {
            id: context.previousSessionId,
            userId: context.user.id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { revokedAt: new Date(), replacedById: sessionId },
        });
        if (rotated.count !== 1) {
          throw new UnauthorizedException("Refresh token já utilizado.");
        }
      });
    } else {
      await this.prisma.refreshSession.create({ data: createData });
    }
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: accessExpiresIn,
      refreshTokenExpiresIn: refreshExpiresIn,
    };
  }

  private async findActiveMemberships(
    userId: string,
  ): Promise<MembershipWithTenant[]> {
    return this.prisma.membership.findMany({
      where: {
        userId,
        active: true,
        tenant: { status: { in: [...AVAILABLE_TENANT_STATUSES] } },
      },
      select: membershipSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  private buildAuthResponse(
    user: SessionUser,
    activeMembership: MembershipWithTenant | undefined,
    memberships: MembershipWithTenant[],
    tokens: AuthTokens,
  ): AuthResponse {
    const platform =
      user.platformRole === PlatformRole.USER
        ? undefined
        : ({
            role: user.platformRole,
            permissions: getPlatformPermissionsForRole(user.platformRole),
            mfaEnabled: user.mfaEnabled,
          } satisfies PlatformAccessSummary);
    return {
      ...tokens,
      user: this.toUserSummary(user),
      activeMembership: activeMembership
        ? this.toMembershipSummary(activeMembership)
        : null,
      memberships: memberships.map((membership) =>
        this.toMembershipSummary(membership),
      ),
      ...(platform ? { platform } : {}),
    };
  }

  private toMembershipSummary(
    membership: MembershipWithTenant,
  ): MembershipSummary {
    if (
      membership.tenant.status !== TenantStatus.TRIAL &&
      membership.tenant.status !== TenantStatus.ACTIVE
    ) {
      throw new Error("Membership associada a tenant indisponível.");
    }
    return {
      id: membership.id,
      role: membership.role,
      permissions: getPermissionsForRole(membership.role),
      tenant: {
        ...membership.tenant,
        status: membership.tenant.status,
      },
    };
  }

  private toSessionUser(user: SessionUser): SessionUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      platformRole: user.platformRole,
      mfaEnabled: user.mfaEnabled,
    };
  }

  private toUserSummary(user: UserSummary): UserSummary {
    return { id: user.id, name: user.name, email: user.email };
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHmac("sha256", this.refreshSecret)
      .update(refreshToken)
      .digest("hex");
  }

  private matchesRefreshHash(
    refreshToken: string,
    storedHash: string,
  ): boolean {
    const calculated = Buffer.from(
      this.hashRefreshToken(refreshToken),
      "hex",
    );
    const stored = Buffer.from(storedHash, "hex");
    return (
      calculated.length === stored.length &&
      timingSafeEqual(calculated, stored)
    );
  }

  private async registerFailedLogin(user: {
    id: string;
    failedLoginAttempts: number;
    platformRole: PlatformRole;
  }): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil:
          attempts >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCK_DURATION_MS)
            : undefined,
      },
    });
    if (user.platformRole !== PlatformRole.USER) {
      await this.recordPlatformAuth(user.id, "PLATFORM_LOGIN_FAILED");
    }
  }

  private recordPlatformAuth(
    userId: string,
    action: string,
  ): Promise<unknown> {
    return this.prisma.auditLog.create({
      data: {
        entityType: "User",
        entityId: userId,
        action,
        actorType: AuditActorType.PLATFORM_USER,
        platformUserId: userId,
      },
    });
  }
}
