import type { TenantSettingsSummary } from "@prumo/contracts";
import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
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
import { UpdateTenantSettingsDto } from "./tenant-settings.dto";
import { TenantSettingsService } from "./tenant-settings.service";

@ApiTags("tenant-settings")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller("tenant/settings")
export class TenantSettingsController {
  constructor(private readonly service: TenantSettingsService) {}

  @Get()
  @Permissions("tenant:manage")
  @ApiOperation({ summary: "Consulta as configurações do tenant ativo." })
  get(
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<TenantSettingsSummary> {
    return this.service.get(tenant.id);
  }

  @Patch()
  @Permissions("tenant:manage")
  @ApiOperation({ summary: "Atualiza as configurações do tenant ativo." })
  update(
    @CurrentTenant() tenant: CurrentTenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateTenantSettingsDto,
  ): Promise<TenantSettingsSummary> {
    return this.service.update(tenant.id, user.id, input);
  }
}
