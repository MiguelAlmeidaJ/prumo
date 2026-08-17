import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { DashboardModule } from "./dashboard/dashboard.module";
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
import { StorageModule } from "./storage/storage.module";
import { ObservabilityModule } from "./observability/observability.module";
import { RequestIdMiddleware } from "./observability/request-id.middleware";
import { PlatformMigrationModule } from "./platform-migrations/platform-migration.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    StorageModule,
    ObservabilityModule,
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
    PlatformMigrationModule,
    IdentityModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
