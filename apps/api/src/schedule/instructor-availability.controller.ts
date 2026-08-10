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
  AvailabilityQueryDto,
  CreateInstructorAvailabilityDto,
  UpdateInstructorAvailabilityDto,
} from "./dto/schedule.dto";
import { InstructorAvailabilityService } from "./instructor-availability.service";

@ApiTags("instructor-availability")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("instructor-availabilities")
export class InstructorAvailabilityController {
  constructor(private readonly service: InstructorAvailabilityService) {}

  @Post()
  @Permissions("availability.manage")
  @ApiOperation({ summary: "Cria uma faixa semanal de disponibilidade." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateInstructorAvailabilityDto,
  ) {
    return this.service.create(tenant.id, user.id, input);
  }

  @Get()
  @Permissions("availability.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("availability.read")
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("availability.manage")
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateInstructorAvailabilityDto,
  ) {
    return this.service.update(tenant.id, user.id, id, input);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions("availability.manage")
  async remove(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.service.remove(tenant.id, user.id, id);
  }
}
