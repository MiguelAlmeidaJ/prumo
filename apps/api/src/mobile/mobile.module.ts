import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ScheduleModule } from "../schedule/schedule.module";
import { MobileAccessService } from "./mobile-access.service";
import { MobileController } from "./mobile.controller";
import { MobileInstructorService } from "./mobile-instructor.service";
import { MobileStudentService } from "./mobile-student.service";

@Module({
  imports: [AuthModule, ScheduleModule],
  controllers: [MobileController],
  providers: [
    MobileAccessService,
    MobileStudentService,
    MobileInstructorService,
  ],
})
export class MobileModule {}
