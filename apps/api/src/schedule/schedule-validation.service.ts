import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LicenseProcessStatus,
  Prisma,
  RegistryStatus,
  ScheduleResourceType,
} from "@prumo/database";
import {
  ACTIVE_LESSON_STATUSES,
  ensureSameUtcDay,
  utcTime,
  weekdayOf,
} from "./schedule.utils";

interface PracticalResources {
  unitId: string;
  studentId: string;
  instructorId: string;
  vehicleId: string;
  processId?: string;
}

interface TheoreticalResources {
  unitId: string;
  classroomId: string;
  instructorId: string;
}

@Injectable()
export class ScheduleValidationService {
  async validateProcessLink(
    tx: Prisma.TransactionClient,
    tenantId: string,
    processId: string | undefined,
    studentId: string,
    unitId: string,
  ): Promise<void> {
    if (!processId) return;
    const process = await tx.studentLicenseProcess.findFirst({
      where: {
        id: processId,
        tenantId,
        studentId,
        unitId,
        status: {
          in: [
            LicenseProcessStatus.PENDING_DOCUMENTS,
            LicenseProcessStatus.IN_PROGRESS,
          ],
        },
      },
      select: { id: true },
    });
    if (!process) {
      throw new NotFoundException(
        "O processo não pertence ao aluno, unidade e tenant ativos.",
      );
    }
  }

  ensureNotPast(start: Date, canSchedulePast: boolean): void {
    if (start < new Date() && !canSchedulePast) {
      throw new ForbiddenException(
        "Não é permitido agendar horários no passado.",
      );
    }
  }

  async validatePractical(
    tx: Prisma.TransactionClient,
    tenantId: string,
    resources: PracticalResources,
    start: Date,
    end: Date,
    excludeLessonId?: string,
  ): Promise<void> {
    ensureSameUtcDay(start, end);
    const [unit, student, instructor, vehicle] = await Promise.all([
      tx.schoolUnit.findFirst({
        where: { id: resources.unitId, tenantId, active: true },
      }),
      tx.student.findFirst({
        where: {
          id: resources.studentId,
          tenantId,
          status: RegistryStatus.ACTIVE,
        },
      }),
      tx.instructor.findFirst({
        where: {
          id: resources.instructorId,
          tenantId,
          status: RegistryStatus.ACTIVE,
        },
      }),
      tx.vehicle.findFirst({
        where: {
          id: resources.vehicleId,
          tenantId,
          status: RegistryStatus.ACTIVE,
        },
      }),
    ]);
    if (!unit || !student || !instructor || !vehicle) {
      throw new NotFoundException(
        "Aluno, instrutor, veículo ou unidade não pertence ao tenant ativo.",
      );
    }
    await this.validateProcessLink(
      tx,
      tenantId,
      resources.processId,
      resources.studentId,
      resources.unitId,
    );

    this.validateUnitHours(unit.openingTime, unit.closingTime, start, end);
    await this.validateInstructorAvailability(
      tx,
      tenantId,
      resources.instructorId,
      start,
      end,
    );
    await this.validateBlocks(tx, tenantId, resources, start, end);

    const practicalConflict = await tx.lesson.findFirst({
      where: {
        tenantId,
        id: excludeLessonId ? { not: excludeLessonId } : undefined,
        status: { in: [...ACTIVE_LESSON_STATUSES] },
        startsAt: { lt: end },
        endsAt: { gt: start },
        OR: [
          { studentId: resources.studentId },
          { instructorId: resources.instructorId },
          { vehicleId: resources.vehicleId },
        ],
      },
      select: {
        id: true,
        studentId: true,
        instructorId: true,
        vehicleId: true,
      },
    });
    if (practicalConflict) {
      const resource =
        practicalConflict.studentId === resources.studentId
          ? "aluno"
          : practicalConflict.instructorId === resources.instructorId
            ? "instrutor"
            : "veículo";
      throw new ConflictException(`Conflito de agenda do ${resource}.`);
    }

    const theoreticalConflict = await tx.theoreticalClass.findFirst({
      where: {
        tenantId,
        status: { in: [...ACTIVE_LESSON_STATUSES] },
        startsAt: { lt: end },
        endsAt: { gt: start },
        OR: [
          { instructorId: resources.instructorId },
          {
            students: {
              some: { studentId: resources.studentId },
            },
          },
        ],
      },
      select: {
        id: true,
        instructorId: true,
        students: {
          where: { studentId: resources.studentId },
          select: { id: true },
        },
      },
    });
    if (theoreticalConflict) {
      throw new ConflictException(
        theoreticalConflict.instructorId === resources.instructorId
          ? "Conflito de agenda do instrutor."
          : "Conflito de agenda do aluno.",
      );
    }
  }

