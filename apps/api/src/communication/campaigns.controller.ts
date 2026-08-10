import {
  Body,
  Controller,
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
import { CampaignsService } from "./campaigns.service";
import {
  CampaignQueryDto,
  CampaignRecipientQueryDto,
  CreateCampaignDto,
  ScheduleCampaignDto,
  UpdateCampaignDto,
} from "./dto/communication.dto";

@ApiTags("communication campaigns")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("communication/campaigns")
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Post()
  @Permissions("communication.campaigns.create")
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateCampaignDto,
  ) {
    return this.service.create(tenant.id, user.id, input);
  }

  @Get()
  @Permissions("communication.campaigns.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: CampaignQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("communication.campaigns.read")
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("communication.campaigns.create")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateCampaignDto,
  ) {
    return this.service.update(tenant.id, user.id, id, input);
  }

  @Post(":id/schedule")
  @Permissions("communication.campaigns.send")
  schedule(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ScheduleCampaignDto,
  ) {
    return this.service.schedule(
      tenant.id,
      user.id,
      id,
      new Date(input.scheduledAt),
    );
  }

  @Post(":id/send")
  @Permissions("communication.campaigns.send")
  send(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.send(tenant.id, user.id, id);
  }

  @Post(":id/cancel")
  @Permissions("communication.campaigns.cancel")
  cancel(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(tenant.id, user.id, id);
  }

  @Get(":id/recipients")
  @Permissions("communication.campaigns.read")
  recipients(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: CampaignRecipientQueryDto,
  ) {
    return this.service.recipients(tenant.id, id, query);
  }
}
