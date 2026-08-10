import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CurrentTenantContext } from "../auth/auth.types";
import { CurrentTenant } from "../auth/decorators/current-tenant.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import {
  ScheduleAvailabilityQueryDto,
  ScheduleQueryDto,
} from "./dto/schedule.dto";
import { ScheduleService } from "./schedule.service";

@ApiTags("schedule")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("schedule")
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Get()
  @Permissions("schedule.read")
  @ApiOperation({
    summary: "Lista aulas práticas, turmas teóricas e bloqueios.",
  })
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: ScheduleQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get("availability")
  @Permissions("schedule.read")
  @ApiOperation({
    summary: "Calcula horários disponíveis para os recursos informados.",
  })
  availability(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: ScheduleAvailabilityQueryDto,
  ) {
    return this.service.availability(tenant.id, query);
  }
}
