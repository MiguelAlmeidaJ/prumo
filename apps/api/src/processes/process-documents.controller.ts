import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import {
  LinkProcessDocumentDto,
  RejectProcessDocumentDto,
  UploadProcessDocumentDto,
} from "./dto/process.dto";
import { ProcessDocumentsService } from "./process-documents.service";

@ApiTags("process-documents")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("processes/:processId/documents")
export class ProcessDocumentsController {
  constructor(private readonly service: ProcessDocumentsService) {}

  @Get()
  @Permissions("processes.read")
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param("processId", ParseUUIDPipe) processId: string,
  ) {
    return this.service.list(tenant.id, processId);
  }

  @Post(":id/link")
  @Permissions("documents.review")
  @ApiOperation({ summary: "Vincula um documento do aluno ao requisito." })
  link(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("processId", ParseUUIDPipe) processId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: LinkProcessDocumentDto,
  ) {
    return this.service.link(tenant.id, user.id, processId, id, input);
  }

  @Post(":id/upload")
  @Permissions("documents.review")
  @ApiOperation({ summary: "Envia e vincula um arquivo ao requisito." })
  upload(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("processId", ParseUUIDPipe) processId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UploadProcessDocumentDto,
  ) {
    return this.service.upload(tenant.id, user.id, processId, id, input);
  }

  @Get(":id/file")
  @Permissions("processes.read")
  @ApiOperation({ summary: "Obtém o arquivo vinculado para visualização." })
  file(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("processId", ParseUUIDPipe) processId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.file(tenant.id, user.id, processId, id);
  }

  @Post(":id/submit")
  @Permissions("documents.review")
  submit(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("processId", ParseUUIDPipe) processId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.submit(tenant.id, user.id, processId, id);
  }

  @Post(":id/approve")
  @Permissions("documents.approve")
  approve(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("processId", ParseUUIDPipe) processId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.approve(tenant.id, user.id, processId, id);
  }

  @Post(":id/reject")
  @Permissions("documents.reject")
  reject(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("processId", ParseUUIDPipe) processId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RejectProcessDocumentDto,
  ) {
    return this.service.reject(tenant.id, user.id, processId, id, input);
  }

  @Post(":id/waive")
  @Permissions("documents.approve")
  waive(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("processId", ParseUUIDPipe) processId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RejectProcessDocumentDto,
  ) {
    return this.service.waive(tenant.id, user.id, processId, id, input);
  }
}
