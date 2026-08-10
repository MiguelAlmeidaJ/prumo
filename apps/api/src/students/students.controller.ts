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
  CreateStudentDto,
  StudentListResponseDto,
  StudentResponseDto,
  UpdateStudentDto,
} from "./dto/student.dto";
import { StudentsService } from "./students.service";

@ApiTags("students")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("students")
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @Permissions("students.create")
  @ApiOperation({ summary: "Cadastra um aluno no tenant ativo." })
  @ApiCreatedResponse({ type: StudentResponseDto })
  @ApiConflictResponse({ description: "CPF duplicado no tenant ativo." })
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Body() input: CreateStudentDto,
  ) {
    return this.studentsService.create(tenant.id, input);
  }

  @Get()
  @Permissions("students.read")
  @ApiOperation({ summary: "Lista e busca alunos do tenant ativo." })
  @ApiOkResponse({ type: StudentListResponseDto })
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query() query: PaginationQueryDto,
  ) {
    return this.studentsService.list(tenant.id, query);
  }

  @Get(":id")
  @Permissions("students.read")
  @ApiOperation({ summary: "Obtém um aluno do tenant ativo." })
  @ApiOkResponse({ type: StudentResponseDto })
  @ApiNotFoundResponse({ description: "Aluno não encontrado neste tenant." })
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.findOne(tenant.id, id);
  }

  @Patch(":id")
  @Permissions("students.update")
  @ApiOperation({ summary: "Atualiza um aluno do tenant ativo." })
  @ApiOkResponse({ type: StudentResponseDto })
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateStudentDto,
  ) {
    return this.studentsService.update(tenant.id, id, input);
  }

  @Patch(":id/status")
  @Permissions("students.status")
  @ApiOperation({ summary: "Altera o status de um aluno." })
  @ApiOkResponse({ type: StudentResponseDto })
  updateStatus(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RegistryStatusDto,
  ) {
    return this.studentsService.updateStatus(tenant.id, id, input);
  }
}
