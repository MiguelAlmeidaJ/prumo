import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ScheduleResourceType } from "@prumo/database";
import { PrismaService } from "../database/prisma.service";
import {
  ScheduleAvailabilityQueryDto,
  ScheduleQueryDto,
} from "./dto/schedule.dto";
import {
  ACTIVE_LESSON_STATUSES,
  parseInterval,
  utcTime,
  weekdayOf,
} from "./schedule.utils";

type Interval = { startsAt: Date; endsAt: Date };

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ScheduleQueryDto) {
    const { start, end } = this.parseQueryInterval(query.from, query.to);
    const overlap = { startsAt: { lt: end }, endsAt: { gt: start } };
    const examFilterActive = Boolean(query.examType || query.result);
    const includePractical =
      (!query.type || query.type === "PRACTICAL_LESSON") &&
      !examFilterActive;
    const includeTheoretical =
      (!query.type || query.type === "THEORETICAL_CLASS") &&
      !examFilterActive;
    const includeBlocks =
      (!query.type || query.type === "SCHEDULE_BLOCK") &&
      !query.status &&
      !examFilterActive;
    const includeExams =
      (!query.type || query.type === "EXAM") &&
      !query.status &&
      !query.instructorId &&
      !query.vehicleId &&
      !query.classroomId;

    const [practical, theoretical, blocks, exams] = await Promise.all([
      includePractical
        ? this.prisma.lesson.findMany({
            where: {
              tenantId,
              ...overlap,
              unitId: query.unitId,
              instructorId: query.instructorId,
              vehicleId: query.vehicleId,
              studentId: query.studentId,
              status: query.status,
            },
            include: {
              unit: { select: { id: true, name: true } },
              student: { select: { id: true, name: true } },
              instructor: { select: { id: true, name: true } },
              vehicle: {
                select: { id: true, plate: true, model: true },
              },
            },
          })
        : [],
      includeTheoretical && !query.vehicleId
        ? this.prisma.theoreticalClass.findMany({
            where: {
              tenantId,
              ...overlap,
              unitId: query.unitId,
              instructorId: query.instructorId,
              classroomId: query.classroomId,
              status: query.status,
              students: query.studentId
                ? { some: { studentId: query.studentId } }
                : undefined,
            },
            include: {
              unit: { select: { id: true, name: true } },
              classroom: { select: { id: true, name: true } },
              instructor: { select: { id: true, name: true } },
              students: {
                include: {
                  student: { select: { id: true, name: true } },
                },
              },
            },
          })
        : [],
      includeBlocks && !query.studentId
        ? this.prisma.scheduleBlock.findMany({
            where: {
              tenantId,
              ...overlap,
              OR: this.blockFilters(query),
            },
            include: {
              unit: { select: { id: true, name: true } },
              classroom: { select: { id: true, name: true } },
              instructor: { select: { id: true, name: true } },
              vehicle: {
                select: { id: true, plate: true, model: true },
              },
            },
          })
        : [],
      includeExams
        ? this.prisma.exam.findMany({
            where: {
              tenantId,
              scheduledAt: { gte: start, lt: end },
              unitId: query.unitId,
              studentId: query.studentId,
              type: query.examType,
              result: query.result,
            },
            include: {
              unit: { select: { id: true, name: true } },
              student: { select: { id: true, name: true } },
              process: { select: { id: true, processType: true } },
            },
          })
        : [],
    ]);

    const events = [
      ...practical.map((lesson) => ({
        id: lesson.id,
        type: "PRACTICAL_LESSON" as const,
        title: `Aula prática — ${lesson.student.name}`,
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt,
        status: lesson.status,
        unit: lesson.unit,
        student: lesson.student,
        instructor: lesson.instructor,
        vehicle: lesson.vehicle,
      })),
      ...theoretical.map((lesson) => ({
        id: lesson.id,
        type: "THEORETICAL_CLASS" as const,
        title: lesson.title,
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt,
        status: lesson.status,
        unit: lesson.unit,
        classroom: lesson.classroom,
        instructor: lesson.instructor,
        students: lesson.students.map((entry) => entry.student),
      })),
      ...blocks.map((block) => ({
        id: block.id,
        type: "SCHEDULE_BLOCK" as const,
        title: block.reason,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        status: "BLOCKED" as const,
        resourceType: block.resourceType,
        unit: block.unit,
        classroom: block.classroom,
        instructor: block.instructor,
        vehicle: block.vehicle,
      })),
      ...exams.map((exam) => ({
        id: exam.id,
        type: "EXAM" as const,
        title: `Exame ${exam.type.toLowerCase()} — ${exam.student.name}`,
        startsAt: exam.scheduledAt,
        endsAt: new Date(exam.scheduledAt.getTime() + 60 * 60_000),
        status: exam.status,
        result: exam.result,
        examType: exam.type,
        unit: exam.unit,
        student: exam.student,
        process: exam.process,
      })),
    ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    return { from: start, to: end, events };
  }

  async availability(tenantId: string, query: ScheduleAvailabilityQueryDto) {
    const { start, end } = this.parseQueryInterval(query.from, query.to);
    if (end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        "O intervalo de disponibilidade não pode exceder 31 dias.",
      );
    }

    const unit = await this.prisma.schoolUnit.findFirst({
      where: { id: query.unitId, tenantId, active: true },
    });
    if (!unit) {
      throw new NotFoundException("Unidade ativa não encontrada.");
    }
    await this.ensureOptionalResources(tenantId, query);

    const [practical, theoretical, blocks, availabilities] = await Promise.all([
      this.prisma.lesson.findMany({
        where: {
          tenantId,
          status: { in: [...ACTIVE_LESSON_STATUSES] },
          startsAt: { lt: end },
          endsAt: { gt: start },
          OR: [
            ...(query.instructorId
              ? [{ instructorId: query.instructorId }]
              : []),
            ...(query.vehicleId ? [{ vehicleId: query.vehicleId }] : []),
          ],
        },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.theoreticalClass.findMany({
        where: {
          tenantId,
          status: { in: [...ACTIVE_LESSON_STATUSES] },
          startsAt: { lt: end },
          endsAt: { gt: start },
          OR: [
            ...(query.instructorId
              ? [{ instructorId: query.instructorId }]
              : []),
            ...(query.classroomId ? [{ classroomId: query.classroomId }] : []),
          ],
        },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.scheduleBlock.findMany({
        where: {
          tenantId,
          startsAt: { lt: end },
          endsAt: { gt: start },
          OR: [
            {
              resourceType: ScheduleResourceType.UNIT,
              unitId: query.unitId,
            },
            ...(query.instructorId
              ? [
                  {
                    resourceType: ScheduleResourceType.INSTRUCTOR,
                    instructorId: query.instructorId,
                  },
                ]
              : []),
            ...(query.vehicleId
              ? [
                  {
                    resourceType: ScheduleResourceType.VEHICLE,
                    vehicleId: query.vehicleId,
                  },
                ]
              : []),
            ...(query.classroomId
              ? [
                  {
                    resourceType: ScheduleResourceType.CLASSROOM,
                    classroomId: query.classroomId,
                  },
                ]
              : []),
          ],
        },
        select: { startsAt: true, endsAt: true },
      }),
      query.instructorId
        ? this.prisma.instructorAvailability.findMany({
            where: {
              tenantId,
              instructorId: query.instructorId,
              active: true,
            },
          })
        : [],
    ]);

    const busy: Interval[] = [...practical, ...theoretical, ...blocks];
    const durationMs = query.durationMinutes * 60_000;
    const slots: Interval[] = [];
    for (
      let cursor = new Date(start);
      cursor.getTime() + durationMs <= end.getTime();
      cursor = new Date(cursor.getTime() + 15 * 60_000)
    ) {
      const slot = {
        startsAt: cursor,
        endsAt: new Date(cursor.getTime() + durationMs),
      };
      if (
        this.insideUnitHours(slot, unit.openingTime, unit.closingTime) &&
        (!query.instructorId ||
          availabilities.some(
            (availability) =>
              availability.weekday === weekdayOf(slot.startsAt) &&
              availability.startsAt <= utcTime(slot.startsAt) &&
              availability.endsAt >= utcTime(slot.endsAt),
          )) &&
        !busy.some((item) => this.overlaps(slot, item))
      ) {
        slots.push(slot);
      }
    }

    return {
      from: start,
      to: end,
      durationMinutes: query.durationMinutes,
      slots,
    };
  }

  private parseQueryInterval(from: string, to: string) {
    const interval = parseInterval(from, to);
    if (interval.end.getTime() - interval.start.getTime() > 93 * 86_400_000) {
      throw new BadRequestException("O intervalo não pode exceder 93 dias.");
    }
    return interval;
  }

  private blockFilters(
    query: ScheduleQueryDto,
  ): Prisma.ScheduleBlockWhereInput[] | undefined {
    const filters: Prisma.ScheduleBlockWhereInput[] = [];
    if (query.unitId) {
      filters.push({
        resourceType: ScheduleResourceType.UNIT,
        unitId: query.unitId,
      });
    }
    if (query.instructorId) {
      filters.push({
        resourceType: ScheduleResourceType.INSTRUCTOR,
        instructorId: query.instructorId,
      });
    }
    if (query.vehicleId) {
      filters.push({
        resourceType: ScheduleResourceType.VEHICLE,
        vehicleId: query.vehicleId,
      });
    }
    if (query.classroomId) {
      filters.push({
        resourceType: ScheduleResourceType.CLASSROOM,
        classroomId: query.classroomId,
      });
    }
    return filters.length ? filters : undefined;
  }

  private async ensureOptionalResources(
    tenantId: string,
    query: ScheduleAvailabilityQueryDto,
  ) {
    const [instructor, vehicle, classroom] = await Promise.all([
      query.instructorId
        ? this.prisma.instructor.findFirst({
            where: {
              id: query.instructorId,
              tenantId,
              status: "ACTIVE",
            },
            select: { id: true },
          })
        : true,
      query.vehicleId
        ? this.prisma.vehicle.findFirst({
            where: { id: query.vehicleId, tenantId, status: "ACTIVE" },
            select: { id: true },
          })
        : true,
      query.classroomId
        ? this.prisma.classroom.findFirst({
            where: {
              id: query.classroomId,
              tenantId,
              unitId: query.unitId,
              active: true,
            },
            select: { id: true },
          })
        : true,
    ]);
    if (!instructor || !vehicle || !classroom) {
      throw new NotFoundException(
        "Um dos recursos ativos não foi encontrado no tenant/unidade.",
      );
    }
  }

  private insideUnitHours(
    interval: Interval,
    openingTime: string,
    closingTime: string,
  ) {
    return (
      interval.startsAt.getUTCFullYear() === interval.endsAt.getUTCFullYear() &&
      interval.startsAt.getUTCMonth() === interval.endsAt.getUTCMonth() &&
      interval.startsAt.getUTCDate() === interval.endsAt.getUTCDate() &&
      utcTime(interval.startsAt) >= openingTime &&
      utcTime(interval.endsAt) <= closingTime
    );
  }

  private overlaps(left: Interval, right: Interval) {
    return left.startsAt < right.endsAt && left.endsAt > right.startsAt;
  }
}
