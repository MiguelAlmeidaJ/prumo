import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import {
  BulkAttendanceDto,
  CompleteDocumentUploadDto,
  CompleteLessonMobileDto,
  CreateDocumentUploadDto,
  LessonChangeRequestDto,
  LessonEvaluationDto,
  MobileRangeQueryDto,
  StartLessonMobileDto,
  VehicleOccurrenceDto,
} from "./dto/mobile.dto";
import { MobileInstructorService } from "./mobile-instructor.service";
import { MobileStudentService } from "./mobile-student.service";

@ApiTags("mobile")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller("mobile")
export class MobileController {
  constructor(
    private readonly student: MobileStudentService,
    private readonly instructor: MobileInstructorService,
  ) {}

  @Get("session")
  session(@CurrentUser() user: AuthenticatedUser) {
    return {
      user: { id: user.id, name: user.name, email: user.email },
      tenantId: user.tenantId,
      role: user.role,
      permissions: user.permissions,
    };
  }

  @Get("student/home")
  studentHome(@CurrentUser() user: AuthenticatedUser) {
    return this.student.home(user);
  }

  @Get("student/schedule")
  studentSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileRangeQueryDto,
  ) {
    return this.student.schedule(user, query);
  }

  @Get("student/schedule/:id")
  studentScheduleItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.scheduleItem(user, id);
  }

  @Get("student/lessons")
  studentLessons(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileRangeQueryDto,
  ) {
    return this.student.lessons(user, query);
  }

  @Get("student/lessons/:id")
  studentLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.lesson(user, id);
  }

  @Post("student/lessons/:id/confirm")
  studentConfirmLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.confirmLesson(user, id);
  }

  @Post("student/lessons/:id/change-requests")
  studentRequestLessonChange(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: LessonChangeRequestDto,
  ) {
    return this.student.requestLessonChange(user, id, input);
  }

  @Patch("student/lesson-change-requests/:id/cancel")
  studentCancelLessonChange(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.cancelChangeRequest(user, id);
  }

  @Get("student/processes")
  studentProcesses(@CurrentUser() user: AuthenticatedUser) {
    return this.student.processes(user);
  }

  @Get("student/processes/:id")
  studentProcess(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.process(user, id);
  }

  @Get("student/exams")
  studentExams(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileRangeQueryDto,
  ) {
    return this.student.exams(user, query);
  }

  @Get("student/exams/:id")
  studentExam(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.exam(user, id);
  }

  @Get("student/financial")
  studentFinancial(@CurrentUser() user: AuthenticatedUser) {
    return this.student.financial(user);
  }

  @Get("student/contracts/:id")
  studentContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.contract(user, id);
  }

  @Get("student/installments/:id")
  studentInstallment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.installment(user, id);
  }

  @Get("student/payments/:id")
  studentPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.payment(user, id);
  }

  @Get("student/documents")
  studentDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.student.documents(user);
  }

  @Get("student/documents/:id")
  studentDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.document(user, id);
  }

  @Post("student/documents/upload-url")
  studentCreateUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateDocumentUploadDto,
  ) {
    return this.student.createUpload(user, input);
  }

  @Put("student/documents/uploads/:token")
  studentCompleteUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("token") token: string,
    @Body() input: CompleteDocumentUploadDto,
  ) {
    return this.student.completeUpload(user, token, input);
  }

  @Get("student/documents/:id/download")
  async studentDownload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.student.downloadInfo(user, id);
  }

  @Get("student/profile")
  studentProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.student.profile(user);
  }

  @Get("instructor/home")
  instructorHome(@CurrentUser() user: AuthenticatedUser) {
    return this.instructor.home(user);
  }

  @Get("instructor/schedule")
  instructorSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileRangeQueryDto,
  ) {
    return this.instructor.schedule(user, query);
  }

  @Get("instructor/schedule/:id")
  instructorScheduleItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.instructor.scheduleItem(user, id);
  }

  @Get("instructor/lessons")
  instructorLessons(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileRangeQueryDto,
  ) {
    return this.instructor.lessons(user, query);
  }

  @Get("instructor/lessons/:id")
  instructorLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.instructor.lesson(user, id);
  }

  @Post("instructor/lessons/:id/start")
  instructorStartLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: StartLessonMobileDto,
  ) {
    return this.instructor.startLesson(user, id, input, idempotencyKey);
  }

  @Post("instructor/lessons/:id/complete")
  instructorCompleteLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CompleteLessonMobileDto,
  ) {
    return this.instructor.completeLesson(user, id, input, idempotencyKey);
  }

  @Post("instructor/lessons/:id/no-show")
  instructorNoShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.instructor.noShow(user, id, idempotencyKey);
  }

  @Put("instructor/lessons/:id/evaluation")
  instructorEvaluation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: LessonEvaluationDto,
  ) {
    return this.instructor.evaluate(user, id, input, idempotencyKey);
  }

  @Get("instructor/theoretical-classes")
  instructorTheoretical(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileRangeQueryDto,
  ) {
    return this.instructor.theoretical(user, query);
  }

  @Get("instructor/theoretical-classes/:id")
  instructorTheoreticalClass(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.instructor.theoreticalClass(user, id);
  }

  @Post("instructor/theoretical-classes/:id/start")
  instructorStartTheoretical(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.instructor.startTheoretical(user, id, idempotencyKey);
  }

  @Put("instructor/theoretical-classes/:id/attendance")
  instructorAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: BulkAttendanceDto,
  ) {
    return this.instructor.attendance(user, id, input, idempotencyKey);
  }

  @Post("instructor/theoretical-classes/:id/complete")
  instructorCompleteTheoretical(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.instructor.completeTheoretical(user, id, idempotencyKey);
  }

  @Get("instructor/students")
  instructorStudents(@CurrentUser() user: AuthenticatedUser) {
    return this.instructor.students(user);
  }

  @Get("instructor/students/:id")
  instructorStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.instructor.student(user, id);
  }

  @Get("instructor/vehicles")
  instructorVehicles(@CurrentUser() user: AuthenticatedUser) {
    return this.instructor.vehicles(user);
  }

  @Get("instructor/vehicles/:id")
  instructorVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.instructor.vehicle(user, id);
  }

  @Post("instructor/vehicles/:id/occurrences")
  instructorOccurrence(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: VehicleOccurrenceDto,
  ) {
    return this.instructor.occurrence(user, id, input, idempotencyKey);
  }

  @Get("instructor/profile")
  instructorProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.instructor.profile(user);
  }
}
