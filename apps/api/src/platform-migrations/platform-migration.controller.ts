import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ImportEntityType, PlatformRole } from "@prumo/database";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import {
  CurrentPlatformUser,
  PlatformPermissions,
  PlatformRoles,
} from "../platform/platform.decorators";
import {
  PlatformPermissionsGuard,
  PlatformRateLimitGuard,
  PlatformRolesGuard,
} from "../platform/platform.guards";
import {
  CreateImportJobDto,
  ImportJobListQueryDto,
  RollbackImportDto,
  SaveImportMappingDto,
  UploadImportFileDto,
} from "./platform-migration.dto";
import { PlatformMigrationService } from "./platform-migration.service";

type HttpRequest = {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
};

function auditContext(request: HttpRequest) {
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: request.ip,
    userAgent: typeof userAgent === "string" ? userAgent : undefined,
  };
}

@ApiTags("platform-migrations")
@ApiBearerAuth("bearer")
@Controller("platform/migrations")
@UseGuards(
  JwtAuthGuard,
  PlatformRateLimitGuard,
  PlatformRolesGuard,
  PlatformPermissionsGuard,
)
@PlatformRoles(PlatformRole.PLATFORM_ADMIN, PlatformRole.PLATFORM_OWNER)
export class PlatformMigrationController {
  constructor(private readonly service: PlatformMigrationService) {}

  @Get("catalog")
  @PlatformPermissions("system.migrations.read")
  catalog() {
    return this.service.catalog();
  }

  @Get("templates/:entityType")
  @PlatformPermissions("system.migrations.read")
  template(
    @Param("entityType", new ParseEnumPipe(ImportEntityType))
    entityType: ImportEntityType,
  ) {
    return this.service.template(entityType);
  }

  @Get()
  @PlatformPermissions("system.migrations.read")
  list(@Query() query: ImportJobListQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @PlatformPermissions("system.migrations.create")
  create(
    @Body() input: CreateImportJobDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.create(input, actor.id, auditContext(request));
  }

  @Get(":id")
  @PlatformPermissions("system.migrations.read")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post(":id/files")
  @PlatformPermissions("system.migrations.create")
  upload(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UploadImportFileDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.upload(id, input, actor.id, auditContext(request));
  }

  @Put(":id/files/:fileId/mapping")
  @PlatformPermissions("system.migrations.create")
  saveMapping(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Body() input: SaveImportMappingDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.saveMapping(
      id,
      fileId,
      input,
      actor.id,
      auditContext(request),
    );
  }

  @Post(":id/validate")
  @PlatformPermissions("system.migrations.validate")
  validate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.validate(id, actor.id, auditContext(request));
  }

  @Post(":id/execute")
  @PlatformPermissions("system.migrations.execute")
  execute(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.execute(id, actor.id, auditContext(request));
  }

  @Post(":id/rollback")
  @PlatformPermissions("system.migrations.rollback")
  rollback(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RollbackImportDto,
    @CurrentPlatformUser() actor: AuthenticatedPrincipal,
    @Req() request: HttpRequest,
  ) {
    return this.service.rollback(id, input, actor.id, auditContext(request));
  }

  @Get(":id/errors.csv")
  @PlatformPermissions("system.migrations.read")
  async errorReport(@Param("id", ParseUUIDPipe) id: string) {
    const csv = await this.service.errorReport(id);
    return {
      fileName: `migration-${id}-errors.csv`,
      mimeType: "text/csv; charset=utf-8",
      contentBase64: Buffer.from(`\uFEFF${csv}`, "utf8").toString("base64"),
    };
  }
}
