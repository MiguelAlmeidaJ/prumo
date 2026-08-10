import type {
  ActionMessage,
  ChangePasswordInput,
  CredentialTokenInfo,
  ForgotPasswordInput,
  InviteTeamMemberInput,
  MembershipRole,
  SetCredentialPasswordInput,
  TeamMemberInviteResult,
  TeamMemberSummary,
  UpdateTeamMemberInput,
} from "@prumo/contracts";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  MembershipRole as PrismaMembershipRole,
  Prisma,
  TenantSubscriptionStatus,
  TenantStatus,
  UserCredentialTokenType,
} from "@prisma/client";
import { compare, hash } from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import type {
  AuthenticatedPrincipal,
  CurrentTenantContext,
} from "../auth/auth.types";
import { EmailProvider } from "../communication/providers/email.provider";
import { PrismaService } from "../database/prisma.service";

const memberSelect = {
  id: true,
  role: true,
  active: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      passwordSetAt: true,
    },
  },
} satisfies Prisma.MembershipSelect;

type SelectedMember = Prisma.MembershipGetPayload<{
  select: typeof memberSelect;
}>;

const OWNER_ROLE = PrismaMembershipRole.TENANT_OWNER;
const AVAILABLE_TENANT_STATUSES = [TenantStatus.TRIAL, TenantStatus.ACTIVE];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly webUrl: string;
  private readonly bcryptRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    config: ConfigService,
  ) {
    this.webUrl = config
      .get<string>("APP_WEB_URL", "http://localhost:3000")
      .replace(/\/$/, "");
    this.bcryptRounds = Math.max(
      10,
      Number(config.get<string>("BCRYPT_ROUNDS", "12")),
    );
  }

  async listTeam(tenantId: string): Promise<TeamMemberSummary[]> {
    const members = await this.prisma.membership.findMany({
      where: { tenantId },
      select: memberSelect,
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    });
    return members.map((member) => this.toSummary(member));
  }

  async inviteTeamMember(
    tenant: CurrentTenantContext,
    actorUserId: string,
    input: InviteTeamMemberInput,
  ): Promise<TeamMemberInviteResult> {
    this.assertCanAssignRole(tenant.role, input.role);
    const email = normalizeEmail(input.email);
    const existingMembership = await this.prisma.membership.findFirst({
      where: { tenantId: tenant.id, user: { email } },
      select: { id: true, active: true },
    });
    if (existingMembership?.active) {
      throw new ConflictException("Este usuário já participa da autoescola.");
    }
    await this.assertUserLimit(tenant.id);

    const rawToken = newToken();
    const passwordHash = await hash(newToken(), this.bcryptRounds);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const result = await this.prisma.$transaction(async (transaction) => {
      let user = await transaction.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          passwordSetAt: true,
        },
      });
      if (user && !user.active) {
        throw new ConflictException(
          "A conta global deste e-mail está desativada.",
        );
      }
      if (!user) {
        user = await transaction.user.create({
          data: {
            name: input.name.trim(),
            email,
            passwordHash,
            passwordSetAt: null,
            communicationSettings: { create: {} },
          },
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            passwordSetAt: true,
          },
        });
      }

      await this.linkOperationalProfile(
        transaction,
        tenant.id,
        user.id,
        email,
        input.role,
        input.profileId,
      );

      const member = await transaction.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: { role: input.role, active: true },
        create: {
          tenantId: tenant.id,
          userId: user.id,
          role: input.role,
        },
        select: memberSelect,
      });

      let setupToken: string | null = null;
      if (!user.passwordSetAt) {
        await transaction.userCredentialToken.updateMany({
          where: {
            userId: user.id,
            tenantId: tenant.id,
            type: UserCredentialTokenType.INVITATION,
            consumedAt: null,
          },
          data: { consumedAt: new Date() },
        });
        await transaction.userCredentialToken.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            type: UserCredentialTokenType.INVITATION,
            tokenHash: tokenHash(rawToken),
            expiresAt,
          },
        });
        setupToken = rawToken;
      }

      await transaction.auditLog.create({
        data: {
          tenantId: tenant.id,
          entityType: "Membership",
          entityId: member.id,
          action: existingMembership
            ? "MEMBERSHIP_REACTIVATED"
            : "MEMBERSHIP_INVITED",
          actorUserId,
          after: {
            role: member.role,
            active: member.active,
            userId: member.user.id,
            email: member.user.email,
          },
        },
      });

      return { member, setupToken };
    });

    const emailSent = result.setupToken
      ? await this.sendCredentialEmail({
          token: result.setupToken,
          type: UserCredentialTokenType.INVITATION,
          name: result.member.user.name,
          email: result.member.user.email,
          tenantName: tenant.name,
        })
      : await this.sendMembershipAddedEmail(
          result.member.user.name,
          result.member.user.email,
          tenant.name,
        );

    return { member: this.toSummary(result.member), emailSent };
  }

  async updateTeamMember(
    tenant: CurrentTenantContext,
    actorUserId: string,
    membershipId: string,
    input: UpdateTeamMemberInput,
  ): Promise<TeamMemberSummary> {
    if (input.role === undefined && input.active === undefined) {
      throw new BadRequestException("Informe role ou active.");
    }
    if (input.role) this.assertCanAssignRole(tenant.role, input.role);

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.membership.findFirst({
        where: { id: membershipId, tenantId: tenant.id },
        select: memberSelect,
      });
      if (!current) throw new NotFoundException("Membro não encontrado.");

      const removesActiveOwner =
        current.role === OWNER_ROLE &&
        current.active &&
        (input.active === false ||
          (input.role !== undefined && input.role !== "TENANT_OWNER"));
      if (removesActiveOwner) {
        const otherOwners = await transaction.membership.count({
          where: {
            tenantId: tenant.id,
            role: OWNER_ROLE,
            active: true,
            id: { not: current.id },
          },
        });
        if (otherOwners === 0) {
          throw new ConflictException(
            "A autoescola deve manter ao menos um proprietário ativo.",
          );
        }
      }

      if (input.role === "INSTRUCTOR" || input.role === "STUDENT") {
        await this.assertExistingOperationalProfile(
          transaction,
          tenant.id,
          current.user.id,
          input.role,
        );
      }

      const updated = await transaction.membership.update({
        where: { id: current.id },
        data: {
          role: input.role,
          active: input.active,
        },
        select: memberSelect,
      });
      if (input.role !== undefined || input.active === false) {
        await transaction.refreshSession.updateMany({
          where: { membershipId: current.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await transaction.auditLog.create({
        data: {
          tenantId: tenant.id,
          entityType: "Membership",
          entityId: current.id,
          action: "MEMBERSHIP_UPDATED",
          actorUserId,
          before: { role: current.role, active: current.active },
          after: { role: updated.role, active: updated.active },
        },
      });
      return this.toSummary(updated);
    });
  }

  async resendInvitation(
    tenant: CurrentTenantContext,
    membershipId: string,
  ): Promise<{ emailSent: boolean }> {
    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId: tenant.id, active: true },
      select: memberSelect,
    });
    if (!member) throw new NotFoundException("Membro não encontrado.");
    if (member.user.passwordSetAt) {
      throw new ConflictException(
        "Este usuário já concluiu o primeiro acesso.",
      );
    }
    const token = await this.issueCredentialToken(
      member.user.id,
      tenant.id,
      UserCredentialTokenType.INVITATION,
      72 * 60,
    );
    return {
      emailSent: await this.sendCredentialEmail({
        token,
        type: UserCredentialTokenType.INVITATION,
        name: member.user.name,
        email: member.user.email,
        tenantName: tenant.name,
      }),
    };
  }

  async revokeMemberSessions(
    tenantId: string,
    actorUserId: string,
    membershipId: string,
  ): Promise<ActionMessage> {
    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException("Membro não encontrado.");
    await this.prisma.$transaction([
      this.prisma.refreshSession.updateMany({
        where: { membershipId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          entityType: "Membership",
          entityId: membershipId,
          action: "MEMBERSHIP_SESSIONS_REVOKED",
          actorUserId,
        },
      }),
    ]);
    return { message: "Sessões revogadas." };
  }

  async inspectCredentialToken(token: string): Promise<CredentialTokenInfo> {
    const record = await this.findUsableToken(token);
    return {
      type: record.type,
      email: record.user.email,
      name: record.user.name,
      tenant: record.tenant,
      expiresAt: record.expiresAt.toISOString(),
    };
  }

  async setCredentialPassword(
    input: SetCredentialPasswordInput,
  ): Promise<ActionMessage> {
    const record = await this.findUsableToken(input.token);
    const passwordHash = await hash(input.password, this.bcryptRounds);
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.userCredentialToken.updateMany({
        where: {
          id: record.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Este link já foi utilizado ou expirou.");
      }
      await transaction.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await transaction.userCredentialToken.updateMany({
        where: { userId: record.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await transaction.refreshSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { message: "Senha definida. Você já pode entrar no Prumo." };
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<ActionMessage> {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findFirst({
      where: { email, active: true },
      select: { id: true, name: true, email: true },
    });
    if (user) {
      const token = await this.issueCredentialToken(
        user.id,
        null,
        UserCredentialTokenType.PASSWORD_RESET,
        60,
      );
      await this.sendCredentialEmail({
        token,
        type: UserCredentialTokenType.PASSWORD_RESET,
        name: user.name,
        email: user.email,
      });
    }
    return {
      message:
        "Se o e-mail estiver cadastrado, você receberá as instruções em instantes.",
    };
  }

  async changePassword(
    actor: AuthenticatedPrincipal,
    input: ChangePasswordInput,
  ): Promise<ActionMessage> {
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException(
        "A nova senha deve ser diferente da senha atual.",
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { passwordHash: true },
    });
    if (!user || !(await compare(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Senha atual inválida.");
    }
    const passwordHash = await hash(input.newPassword, this.bcryptRounds);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: actor.id },
        data: { passwordHash, passwordSetAt: new Date() },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: actor.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.userCredentialToken.updateMany({
        where: { userId: actor.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
    ]);
    return {
      message: "Senha alterada. Entre novamente nos seus dispositivos.",
    };
  }

  async issuePlatformOwnerInvitation(
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    const [user, tenant] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, passwordSetAt: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
    ]);
    if (!user || !tenant || user.passwordSetAt) return false;
    const token = await this.issueCredentialToken(
      user.id,
      tenantId,
      UserCredentialTokenType.INVITATION,
      72 * 60,
    );
    return this.sendCredentialEmail({
      token,
      type: UserCredentialTokenType.INVITATION,
      name: user.name,
      email: user.email,
      tenantName: tenant.name,
    });
  }

  private async issueCredentialToken(
    userId: string,
    tenantId: string | null,
    type: UserCredentialTokenType,
    expiresInMinutes: number,
  ): Promise<string> {
    const token = newToken();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.userCredentialToken.updateMany({
        where: { userId, tenantId, type, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await transaction.userCredentialToken.create({
        data: {
          userId,
          tenantId,
          type,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
        },
      });
    });
    return token;
  }

  private findUsableToken(token: string) {
    return this.prisma.userCredentialToken
      .findFirst({
        where: {
          tokenHash: tokenHash(token),
          consumedAt: null,
          expiresAt: { gt: new Date() },
          user: { active: true },
          OR: [
            { tenantId: null },
            { tenant: { status: { in: AVAILABLE_TENANT_STATUSES } } },
          ],
        },
        include: {
          user: { select: { name: true, email: true } },
          tenant: { select: { id: true, name: true } },
        },
      })
      .then((record) => {
        if (!record) {
          throw new NotFoundException("Link inválido ou expirado.");
        }
        return record;
      });
  }

  private async sendCredentialEmail(input: {
    token: string;
    type: UserCredentialTokenType;
    name: string;
    email: string;
    tenantName?: string;
  }): Promise<boolean> {
    const invitation = input.type === UserCredentialTokenType.INVITATION;
    const actionUrl = `${this.webUrl}/setup-password?token=${encodeURIComponent(input.token)}`;
    const subject = invitation
      ? `Prumo | Convite para ${input.tenantName ?? "sua autoescola"}`
      : "Prumo | Redefinição de senha";
    const context = invitation
      ? `Você recebeu acesso à ${escapeHtml(input.tenantName ?? "autoescola")}.`
      : "Recebemos uma solicitação para redefinir sua senha.";
    try {
      await this.email.send({
        to: input.email,
        subject,
        html: `<p>Olá, ${escapeHtml(input.name)}.</p><p>${context}</p><p><a href="${actionUrl}">Definir nova senha</a></p><p>Este link é temporário e pode ser usado uma única vez.</p>`,
        text: `Olá, ${input.name}. ${context.replaceAll(/<[^>]+>/g, "")} Acesse: ${actionUrl}`,
      });
      return true;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: "identity.email.failed",
          type: input.type,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      return false;
    }
  }

  private async sendMembershipAddedEmail(
    name: string,
    email: string,
    tenantName: string,
  ): Promise<boolean> {
    try {
      await this.email.send({
        to: email,
        subject: `Prumo | Acesso à ${tenantName}`,
        html: `<p>Olá, ${escapeHtml(name)}.</p><p>Seu acesso à ${escapeHtml(tenantName)} foi liberado.</p><p><a href="${this.webUrl}">Entrar no Prumo</a></p>`,
        text: `Olá, ${name}. Seu acesso à ${tenantName} foi liberado. Acesse: ${this.webUrl}`,
      });
      return true;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: "identity.membership-email.failed",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      return false;
    }
  }

  private async assertUserLimit(tenantId: string): Promise<void> {
    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: {
        tenantId,
        status: {
          in: [
            TenantSubscriptionStatus.TRIALING,
            TenantSubscriptionStatus.ACTIVE,
          ],
        },
      },
      select: { plan: { select: { maxUsers: true } } },
      orderBy: { createdAt: "desc" },
    });
    const limit = subscription?.plan.maxUsers;
    if (limit === null || limit === undefined) return;
    const activeUsers = await this.prisma.membership.count({
      where: { tenantId, active: true },
    });
    if (activeUsers >= limit) {
      throw new ConflictException("Limite do plano atingido para usuários.");
    }
  }

  private assertCanAssignRole(
    actorRole: MembershipRole,
    targetRole: MembershipRole,
  ): void {
    if (targetRole === "TENANT_OWNER" && actorRole !== "TENANT_OWNER") {
      throw new ForbiddenException(
        "Somente um proprietário pode conceder esse papel.",
      );
    }
  }

  private async linkOperationalProfile(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    email: string,
    role: MembershipRole,
    profileId?: string,
  ): Promise<void> {
    if (role === "INSTRUCTOR") {
      const profile = await transaction.instructor.findFirst({
        where: {
          tenantId,
          ...(profileId
            ? { id: profileId }
            : { email: { equals: email, mode: "insensitive" } }),
        },
        select: { id: true, userId: true },
      });
      if (!profile) {
        throw new ConflictException(
          "Cadastre o instrutor com o mesmo e-mail antes de liberar o acesso.",
        );
      }
      if (profile.userId && profile.userId !== userId) {
        throw new ConflictException("Este instrutor já possui outro usuário.");
      }
      await transaction.instructor.update({
        where: { id: profile.id },
        data: { userId },
      });
    }
    if (role === "STUDENT") {
      const profile = await transaction.student.findFirst({
        where: {
          tenantId,
          ...(profileId
            ? { id: profileId }
            : { email: { equals: email, mode: "insensitive" } }),
        },
        select: { id: true, userId: true },
      });
      if (!profile) {
        throw new ConflictException(
          "Cadastre o aluno com o mesmo e-mail antes de liberar o acesso.",
        );
      }
      if (profile.userId && profile.userId !== userId) {
        throw new ConflictException("Este aluno já possui outro usuário.");
      }
      await transaction.student.update({
        where: { id: profile.id },
        data: { userId },
      });
    }
  }

  private async assertExistingOperationalProfile(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    role: "INSTRUCTOR" | "STUDENT",
  ): Promise<void> {
    const profile =
      role === "INSTRUCTOR"
        ? await transaction.instructor.findFirst({
            where: { tenantId, userId },
            select: { id: true },
          })
        : await transaction.student.findFirst({
            where: { tenantId, userId },
            select: { id: true },
          });
    if (!profile) {
      throw new ConflictException(
        `Vincule o usuário a um ${role === "INSTRUCTOR" ? "instrutor" : "aluno"} antes de alterar o papel.`,
      );
    }
  }

  private toSummary(member: SelectedMember): TeamMemberSummary {
    return {
      id: member.id,
      role: member.role,
      active: member.active,
      invitationPending: !member.user.passwordSetAt,
      createdAt: member.createdAt.toISOString(),
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
      },
    };
  }
}
