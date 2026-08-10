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
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { CurrentTenantContext } from "../auth/auth.types";
import { CurrentTenant } from "../auth/decorators/current-tenant.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { RegistryStatusDto } from "../common/dto/registry-status.dto";
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleListResponseDto,
  VehicleResponseDto,
} from "./dto/vehicle.dto";
import { VehiclesService } from "./vehicles.service";

@ApiTags("vehicles")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  @Post()
  @Permissions("vehicles.create")
  @ApiOperation({ summary: "Cadastra um veículo no tenant ativo." })
  @ApiCreatedResponse({ type: VehicleResponseDto })
  @ApiConflictResponse({ description: "Placa ou Renavam duplicado." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Body() input: CreateVehicleDto,
  ) {
    return this.service.create(tenant.id, input);
  }

  @Get()
  @Permissions("vehicles.read")
  @ApiOperation({ summary: "Lista e busca veículos do tenant ativo." })
  @ApiOkResponse({ type: VehicleListResponseDto })
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("vehicles.read")
  @ApiOperation({ summary: "Obtém um veículo do tenant ativo." })
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiNotFoundResponse()
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("vehicles.update")
  @ApiOperation({ summary: "Atualiza um veículo do tenant ativo." })
  @ApiOkResponse({ type: VehicleResponseDto })
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateVehicleDto,
  ) {
    return this.service.update(tenant.id, id, input);
  }

  @Patch(":id/status")
  @Permissions("vehicles.status")
  @ApiOperation({ summary: "Altera o status de um veículo." })
  @ApiOkResponse({ type: VehicleResponseDto })
  updateStatus(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RegistryStatusDto,
  ) {
    return this.service.updateStatus(tenant.id, id, input);
  }
}
