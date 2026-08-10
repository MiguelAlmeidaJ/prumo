import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InstructorsController } from "./instructors.controller";
import { InstructorsService } from "./instructors.service";

@Module({
  imports: [AuthModule],
  controllers: [InstructorsController],
  providers: [InstructorsService],
})
export class InstructorsModule {}
