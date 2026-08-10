import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HealthController } from "./health.controller";
import { InstructorsModule } from "./instructors/instructors.module";
import { StudentsModule } from "./students/students.module";
import { TenantSettingsModule } from "./tenant-settings/tenant-settings.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { ScheduleModule } from "./schedule/schedule.module";
import { SecurityModule } from "./security/security.module";
import { ProcessesModule } from "./processes/processes.module";
import { FinancialModule } from "./financial/financial.module";
import { CommunicationModule } from "./communication/communication.module";
import { MobileModule } from "./mobile/mobile.module";
import { PlatformModule } from "./platform/platform.module";
import { IdentityModule } from "./identity/identity.module";
import { validateEnvironment } from "./config/environment";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    DashboardModule,
    AuthModule,
    CommunicationModule,
    StudentsModule,
    TenantSettingsModule,
    InstructorsModule,
    VehiclesModule,
    ScheduleModule,
    SecurityModule,
    ProcessesModule,
    FinancialModule,
    MobileModule,
    PlatformModule,
    IdentityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
