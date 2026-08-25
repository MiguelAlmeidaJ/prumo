import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { PlatformRole } from "@prumo/database";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type {
  AuthenticatedPrincipal,
  CurrentSupportSessionContext,
} from "../auth/auth.types";
import {
  CurrentPlatformUser,
  CurrentSupportSession,
  PlatformPermissions,
  PlatformRoles,
} from "./platform.decorators";
import {
  AuditQueryDto,
  ChangePlatformRoleDto,
  CreatePlatformPlanDto,
  CreateSubscriptionDto,
  CreateTenantDto,
  CriticalActionDto,
  EndSupportSessionDto,
  ExtendTrialDto,
  PlanListQueryDto,
  ReasonDto,
  StartSupportSessionDto,
  SubscriptionActionDto,
  SubscriptionListQueryDto,
  SupportSessionQueryDto,
  TenantListQueryDto,
  UpdatePlatformPlanDto,
  UpdateSettingsDto,
  UpdateSubscriptionDto,
  UpdateTenantDto,
  UserListQueryDto,
} from "./platform.dto";
import {
  PlatformPermissionsGuard,
  PlatformRateLimitGuard,
  PlatformRolesGuard,
  SupportSessionGuard,
} from "./platform.guards";
import { PlatformService, type RequestAuditContext } from "./platform.service";

type HttpRequest = {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
};

function requestAuditContext(request: HttpRequest): RequestAuditContext {
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: request.ip,
    userAgent: typeof userAgent === "string" ? userAgent : undefined,
  };
}

@ApiTags("platform")
@ApiBearerAuth("bearer")
@Controller("platform")
@UseGuards(
  JwtAuthGuard,
  PlatformRateLimitGuard,
  PlatformRolesGuard,
  PlatformPermissionsGuard,
)
@PlatformRoles(
  PlatformRole.PLATFORM_SUPPORT,
  PlatformRole.PLATFORM_ADMIN,
  PlatformRole.PLATFORM_OWNER,
)
export class PlatformController {
  constructor(private readonly service: PlatformService) {}

  @Get("dashboard")
  @PlatformPermissions("platform.dashboard.read")
  @ApiOperation({ summary: "Retorna métricas globais agregadas." })
  dashboard(@Query("from") from?: string, @Query("to") to?: string) {
    return this.service.dashboard(from, to);
  }

  @Get("tenants")
  @PlatformPermissions("platform.tenants.read")
  listTenants(@Query() query: TenantListQueryDto) {
    return this.service.listTenants(query);
  }

