import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { MigrationFileParser } from "./migration-file.parser";
import { PlatformMigrationController } from "./platform-migration.controller";
import { PlatformMigrationService } from "./platform-migration.service";

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [PlatformMigrationController],
  providers: [MigrationFileParser, PlatformMigrationService],
})
export class PlatformMigrationModule {}
