import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  CompleteExamDto,
  CreateExamDto,
  ExamQueryDto,
  ProcessReasonDto,
  RescheduleExamDto,
} from "./dto/process.dto";
import { ExamsService } from "./exams.service";

@ApiTags("exams")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("exams")
export class ExamsController {
  constructor(private readonly service: ExamsService) {}

  @Post()
  @Permissions("exams.create")
  @ApiOperation({ summary: "Agenda uma nova tentativa de exame." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateExamDto,
  ) {
    return this.service.create(tenant.id, user.id, input);
  }

  @Get()
  @Permissions("exams.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: ExamQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("exams.read")
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Post(":id/confirm")
  @Permissions("exams.confirm")
  confirm(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.confirm(tenant.id, user.id, id);
  }

  @Post(":id/complete")
  @Permissions("exams.complete")
  complete(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CompleteExamDto,
  ) {
    return this.service.complete(tenant.id, user.id, id, input);
  }

  @Post(":id/cancel")
  @Permissions("exams.cancel")
  cancel(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ProcessReasonDto,
  ) {
    return this.service.cancel(tenant.id, user.id, id, input);
  }

  @Post(":id/reschedule")
  @Permissions("exams.reschedule")
  reschedule(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RescheduleExamDto,
  ) {
    return this.service.reschedule(tenant.id, user.id, id, input);
  }

  @Post(":id/no-show")
  @Permissions("exams.complete")
  noShow(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.noShow(tenant.id, user.id, id);
  }
}