  async validateTheoretical(
    tx: Prisma.TransactionClient,
    tenantId: string,
    resources: TheoreticalResources,
    start: Date,
    end: Date,
    capacity: number,
    excludeClassId?: string,
  ): Promise<void> {
    ensureSameUtcDay(start, end);
    const [unit, classroom, instructor] = await Promise.all([
      tx.schoolUnit.findFirst({
        where: { id: resources.unitId, tenantId, active: true },
      }),
      tx.classroom.findFirst({
        where: {
          id: resources.classroomId,
          tenantId,
          unitId: resources.unitId,
          active: true,
        },
      }),
      tx.instructor.findFirst({
        where: {
          id: resources.instructorId,
          tenantId,
          status: RegistryStatus.ACTIVE,
        },
      }),
    ]);
    if (!unit || !classroom || !instructor) {
      throw new NotFoundException(
        "Unidade, sala ou instrutor não pertence ao tenant ativo.",
      );
    }
    if (capacity > classroom.capacity) {
      throw new ConflictException(
        "A capacidade da turma excede a capacidade da sala.",
      );
    }
    this.validateUnitHours(unit.openingTime, unit.closingTime, start, end);
    await this.validateInstructorAvailability(
      tx,
      tenantId,
      resources.instructorId,
      start,
      end,
    );
    await this.validateBlocks(tx, tenantId, resources, start, end);

    const classConflict = await tx.theoreticalClass.findFirst({
      where: {
        tenantId,
        id: excludeClassId ? { not: excludeClassId } : undefined,
        status: { in: [...ACTIVE_LESSON_STATUSES] },
        startsAt: { lt: end },
        endsAt: { gt: start },
        OR: [
          { instructorId: resources.instructorId },
          { classroomId: resources.classroomId },
        ],
      },
      select: { instructorId: true, classroomId: true },
    });
    if (classConflict) {
      throw new ConflictException(
        classConflict.instructorId === resources.instructorId
          ? "Conflito de agenda do instrutor."
          : "Conflito de agenda da sala.",
      );
    }

    const practicalConflict = await tx.lesson.findFirst({
      where: {
        tenantId,
        instructorId: resources.instructorId,
        status: { in: [...ACTIVE_LESSON_STATUSES] },
        startsAt: { lt: end },
        endsAt: { gt: start },
      },
      select: { id: true },
    });
    if (practicalConflict) {
      throw new ConflictException("Conflito de agenda do instrutor.");
    }
  }

  async validateStudentEnrollment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    theoreticalClassId: string,
    studentId: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const student = await tx.student.findFirst({
      where: { id: studentId, tenantId, status: RegistryStatus.ACTIVE },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException("Aluno ativo não encontrado neste tenant.");
    }

    const [practical, theoretical] = await Promise.all([
      tx.lesson.findFirst({
        where: {
          tenantId,
          studentId,
          status: { in: [...ACTIVE_LESSON_STATUSES] },
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
      }),
      tx.theoreticalClass.findFirst({
        where: {
          tenantId,
          id: { not: theoreticalClassId },
          status: { in: [...ACTIVE_LESSON_STATUSES] },
          startsAt: { lt: end },
          endsAt: { gt: start },
          students: { some: { studentId } },
        },
      }),
    ]);
    if (practical || theoretical) {
      throw new ConflictException("Conflito de agenda do aluno.");
    }
  }

  private validateUnitHours(
    openingTime: string,
    closingTime: string,
    start: Date,
    end: Date,
  ): void {
    const startTime = utcTime(start);
    const endTime = utcTime(end);
    if (startTime < openingTime || endTime > closingTime) {
      throw new ConflictException("Horário fora do funcionamento da unidade.");
    }
  }

  private async validateInstructorAvailability(
    tx: Prisma.TransactionClient,
    tenantId: string,
    instructorId: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const availability = await tx.instructorAvailability.findFirst({
      where: {
        tenantId,
        instructorId,
        weekday: weekdayOf(start),
        active: true,
        startsAt: { lte: utcTime(start) },
        endsAt: { gte: utcTime(end) },
      },
      select: { id: true },
    });
    if (!availability) {
      throw new ConflictException("Instrutor fora da disponibilidade semanal.");
    }
  }

  private async validateBlocks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    resources: Partial<
      PracticalResources & Pick<TheoreticalResources, "classroomId">
    >,
    start: Date,
    end: Date,
  ): Promise<void> {
    const conditions: Prisma.ScheduleBlockWhereInput[] = [];
    if (resources.unitId) {
      conditions.push({
        resourceType: ScheduleResourceType.UNIT,
        unitId: resources.unitId,
      });
    }
    if (resources.instructorId) {
      conditions.push({
        resourceType: ScheduleResourceType.INSTRUCTOR,
        instructorId: resources.instructorId,
      });
    }
    if (resources.vehicleId) {
      conditions.push({
        resourceType: ScheduleResourceType.VEHICLE,
        vehicleId: resources.vehicleId,
      });
    }
    if (resources.classroomId) {
      conditions.push({
        resourceType: ScheduleResourceType.CLASSROOM,
        classroomId: resources.classroomId,
      });
    }
    const block = await tx.scheduleBlock.findFirst({
      where: {
        tenantId,
        startsAt: { lt: end },
        endsAt: { gt: start },
        OR: conditions,
      },
      select: { reason: true },
    });
    if (block) {
      throw new ConflictException(`Recurso bloqueado: ${block.reason}`);
    }
  }
}
