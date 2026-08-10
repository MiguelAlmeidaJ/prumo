import type {
  ActionMessage,
  CredentialTokenInfo,
  TeamMemberInviteResult,
  TeamMemberSummary,
} from "@prumo/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type {
  AuthenticatedPrincipal,
  AuthenticatedUser,
  CurrentTenantContext,
} from "../auth/auth.types";
import { CurrentTenant } from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { AuthRateLimitGuard } from "../security/auth-rate-limit.guard";
import {
  ChangePasswordDto,
  CredentialTokenDto,
  ForgotPasswordDto,
  InviteTeamMemberDto,
  SetCredentialPasswordDto,
  UpdateTeamMemberDto,
} from "./identity.dto";
import { IdentityService } from "./identity.service";

@ApiTags("account-access")
@Controller("auth")
export class IdentityAccessController {
  constructor(private readonly identity: IdentityService) {}

  @Get("credential-token")
  @ApiOperation({ summary: "Valida um convite ou link de recuperação." })
  inspect(@Query() input: CredentialTokenDto): Promise<CredentialTokenInfo> {
    return this.identity.inspectCredentialToken(input.token);
  }

  @Post("set-password")
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Define a senha usando um link de uso único." })
  setPassword(@Body() input: SetCredentialPasswordDto): Promise<ActionMessage> {
    return this.identity.setCredentialPassword(input);
  }

  @Post("forgot-password")
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Solicita recuperação sem revelar a conta." })
  forgotPassword(@Body() input: ForgotPasswordDto): Promise<ActionMessage> {
    return this.identity.forgotPassword(input);
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Altera a senha do usuário autenticado." })
  changePassword(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() input: ChangePasswordDto,
  ): Promise<ActionMessage> {
    return this.identity.changePassword(user, input);
  }
}

@ApiTags("team")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("team")
export class TeamController {
  constructor(private readonly identity: IdentityService) {}

  @Get("members")
  @Permissions("memberships:manage")
  @ApiOperation({ summary: "Lista membros do tenant ativo." })
  @ApiOkResponse({ isArray: true })
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<TeamMemberSummary[]> {
    return this.identity.listTeam(tenant.id);
  }

  @Post("members")
  @Permissions("memberships:manage")
  @ApiOperation({ summary: "Convida ou reativa um membro no tenant ativo." })
  invite(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: InviteTeamMemberDto,
  ): Promise<TeamMemberInviteResult> {
    return this.identity.inviteTeamMember(tenant, user.id, input);
  }

  @Patch("members/:id")
  @Permissions("memberships:manage")
  @ApiOperation({ summary: "Altera papel ou atividade de um membro." })
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateTeamMemberDto,
  ): Promise<TeamMemberSummary> {
    return this.identity.updateTeamMember(tenant, user.id, id, input);
  }

  @Post("members/:id/resend-invitation")
  @HttpCode(HttpStatus.OK)
  @Permissions("memberships:manage")
  @ApiOperation({ summary: "Reemite o link de primeiro acesso." })
  resend(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ emailSent: boolean }> {
    return this.identity.resendInvitation(tenant, id);
  }

  @Post("members/:id/revoke-sessions")
  @HttpCode(HttpStatus.OK)
  @Permissions("memberships:manage")
  @ApiOperation({ summary: "Revoga sessões do membro no tenant ativo." })
  revokeSessions(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ActionMessage> {
    return this.identity.revokeMemberSessions(tenant.id, user.id, id);
  }
}
