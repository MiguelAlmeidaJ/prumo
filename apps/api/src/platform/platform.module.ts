import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformController } from "./platform.controller";
import { PlatformEntitlementService } from "./platform-entitlement.service";
import {
  PlatformPermissionsGuard,
  PlatformRateLimitGuard,
  PlatformRolesGuard,
  SupportSessionGuard,
} from "./platform.guards";
import { PlatformService } from "./platform.service";

@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [PlatformController],
  providers: [
    PlatformService,
    PlatformAuditService,
    PlatformEntitlementService,
    PlatformRolesGuard,
    PlatformPermissionsGuard,
    PlatformRateLimitGuard,
    SupportSessionGuard,
  ],
  exports: [
    PlatformEntitlementService,
    PlatformAuditService,
    PlatformPermissionsGuard,
    PlatformRateLimitGuard,
    PlatformRolesGuard,
    SupportSessionGuard,
  ],
})
export class PlatformModule {}
