import {
  Body,
  Controller,
  Delete,
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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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
import {
  CreateScheduleBlockDto,
  ScheduleBlockQueryDto,
  UpdateScheduleBlockDto,
} from "./dto/schedule.dto";
import { ScheduleBlocksService } from "./schedule-blocks.service";

@ApiTags("schedule-blocks")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("schedule-blocks")
export class ScheduleBlocksController {
  constructor(private readonly service: ScheduleBlocksService) {}

  @Post()
  @Permissions("schedule-blocks.manage")
  @ApiOperation({ summary: "Bloqueia um recurso da agenda." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateScheduleBlockDto,
  ) {
    return this.service.create(tenant.id, user.id, input);
  }

  @Get()
  @Permissions("schedule-blocks.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: ScheduleBlockQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("schedule-blocks.read")
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("schedule-blocks.manage")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateScheduleBlockDto,
  ) {
    return this.service.update(tenant.id, user.id, id, input);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions("schedule-blocks.manage")
  async remove(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.service.remove(tenant.id, user.id, id);
  }
}
