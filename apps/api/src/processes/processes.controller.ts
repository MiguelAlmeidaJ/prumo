import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { PrismaService } from "../database/prisma.service";
import {
  CreateLicenseProcessDto,
  ProcessReasonDto,
  UpdateLicenseProcessDto,
  UpdateProcessStageDto,
} from "./dto/process.dto";
import { ProcessesService } from "./processes.service";

@ApiTags("license-processes")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller()
export class ProcessesController {
  constructor(
    private readonly service: ProcessesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("license-categories")
  @Permissions("processes.read")
  @ApiOperation({ summary: "Lista categorias globais de habilitação." })
  categories() {
    return this.prisma.licenseCategory.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
    });
  }

  @Post("students/:studentId/processes")
  @Permissions("processes.create")
  @ApiOperation({ summary: "Abre um processo para o aluno no tenant ativo." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("studentId", ParseUUIDPipe) studentId: string,
    @Body() input: CreateLicenseProcessDto,
  ) {
    return this.service.create(tenant.id, user.id, studentId, input);
  }

  @Get("students/:studentId/processes")
  @Permissions("processes.read")
  listForStudent(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("studentId", ParseUUIDPipe) studentId: string,
  ) {
    return this.service.listForStudent(tenant.id, studentId);
  }

  @Get("processes/:id")
  @Permissions("processes.read")
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Patch("processes/:id")
  @Permissions("processes.update")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateLicenseProcessDto,
  ) {
    return this.service.update(tenant.id, user.id, id, input);
  }

  @Post("processes/:id/start")
  @Permissions("processes.start")
  start(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.start(tenant.id, user.id, id);
  }

  @Post("processes/:id/suspend")
  @Permissions("processes.suspend")
  suspend(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ProcessReasonDto,
  ) {
    return this.service.suspend(tenant.id, user.id, id, input);
  }

  @Post("processes/:id/resume")
  @Permissions("processes.suspend")
  resume(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.resume(tenant.id, user.id, id);
  }

  @Post("processes/:id/complete")
  @Permissions("processes.complete")
  complete(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.complete(tenant.id, user.id, id);
  }

  @Post("processes/:id/cancel")
  @Permissions("processes.cancel")
  cancel(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ProcessReasonDto,
  ) {
    return this.service.cancel(tenant.id, user.id, id, input);
  }

  @Get("processes/:id/progress")
  @Permissions("processes.read")
  progress(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.progress(tenant.id, id);
  }

  @Get("processes/:id/timeline")
  @Permissions("processes.read")
  timeline(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.timeline(tenant.id, id);
  }

  @Patch("processes/:id/stages/:stageId")
  @Permissions("process_stages.manage")
  updateStage(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("stageId", ParseUUIDPipe) stageId: string,
    @Body() input: UpdateProcessStageDto,
  ) {
    return this.service.updateStage(
      tenant.id,
      user.id,
      id,
      stageId,
      input,
    );
  }
}
