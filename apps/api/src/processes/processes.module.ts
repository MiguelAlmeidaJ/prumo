import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FinancialModule } from "../financial/financial.module";
import { AuditService } from "../schedule/audit.service";
import { ExamsController } from "./exams.controller";
import { ExamsService } from "./exams.service";
import { ProcessDocumentsController } from "./process-documents.controller";
import { ProcessDocumentsService } from "./process-documents.service";
import { ProcessProgressionService } from "./process-progression.service";
import { ProcessesController } from "./processes.controller";
import { ProcessesService } from "./processes.service";

@Module({
  imports: [AuthModule, FinancialModule],
  controllers: [
    ProcessesController,
    ProcessDocumentsController,
    ExamsController,
  ],
  providers: [
    AuditService,
    ProcessProgressionService,
    ProcessesService,
    ProcessDocumentsService,
    ExamsService,
  ],
  exports: [ProcessProgressionService],
})
export class ProcessesModule {}
