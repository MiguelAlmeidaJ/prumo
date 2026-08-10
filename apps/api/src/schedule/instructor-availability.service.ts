import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RegistryStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "./audit.service";
import {
  AvailabilityQueryDto,
  CreateInstructorAvailabilityDto,
  UpdateInstructorAvailabilityDto,
} from "./dto/schedule.dto";
import { lockScheduleResources } from "./schedule.utils";

@Injectable()
export class InstructorAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateInstructorAvailabilityDto,
  ) {
    this.validateTimes(input.startsAt, input.endsAt);
    await this.ensureInstructor(tenantId, input.instructorId);
    return this.prisma.serializableTransaction(
      async (tx) => {
        await lockScheduleResources(tx, tenantId, [
          `instructor:${input.instructorId}`,
        ]);
        await this.ensureNoOverlap(tx, tenantId, input);
        const availability = await tx.instructorAvailability.create({
          data: {
            tenantId,
            instructorId: input.instructorId,
            weekday: input.weekday,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            active: input.active ?? true,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "InstructorAvailability",
          entityId: availability.id,
          action: "CREATED",
          actorUserId,
          after: availability,
        });
        return availability;
      },
    );
  }

  list(tenantId: string, query: AvailabilityQueryDto) {
    return this.prisma.instructorAvailability.findMany({
      where: {
        tenantId,
        instructorId: query.instructorId,
        weekday: query.weekday,
        active: query.active,
      },
      include: {
        instructor: { select: { id: true, name: true } },
      },
      orderBy: [{ weekday: "asc" }, { startsAt: "asc" }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const availability = await this.prisma.instructorAvailability.findFirst({
      where: { id, tenantId },
    });
    if (!availability) {
      throw new NotFoundException("Disponibilidade não encontrada.");
    }
    return availability;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateInstructorAvailabilityDto,
  ) {
    const current = await this.findOne(tenantId, id);
    const next = {
      instructorId: input.instructorId ?? current.instructorId,
      weekday: input.weekday ?? current.weekday,
      startsAt: input.startsAt ?? current.startsAt,
      endsAt: input.endsAt ?? current.endsAt,
      active: input.active ?? current.active,
    };
    this.validateTimes(next.startsAt, next.endsAt);
    await this.ensureInstructor(tenantId, next.instructorId);

    return this.prisma.serializableTransaction(
      async (tx) => {
        await lockScheduleResources(tx, tenantId, [
          `instructor:${current.instructorId}`,
          `instructor:${next.instructorId}`,
        ]);
        if (next.active) {
          await this.ensureNoOverlap(tx, tenantId, next, id);
        }
        const availability = await tx.instructorAvailability.update({
          where: { id },
          data: next,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "InstructorAvailability",
          entityId: id,
          action: "UPDATED",
          actorUserId,
          before: current,
          after: availability,
        });
        return availability;
      },
    );
  }

  async remove(tenantId: string, actorUserId: string, id: string) {
    const current = await this.findOne(tenantId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, {
        tenantId,
        entityType: "InstructorAvailability",
        entityId: id,
        action: "DELETED",
        actorUserId,
        before: current,
      });
      await tx.instructorAvailability.delete({ where: { id } });
    });
  }

  private validateTimes(startsAt: string, endsAt: string): void {
    if (startsAt >= endsAt) {
      throw new ConflictException(
        "O horário final deve ser posterior ao inicial.",
      );
    }
  }

  private async ensureInstructor(
    tenantId: string,
    instructorId: string,
  ): Promise<void> {
    const instructor = await this.prisma.instructor.findFirst({
      where: {
        id: instructorId,
        tenantId,
        status: RegistryStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!instructor) {
      throw new NotFoundException(
        "Instrutor ativo não encontrado neste tenant.",
      );
    }
  }

  private async ensureNoOverlap(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: {
      instructorId: string;
      weekday: CreateInstructorAvailabilityDto["weekday"];
      startsAt: string;
      endsAt: string;
    },
    excludeId?: string,
  ): Promise<void> {
    const overlap = await tx.instructorAvailability.findFirst({
      where: {
        tenantId,
        instructorId: input.instructorId,
        weekday: input.weekday,
        active: true,
        id: excludeId ? { not: excludeId } : undefined,
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException(
        "A disponibilidade sobrepõe outra faixa do instrutor.",
      );
    }
  }
}
