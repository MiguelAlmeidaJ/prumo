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
  CancellationDto,
  CreatePracticalLessonDto,
  LessonQueryDto,
  ReschedulePracticalLessonDto,
  UpdatePracticalLessonDto,
} from "./dto/schedule.dto";
import { PracticalLessonsService } from "./practical-lessons.service";

@ApiTags("practical-lessons")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("practical-lessons")
export class PracticalLessonsController {
  constructor(private readonly service: PracticalLessonsService) {}

  @Post()
  @Permissions("practical-lessons.create")
  @ApiOperation({ summary: "Agenda uma aula prática sem conflitos." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreatePracticalLessonDto,
  ) {
    return this.service.create(tenant.id, user.id, user.permissions, input);
  }

  @Get()
  @Permissions("practical-lessons.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: LessonQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("practical-lessons.read")
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("practical-lessons.update")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdatePracticalLessonDto,
  ) {
    return this.service.update(tenant.id, user.id, user.permissions, id, input);
  }

  @Post(":id/confirm")
  @Permissions("practical-lessons.status")
  confirm(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.confirm(tenant.id, user.id, id);
  }

  @Post(":id/start")
  @Permissions("practical-lessons.status")
  start(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.start(tenant.id, user.id, id);
  }

  @Post(":id/complete")
  @Permissions("practical-lessons.status")
  complete(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.complete(tenant.id, user.id, id);
  }

  @Post(":id/cancel")
  @Permissions("practical-lessons.status")
  cancel(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CancellationDto,
  ) {
    return this.service.cancel(tenant.id, user.id, id, input);
  }

  @Post(":id/reschedule")
  @Permissions("practical-lessons.status")
  reschedule(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ReschedulePracticalLessonDto,
  ) {
    return this.service.reschedule(
      tenant.id,
      user.id,
      user.permissions,
      id,
      input,
    );
  }

  @Post(":id/no-show")
  @Permissions("practical-lessons.status")
  noShow(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.noShow(tenant.id, user.id, id);
  }
}
