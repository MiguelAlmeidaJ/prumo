import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProcessesModule } from "../processes/processes.module";
import { FinancialModule } from "../financial/financial.module";
import { AuditService } from "./audit.service";
import { ClassroomsController } from "./classrooms.controller";
import { ClassroomsService } from "./classrooms.service";
import { InstructorAvailabilityController } from "./instructor-availability.controller";
import { InstructorAvailabilityService } from "./instructor-availability.service";
import { PracticalLessonsController } from "./practical-lessons.controller";
import { PracticalLessonsService } from "./practical-lessons.service";
import { ScheduleBlocksController } from "./schedule-blocks.controller";
import { ScheduleBlocksService } from "./schedule-blocks.service";
import { ScheduleValidationService } from "./schedule-validation.service";
import { ScheduleController } from "./schedule.controller";
import { ScheduleService } from "./schedule.service";
import { SchoolUnitsController } from "./school-units.controller";
import { SchoolUnitsService } from "./school-units.service";
import { TheoreticalClassesController } from "./theoretical-classes.controller";
import { TheoreticalClassesService } from "./theoretical-classes.service";

@Module({
  imports: [AuthModule, ProcessesModule, FinancialModule],
  controllers: [
    SchoolUnitsController,
    ClassroomsController,
    InstructorAvailabilityController,
    ScheduleBlocksController,
    PracticalLessonsController,
    TheoreticalClassesController,
    ScheduleController,
  ],
  providers: [
    AuditService,
    SchoolUnitsService,
    ClassroomsService,
    InstructorAvailabilityService,
    ScheduleBlocksService,
    ScheduleValidationService,
    PracticalLessonsService,
    TheoreticalClassesService,
    ScheduleService,
  ],
  exports: [
    AuditService,
    PracticalLessonsService,
    TheoreticalClassesService,
  ],
})
export class ScheduleModule {}
