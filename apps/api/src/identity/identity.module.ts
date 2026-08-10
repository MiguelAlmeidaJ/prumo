import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommunicationModule } from "../communication/communication.module";
import {
  IdentityAccessController,
  TeamController,
} from "./identity.controller";
import { IdentityService } from "./identity.service";

@Module({
  imports: [AuthModule, CommunicationModule],
  controllers: [IdentityAccessController, TeamController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
