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
import { ClassroomsService } from "./classrooms.service";
import {
  ActiveStatusDto,
  ClassroomQueryDto,
  CreateClassroomDto,
  UpdateClassroomDto,
} from "./dto/schedule.dto";

@ApiTags("classrooms")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("classrooms")
export class ClassroomsController {
  constructor(private readonly service: ClassroomsService) {}

  @Post()
  @Permissions("classrooms.create")
  @ApiOperation({ summary: "Cria uma sala em uma unidade do tenant." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateClassroomDto,
  ) {
    return this.service.create(tenant.id, user.id, input);
  }

  @Get()
  @Permissions("classrooms.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: ClassroomQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("classrooms.read")
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("classrooms.update")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateClassroomDto,
  ) {
    return this.service.update(tenant.id, user.id, id, input);
  }

  @Patch(":id/status")
  @Permissions("classrooms.status")
  status(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ActiveStatusDto,
  ) {
    return this.service.status(tenant.id, user.id, id, input);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions("classrooms.delete")
  async remove(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.service.remove(tenant.id, user.id, id);
  }
}
