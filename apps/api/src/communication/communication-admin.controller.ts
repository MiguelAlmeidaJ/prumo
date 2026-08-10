import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type {
  AuthenticatedUser,
  CurrentTenantContext,
} from "../auth/auth.types";
import { CurrentTenant } from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { CommunicationService } from "./communication.service";
import {
  CreateTemplateDto,
  DeliveryQueryDto,
  EventQueryDto,
  TemplateQueryDto,
  TestEmailDto,
  UpdateTemplateDto,
  UpdateReminderRuleDto,
} from "./dto/communication.dto";

@ApiTags("communication")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("communication")
export class CommunicationAdminController {
  constructor(private readonly service: CommunicationService) {}

  @Get("templates")
  @Permissions("communication.templates.read")
  templates(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: TemplateQueryDto,
  ) {
    return this.service.templates(tenant.id, query);
  }

  @Post("templates")
  @Permissions("communication.templates.manage")
  createTemplate(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTemplateDto,
  ) {
    return this.service.createTemplate(tenant.id, user.id, input);
  }

  @Get("templates/:id")
  @Permissions("communication.templates.read")
  template(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.template(tenant.id, id);
  }

  @Patch("templates/:id")
  @Permissions("communication.templates.manage")
  updateTemplate(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateTemplateDto,
  ) {
    return this.service.updateTemplate(tenant.id, user.id, id, input);
  }

  @Get("deliveries")
  @Permissions("communication.history.read")
  deliveries(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: DeliveryQueryDto,
  ) {
    return this.service.deliveries(tenant.id, query);
  }

  @Get("deliveries/:id")
  @Permissions("communication.history.read")
  delivery(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.delivery(tenant.id, id);
  }

  @Post("deliveries/:id/retry")
  @Permissions("communication.history.read")
  retry(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.retryDelivery(tenant.id, user.id, id);
  }

  @Get("events")
  @Permissions("communication.events.read")
  events(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: EventQueryDto,
  ) {
    return this.service.events(tenant.id, query);
  }

  @Get("events/:id")
  @Permissions("communication.events.read")
  event(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.event(tenant.id, id);
  }

  @Post("events/:id/reprocess")
  @Permissions("communication.events.reprocess")
  reprocess(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.markEventForReprocessing(tenant.id, user.id, id);
  }

  @Post("test/email")
  @Permissions("communication.settings.manage")
  testEmail(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Body() input: TestEmailDto,
  ) {
    if (!this.service.testEndpointsAllowed()) {
      throw new ForbiddenException("Endpoint de teste indisponível.");
    }
    return this.service.sendTestEmail(tenant.id, input.to, input.subject);
  }

  @Get("reminder-rules")
  @Permissions("communication.settings.manage")
  reminderRules(@CurrentTenant() tenant: CurrentTenantContext) {
    return this.service.reminderRules(tenant.id);
  }

  @Patch("reminder-rules/:id")
  @Permissions("communication.settings.manage")
  updateReminderRule(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateReminderRuleDto,
  ) {
    return this.service.updateReminderRule(tenant.id, user.id, id, input);
  }
}
