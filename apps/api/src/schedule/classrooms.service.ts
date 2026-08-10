import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { throwConflict } from "../common/registration.utils";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "./audit.service";
import {
  ActiveStatusDto,
  ClassroomQueryDto,
  CreateClassroomDto,
  UpdateClassroomDto,
} from "./dto/schedule.dto";

@Injectable()
export class ClassroomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateClassroomDto,
  ) {
    await this.ensureUnit(tenantId, input.unitId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const classroom = await tx.classroom.create({
          data: {
            tenantId,
            unitId: input.unitId,
            name: input.name.trim(),
            capacity: input.capacity,
            active: input.active ?? true,
          },
          include: { unit: { select: { id: true, name: true } } },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "Classroom",
          entityId: classroom.id,
          action: "CREATED",
          actorUserId,
          after: classroom,
        });
        return classroom;
      });
    } catch (error) {
      throwConflict(error, "Já existe uma sala com este nome na unidade.");
    }
  }

  async list(tenantId: string, query: ClassroomQueryDto) {
    const where: Prisma.ClassroomWhereInput = {
      tenantId,
      unitId: query.unitId,
      active: query.active,
      name: query.search
        ? { contains: query.search.trim(), mode: "insensitive" }
        : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.classroom.findMany({
        where,
        include: { unit: { select: { id: true, name: true } } },
        orderBy: [{ unit: { name: "asc" } }, { name: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.classroom.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const classroom = await this.prisma.classroom.findFirst({
      where: { id, tenantId },
      include: {
        unit: { select: { id: true, name: true } },
        _count: { select: { theoreticalClasses: true } },
      },
    });
    if (!classroom) throw new NotFoundException("Sala não encontrada.");
    return classroom;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateClassroomDto,
  ) {
    const current = await this.findOne(tenantId, id);
    if (input.unitId) await this.ensureUnit(tenantId, input.unitId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const classroom = await tx.classroom.update({
          where: { id },
          data: {
            unitId: input.unitId,
            name: input.name?.trim(),
            capacity: input.capacity,
            active: input.active,
          },
          include: { unit: { select: { id: true, name: true } } },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "Classroom",
          entityId: id,
          action: "UPDATED",
          actorUserId,
          before: current,
          after: classroom,
        });
        return classroom;
      });
    } catch (error) {
      throwConflict(error, "Já existe uma sala com este nome na unidade.");
    }
  }

  async status(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: ActiveStatusDto,
  ) {
    const current = await this.findOne(tenantId, id);
    return this.prisma.$transaction(async (tx) => {
      const classroom = await tx.classroom.update({
        where: { id },
        data: { active: input.active },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Classroom",
        entityId: id,
        action: "STATUS_CHANGED",
        actorUserId,
        before: current,
        after: classroom,
      });
      return classroom;
    });
  }

  async remove(tenantId: string, actorUserId: string, id: string) {
    const current = await this.findOne(tenantId, id);
    const count = await this.prisma.classroom.findUniqueOrThrow({
      where: { id },
      select: {
        _count: {
          select: { theoreticalClasses: true, scheduleBlocks: true },
        },
      },
    });
    if (Object.values(count._count).some((value) => value > 0)) {
      throw new ConflictException(
        "A sala possui vínculos e deve ser apenas inativada.",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, {
        tenantId,
        entityType: "Classroom",
        entityId: id,
        action: "DELETED",
        actorUserId,
        before: current,
      });
      await tx.classroom.delete({ where: { id } });
    });
  }

  private async ensureUnit(tenantId: string, unitId: string): Promise<void> {
    const unit = await this.prisma.schoolUnit.findFirst({
      where: { id: unitId, tenantId, active: true },
      select: { id: true },
    });
    if (!unit) {
      throw new NotFoundException("Unidade ativa não encontrada neste tenant.");
    }
  }
}
