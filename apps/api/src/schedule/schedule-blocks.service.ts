import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RegistryStatus, ScheduleResourceType } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "./audit.service";
import {
  CreateScheduleBlockDto,
  ScheduleBlockQueryDto,
  UpdateScheduleBlockDto,
} from "./dto/schedule.dto";
import { lockScheduleResources, parseInterval } from "./schedule.utils";

type ResourceIds = {
  instructorId?: string | null;
  vehicleId?: string | null;
  classroomId?: string | null;
  unitId?: string | null;
};

@Injectable()
export class ScheduleBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateScheduleBlockDto,
  ) {
    const { start, end } = parseInterval(input.startsAt, input.endsAt);
    const resourceId = this.validateResource(input.resourceType, input);
    await this.ensureResource(tenantId, input.resourceType, resourceId);

    return this.prisma.serializableTransaction(
      async (tx) => {
        await lockScheduleResources(tx, tenantId, [
          `${input.resourceType}:${resourceId}`,
        ]);
        const block = await tx.scheduleBlock.create({
          data: {
            tenantId,
            resourceType: input.resourceType,
            instructorId: input.instructorId,
            vehicleId: input.vehicleId,
            classroomId: input.classroomId,
            unitId: input.unitId,
            startsAt: start,
            endsAt: end,
            reason: input.reason.trim(),
            createdByUserId: actorUserId,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "ScheduleBlock",
          entityId: block.id,
          action: "CREATED",
          actorUserId,
          after: block,
        });
        return block;
      },
    );
  }

  list(tenantId: string, query: ScheduleBlockQueryDto) {
    return this.prisma.scheduleBlock.findMany({
      where: {
        tenantId,
        resourceType: query.resourceType,
        startsAt: query.to ? { lt: new Date(query.to) } : undefined,
        endsAt: query.from ? { gt: new Date(query.from) } : undefined,
      },
      include: {
        instructor: { select: { id: true, name: true } },
        vehicle: { select: { id: true, plate: true, model: true } },
        classroom: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: "asc" },
    });
  }

  async findOne(tenantId: string, id: string) {
    const block = await this.prisma.scheduleBlock.findFirst({
      where: { id, tenantId },
    });
    if (!block) throw new NotFoundException("Bloqueio não encontrado.");
    return block;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateScheduleBlockDto,
  ) {
    const current = await this.findOne(tenantId, id);
    const next = {
      resourceType: input.resourceType ?? current.resourceType,
      instructorId:
        input.instructorId === undefined
          ? (current.instructorId ?? undefined)
          : input.instructorId,
      vehicleId:
        input.vehicleId === undefined
          ? (current.vehicleId ?? undefined)
          : input.vehicleId,
      classroomId:
        input.classroomId === undefined
          ? (current.classroomId ?? undefined)
          : input.classroomId,
      unitId:
        input.unitId === undefined
          ? (current.unitId ?? undefined)
          : input.unitId,
    };
    if (input.resourceType && input.resourceType !== current.resourceType) {
      next.instructorId = input.instructorId;
      next.vehicleId = input.vehicleId;
      next.classroomId = input.classroomId;
      next.unitId = input.unitId;
    }
    const resourceId = this.validateResource(next.resourceType, next);
    const { start, end } = parseInterval(
      input.startsAt ?? current.startsAt.toISOString(),
      input.endsAt ?? current.endsAt.toISOString(),
    );
    await this.ensureResource(tenantId, next.resourceType, resourceId);

    return this.prisma.$transaction(async (tx) => {
      await lockScheduleResources(tx, tenantId, [
        `${current.resourceType}:${this.currentResourceId(current)}`,
        `${next.resourceType}:${resourceId}`,
      ]);
      const block = await tx.scheduleBlock.update({
        where: { id },
        data: {
          ...next,
          instructorId: next.instructorId ?? null,
          vehicleId: next.vehicleId ?? null,
          classroomId: next.classroomId ?? null,
          unitId: next.unitId ?? null,
          startsAt: start,
          endsAt: end,
          reason: input.reason?.trim(),
        },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ScheduleBlock",
        entityId: id,
        action: "UPDATED",
        actorUserId,
        before: current,
        after: block,
      });
      return block;
    });
  }

  async remove(tenantId: string, actorUserId: string, id: string) {
    const current = await this.findOne(tenantId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, {
        tenantId,
        entityType: "ScheduleBlock",
        entityId: id,
        action: "DELETED",
        actorUserId,
        before: current,
      });
      await tx.scheduleBlock.delete({ where: { id } });
    });
  }

  private validateResource(
    type: ScheduleResourceType,
    ids: ResourceIds,
  ): string {
    const values = {
      [ScheduleResourceType.INSTRUCTOR]: ids.instructorId,
      [ScheduleResourceType.VEHICLE]: ids.vehicleId,
      [ScheduleResourceType.CLASSROOM]: ids.classroomId,
      [ScheduleResourceType.UNIT]: ids.unitId,
    };
    const provided = [
      ids.instructorId,
      ids.vehicleId,
      ids.classroomId,
      ids.unitId,
    ].filter(Boolean);
    if (!values[type] || provided.length !== 1) {
      throw new BadRequestException(
        "Informe somente o recurso correspondente ao resourceType.",
      );
    }
    return values[type];
  }

  private currentResourceId(block: ResourceIds): string {
    return (
      block.instructorId ??
      block.vehicleId ??
      block.classroomId ??
      block.unitId ??
      ""
    );
  }

  private async ensureResource(
    tenantId: string,
    type: ScheduleResourceType,
    id: string,
  ): Promise<void> {
    const exists =
      type === ScheduleResourceType.INSTRUCTOR
        ? await this.prisma.instructor.findFirst({
            where: { id, tenantId, status: RegistryStatus.ACTIVE },
          })
        : type === ScheduleResourceType.VEHICLE
          ? await this.prisma.vehicle.findFirst({
              where: { id, tenantId, status: RegistryStatus.ACTIVE },
            })
          : type === ScheduleResourceType.CLASSROOM
            ? await this.prisma.classroom.findFirst({
                where: { id, tenantId, active: true },
              })
            : await this.prisma.schoolUnit.findFirst({
                where: { id, tenantId, active: true },
              });
    if (!exists) {
      throw new NotFoundException("Recurso ativo não encontrado neste tenant.");
    }
  }
}