  @Post("tenants")
  @PlatformPermissions("platform.tenants.create")
  createTenant(
    @Body() input: CreateTenantDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.createTenant(
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Get("tenants/:tenantId/support-context")
  @UseGuards(SupportSessionGuard)
  @PlatformPermissions("platform.support.read")
  @ApiHeader({
    name: "x-support-session-id",
    required: true,
    description: "Sessão temporária e auditável de suporte.",
  })
  supportContext(
    @Param("tenantId") tenantId: string,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @CurrentSupportSession() session: CurrentSupportSessionContext,
    @Req() request: HttpRequest,
  ) {
    return this.service.supportContext(
      tenantId,
      actor,
      session.id,
      requestAuditContext(request),
    );
  }

  @Get("tenants/:id/metrics")
  @PlatformPermissions("platform.tenants.metrics")
  tenantMetrics(
    @Param("id") id: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.tenantMetrics(id, from, to);
  }

  @Get("tenants/:id/entitlements")
  @PlatformPermissions("platform.tenants.metrics")
  entitlements(@Param("id") id: string) {
    return this.service.entitlementUsage(id);
  }

  @Get("tenants/:id/features/:feature")
  @PlatformPermissions("platform.tenants.metrics")
  feature(@Param("id") id: string, @Param("feature") feature: string) {
    return this.service.featureEnabled(id, feature);
  }

  @Get("tenants/:id")
  @PlatformPermissions("platform.tenants.read")
  getTenant(@Param("id") id: string) {
    return this.service.getTenant(id);
  }

  @Patch("tenants/:id")
  @PlatformPermissions("platform.tenants.update")
  updateTenant(
    @Param("id") id: string,
    @Body() input: UpdateTenantDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.updateTenant(
      id,
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Post("tenants/:id/activate")
  @PlatformPermissions("platform.tenants.status")
  activateTenant(
    @Param("id") id: string,
    @Body() input: CriticalActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.tenantStatus(id, "activate", input, actor, request);
  }

  @Post("tenants/:id/suspend")
  @PlatformPermissions("platform.tenants.status")
  suspendTenant(
    @Param("id") id: string,
    @Body() input: CriticalActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.tenantStatus(id, "suspend", input, actor, request);
  }

  @Post("tenants/:id/reactivate")
  @PlatformPermissions("platform.tenants.status")
  reactivateTenant(
    @Param("id") id: string,
    @Body() input: CriticalActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.tenantStatus(id, "reactivate", input, actor, request);
  }

  @Post("tenants/:id/cancel")
  @PlatformPermissions("platform.tenants.status")
  cancelTenant(
    @Param("id") id: string,
    @Body() input: CriticalActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.tenantStatus(id, "cancel", input, actor, request);
  }

  @Post("tenants/:id/archive")
  @PlatformPermissions("platform.tenants.status")
  archiveTenant(
    @Param("id") id: string,
    @Body() input: CriticalActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.tenantStatus(id, "archive", input, actor, request);
  }

  @Post("tenants/:id/extend-trial")
  @PlatformPermissions("platform.tenants.status")
  extendTrial(
    @Param("id") id: string,
    @Body() input: ExtendTrialDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.extendTrial(
      id,
      input.days,
      input.reason,
      input.currentPassword,
      actor,
      requestAuditContext(request),
    );
  }

  @Get("users")
  @PlatformPermissions("platform.users.read")
  listUsers(@Query() query: UserListQueryDto) {
    return this.service.listUsers(query);
  }

  @Get("users/:id")
  @PlatformPermissions("platform.users.read")
  getUser(@Param("id") id: string) {
    return this.service.getUser(id);
  }

  @Post("users/:id/enable")
  @PlatformPermissions("platform.users.manage")
  enableUser(
    @Param("id") id: string,
    @Body() input: ReasonDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.setUserActive(
      id,
      true,
      input.reason,
      actor,
      requestAuditContext(request),
    );
  }

  @Post("users/:id/disable")
  @PlatformPermissions("platform.users.manage")
  disableUser(
    @Param("id") id: string,
    @Body() input: CriticalActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.setUserActive(
      id,
      false,
      input.reason,
      actor,
      requestAuditContext(request),
      input.currentPassword,
    );
  }

  @Post("users/:id/reset-sessions")
  @PlatformPermissions("platform.users.manage")
  resetSessions(
    @Param("id") id: string,
    @Body() input: CriticalActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.resetUserSessions(
      id,
      input.reason,
      actor,
      requestAuditContext(request),
      input.currentPassword,
    );
  }

  @Patch("users/:id/platform-role")
  @PlatformPermissions("platform.users.roles")
  changeRole(
    @Param("id") id: string,
    @Body() input: ChangePlatformRoleDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.changePlatformRole(
      id,
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Post("support-sessions")
  @PlatformPermissions("platform.support.start")
  startSupport(
    @Body() input: StartSupportSessionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.startSupportSession(
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Get("support-sessions")
  @PlatformPermissions("platform.support.read")
  listSupport(@Query() query: SupportSessionQueryDto) {
    return this.service.listSupportSessions(query);
  }

  @Get("support-sessions/:id")
  @PlatformPermissions("platform.support.read")
  getSupport(@Param("id") id: string) {
    return this.service.getSupportSession(id);
  }

  @Post("support-sessions/:id/end")
  @PlatformPermissions("platform.support.end")
  endSupport(
    @Param("id") id: string,
    @Body() input: EndSupportSessionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.closeSupportSession(
      id,
      "ENDED",
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Post("support-sessions/:id/revoke")
  @PlatformPermissions("platform.support.end")
  @PlatformRoles(PlatformRole.PLATFORM_ADMIN, PlatformRole.PLATFORM_OWNER)
  revokeSupport(
    @Param("id") id: string,
    @Body() input: EndSupportSessionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.closeSupportSession(
      id,
      "REVOKED",
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Get("plans")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.plans.read")
  listPlans(@Query() query: PlanListQueryDto) {
    return this.service.listPlans(query);
  }

  @Post("plans")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.plans.manage")
  createPlan(
    @Body() input: CreatePlatformPlanDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.createPlan(input, actor, requestAuditContext(request));
  }

  @Get("plans/:id")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.plans.read")
  getPlan(@Param("id") id: string) {
    return this.service.getPlan(id);
  }

  @Patch("plans/:id")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.plans.manage")
  updatePlan(
    @Param("id") id: string,
    @Body() input: UpdatePlatformPlanDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.updatePlan(
      id,
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Get("subscriptions")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.subscriptions.read")
  listSubscriptions(@Query() query: SubscriptionListQueryDto) {
    return this.service.listSubscriptions(query);
  }

  @Post("subscriptions")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.subscriptions.manage")
  createSubscription(
    @Body() input: CreateSubscriptionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.createSubscription(
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Get("subscriptions/:id")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.subscriptions.read")
  getSubscription(@Param("id") id: string) {
    return this.service.getSubscription(id);
  }

  @Patch("subscriptions/:id")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.subscriptions.manage")
  updateSubscription(
    @Param("id") id: string,
    @Body() input: UpdateSubscriptionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.updateSubscription(
      id,
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Post("subscriptions/:id/suspend")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.subscriptions.manage")
  suspendSubscription(
    @Param("id") id: string,
    @Body() input: SubscriptionActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.changeSubscriptionStatus(
      id,
      "suspend",
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Post("subscriptions/:id/reactivate")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.subscriptions.manage")
  reactivateSubscription(
    @Param("id") id: string,
    @Body() input: SubscriptionActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.changeSubscriptionStatus(
      id,
      "reactivate",
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Post("subscriptions/:id/cancel")
  @PlatformRoles(PlatformRole.PLATFORM_OWNER)
  @PlatformPermissions("platform.subscriptions.manage")
  cancelSubscription(
    @Param("id") id: string,
    @Body() input: SubscriptionActionDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.changeSubscriptionStatus(
      id,
      "cancel",
      input,
      actor,
      requestAuditContext(request),
    );
  }

  @Get("audit")
  @PlatformPermissions("platform.audit.read")
  listAudit(@Query() query: AuditQueryDto) {
    return this.service.listAudit(query);
  }

  @Get("health")
  @PlatformPermissions("platform.health.read")
  health() {
    return this.service.health();
  }

  @Get("settings")
  @PlatformPermissions("platform.settings.manage")
  settings() {
    return this.service.listSettings();
  }

  @Patch("settings")
  @PlatformPermissions("platform.settings.manage")
  updateSettings(
    @Body() input: UpdateSettingsDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.updateSettings(
      input,
      actor,
      requestAuditContext(request),
    );
  }

  private tenantStatus(
    id: string,
    action: "activate" | "suspend" | "reactivate" | "cancel" | "archive",
    input: CriticalActionDto,
    actor: AuthenticatedPrincipal,
    request: HttpRequest,
  ) {
    return this.service.changeTenantStatus(
      id,
      action,
      input.reason,
      input.currentPassword,
      actor,
      requestAuditContext(request),
    );
  }
}
