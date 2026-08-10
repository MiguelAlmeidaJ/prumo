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
  AddTheoreticalStudentDto,
  AttendanceDto,
  CancellationDto,
  CreateTheoreticalClassDto,
  LessonQueryDto,
  UpdateTheoreticalClassDto,
} from "./dto/schedule.dto";
import { TheoreticalClassesService } from "./theoretical-classes.service";

@ApiTags("theoretical-classes")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("theoretical-classes")
export class TheoreticalClassesController {
  constructor(private readonly service: TheoreticalClassesService) {}

  @Post()
  @Permissions("theoretical-classes.create")
  @ApiOperation({ summary: "Cria uma turma teórica sem conflitos." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTheoreticalClassDto,
  ) {
    return this.service.create(tenant.id, user.id, user.permissions, input);
  }

  @Get()
  @Permissions("theoretical-classes.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: LessonQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("theoretical-classes.read")
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("theoretical-classes.update")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateTheoreticalClassDto,
  ) {
    return this.service.update(tenant.id, user.id, user.permissions, id, input);
  }

  @Post(":id/students")
  @Permissions("theoretical-classes.participants")
  addStudent(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: AddTheoreticalStudentDto,
  ) {
    return this.service.addStudent(tenant.id, user.id, id, input);
  }

  @Delete(":id/students/:studentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions("theoretical-classes.participants")
  async removeStudent(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("studentId", ParseUUIDPipe) studentId: string,
  ) {
    await this.service.removeStudent(tenant.id, user.id, id, studentId);
  }

  @Patch(":id/students/:studentId/attendance")
  @Permissions("theoretical-classes.participants")
  attendance(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("studentId", ParseUUIDPipe) studentId: string,
    @Body() input: AttendanceDto,
  ) {
    return this.service.attendance(tenant.id, user.id, id, studentId, input);
  }

  @Post(":id/confirm")
  @Permissions("theoretical-classes.status")
  confirm(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.confirm(tenant.id, user.id, id);
  }

  @Post(":id/start")
  @Permissions("theoretical-classes.status")
  start(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.start(tenant.id, user.id, id);
  }

  @Post(":id/complete")
  @Permissions("theoretical-classes.status")
  complete(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.complete(tenant.id, user.id, id);
  }

  @Post(":id/cancel")
  @Permissions("theoretical-classes.status")
  cancel(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CancellationDto,
  ) {
    return this.service.cancel(tenant.id, user.id, id, input);
  }
}
