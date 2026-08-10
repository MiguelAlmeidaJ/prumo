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
  CreateInstructorDto,
  InstructorListResponseDto,
  InstructorResponseDto,
  UpdateInstructorDto,
} from "./dto/instructor.dto";
import { InstructorsService } from "./instructors.service";

@ApiTags("instructors")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("instructors")
export class InstructorsController {
  constructor(private readonly service: InstructorsService) {}

  @Post()
  @Permissions("instructors.create")
  @ApiOperation({ summary: "Cadastra um instrutor no tenant ativo." })
  @ApiCreatedResponse({ type: InstructorResponseDto })
  @ApiConflictResponse({ description: "CPF duplicado no tenant ativo." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Body() input: CreateInstructorDto,
  ) {
    return this.service.create(tenant.id, input);
  }

  @Get()
  @Permissions("instructors.read")
  @ApiOperation({ summary: "Lista e busca instrutores do tenant ativo." })
  @ApiOkResponse({ type: InstructorListResponseDto })
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("instructors.read")
  @ApiOperation({ summary: "Obtém um instrutor do tenant ativo." })
  @ApiOkResponse({ type: InstructorResponseDto })
  @ApiNotFoundResponse()
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("instructors.update")
  @ApiOperation({ summary: "Atualiza um instrutor do tenant ativo." })
  @ApiOkResponse({ type: InstructorResponseDto })
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateInstructorDto,
  ) {
    return this.service.update(tenant.id, id, input);
  }

  @Patch(":id/status")
  @Permissions("instructors.status")
  @ApiOperation({ summary: "Altera o status de um instrutor." })
  @ApiOkResponse({ type: InstructorResponseDto })
  updateStatus(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RegistryStatusDto,
  ) {
    return this.service.updateStatus(tenant.id, id, input);
  }
}
