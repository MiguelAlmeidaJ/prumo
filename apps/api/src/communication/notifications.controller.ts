import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  NotificationQueryDto,
  RegisterPushTokenDto,
  UpdateCommunicationSettingsDto,
  UpdatePreferencesDto,
} from "./dto/communication.dto";

@ApiTags("notifications")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly service: CommunicationService) {}

  @Get("notifications")
  @Permissions("notifications.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.service.notifications(tenant.id, user.id, query);
  }

  @Get("notifications/unread-count")
  @Permissions("notifications.read")
  unreadCount(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.unreadCount(tenant.id, user.id);
  }

  @Get("notifications/:id")
  @Permissions("notifications.read")
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.notification(tenant.id, user.id, id);
  }

  @Post("notifications/:id/read")
  @Permissions("notifications.read")
  read(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.read(tenant.id, user.id, id);
  }

  @Post("notifications/read-all")
  @Permissions("notifications.read")
  readAll(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.readAll(tenant.id, user.id);
  }

  @Post("notifications/:id/archive")
  @Permissions("notifications.read")
  archive(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.archive(tenant.id, user.id, id);
  }

  @Get("communication/preferences")
  preferences(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.preferences(tenant.id, user.id);
  }

  @Put("communication/preferences")
  updatePreferences(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdatePreferencesDto,
  ) {
    return this.service.updatePreferences(tenant.id, user.id, input);
  }

  @Get("communication/settings")
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.service.settings(user.id);
  }

  @Put("communication/settings")
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateCommunicationSettingsDto,
  ) {
    return this.service.updateSettings(user.id, input);
  }

  @Post("devices/push-token")
  registerDevice(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: RegisterPushTokenDto,
  ) {
    return this.service.registerDevice(tenant.id, user.id, input);
  }

  @Get("devices")
  devices(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.devices(tenant.id, user.id);
  }

  @Delete("devices/:id")
  @HttpCode(204)
  async removeDevice(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.removeDevice(tenant.id, user.id, id);
  }
}
