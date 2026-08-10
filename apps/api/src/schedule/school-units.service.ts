import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { nullable, throwConflict } from "../common/registration.utils";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "./audit.service";
import {
  ActiveStatusDto,
  CreateSchoolUnitDto,
  PageQueryDto,
  UpdateSchoolUnitDto,
} from "./dto/schedule.dto";

@Injectable()
export class SchoolUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateSchoolUnitDto,
  ) {
    this.validateHours(input.openingTime, input.closingTime);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.schoolUnit.create({
          data: {
            tenantId,
            name: input.name.trim(),
            document: nullable(input.document),
            phone: input.phone.trim(),
            email: input.email.trim().toLowerCase(),
            address: input.address.trim(),
            openingTime: input.openingTime,
            closingTime: input.closingTime,
            active: input.active ?? true,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "SchoolUnit",
          entityId: unit.id,
          action: "CREATED",
          actorUserId,
          after: unit,
        });
        return unit;
      });
    } catch (error) {
      throwConflict(error, "Nome ou documento já cadastrado neste tenant.");
    }
  }

  async list(tenantId: string, query: PageQueryDto) {
    const where: Prisma.SchoolUnitWhereInput = {
      tenantId,
      active: query.active,
      ...(query.search
        ? {
            OR: [
              {
                name: { contains: query.search.trim(), mode: "insensitive" },
              },
              { document: { contains: query.search.replace(/\D/g, "") } },
              {
                address: {
                  contains: query.search.trim(),
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.schoolUnit.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.schoolUnit.count({ where }),
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
    const unit = await this.prisma.schoolUnit.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { classrooms: true } } },
    });
    if (!unit) throw new NotFoundException("Unidade não encontrada.");
    return unit;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateSchoolUnitDto,
  ) {
    const current = await this.findOne(tenantId, id);
    this.validateHours(
      input.openingTime ?? current.openingTime,
      input.closingTime ?? current.closingTime,
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.schoolUnit.update({
          where: { id },
          data: {
            name: input.name?.trim(),
            document: nullable(input.document),
            phone: input.phone?.trim(),
            email: input.email?.trim().toLowerCase(),
            address: input.address?.trim(),
            openingTime: input.openingTime,
            closingTime: input.closingTime,
            active: input.active,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "SchoolUnit",
          entityId: id,
          action: "UPDATED",
          actorUserId,
          before: current,
          after: unit,
        });
        return unit;
      });
    } catch (error) {
      throwConflict(error, "Nome ou documento já cadastrado neste tenant.");
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
      const unit = await tx.schoolUnit.update({
        where: { id },
        data: { active: input.active },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "SchoolUnit",
        entityId: id,
        action: "STATUS_CHANGED",
        actorUserId,
        before: current,
        after: unit,
      });
      return unit;
    });
  }

  async remove(tenantId: string, actorUserId: string, id: string) {
    const current = await this.findOne(tenantId, id);
    const links = await this.prisma.schoolUnit.findUniqueOrThrow({
      where: { id },
      select: {
        _count: {
          select: {
            classrooms: true,
            lessons: true,
            theoreticalClasses: true,
            scheduleBlocks: true,
          },
        },
      },
    });
    if (Object.values(links._count).some((count) => count > 0)) {
      throw new ConflictException(
        "A unidade possui vínculos e deve ser apenas inativada.",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, {
        tenantId,
        entityType: "SchoolUnit",
        entityId: id,
        action: "DELETED",
        actorUserId,
        before: current,
      });
      await tx.schoolUnit.delete({ where: { id } });
    });
  }

  private validateHours(openingTime: string, closingTime: string): void {
    if (openingTime >= closingTime) {
      throw new ConflictException(
        "O horário de fechamento deve ser posterior à abertura.",
      );
    }
  }
}
