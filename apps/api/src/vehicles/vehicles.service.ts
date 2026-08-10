import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RegistryStatus } from "@prisma/client";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { RegistryStatusDto } from "../common/dto/registry-status.dto";
import { nullable, throwConflict } from "../common/registration.utils";
import { PrismaService } from "../database/prisma.service";
import { CreateVehicleDto, UpdateVehicleDto } from "./dto/vehicle.dto";

const vehicleSelect = {
  id: true,
  plate: true,
  brand: true,
  model: true,
  year: true,
  color: true,
  renavam: true,
  chassis: true,
  category: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VehicleSelect;

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, input: CreateVehicleDto) {
    try {
      return await this.prisma.vehicle.create({
        data: {
          tenantId,
          plate: input.plate,
          brand: nullable(input.brand),
          model: input.model.trim(),
          year: input.year,
          color: nullable(input.color),
          renavam: nullable(input.renavam),
          chassis: nullable(input.chassis),
          category: nullable(input.category),
          status: input.status ?? RegistryStatus.ACTIVE,
        },
        select: vehicleSelect,
      });
    } catch (error) {
      throwConflict(error, "Placa ou Renavam já cadastrado neste tenant.");
    }
  }

  async list(tenantId: string, query: PaginationQueryDto) {
    const search = query.search?.trim();
    const normalizedPlate = search?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const where: Prisma.VehicleWhereInput = {
      tenantId,
      status: query.status,
      ...(search
        ? {
            OR: [
              { plate: { contains: normalizedPlate || search } },
              { brand: { contains: search, mode: "insensitive" } },
              { model: { contains: search, mode: "insensitive" } },
              { renavam: { contains: search } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        select: vehicleSelect,
        orderBy: [{ model: "asc" }, { plate: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.vehicle.count({ where }),
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
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId },
      select: vehicleSelect,
    });
    if (!vehicle) throw new NotFoundException("Veículo não encontrado.");
    return vehicle;
  }

  async update(tenantId: string, id: string, input: UpdateVehicleDto) {
    await this.ensureExists(tenantId, id);
    try {
      return await this.prisma.vehicle.update({
        where: { id },
        data: this.data(input),
        select: vehicleSelect,
      });
    } catch (error) {
      throwConflict(error, "Placa ou Renavam já cadastrado neste tenant.");
    }
  }

  async updateStatus(
    tenantId: string,
    id: string,
    input: RegistryStatusDto,
  ) {
    await this.ensureExists(tenantId, id);
    return this.prisma.vehicle.update({
      where: { id },
      data: { status: input.status },
      select: vehicleSelect,
    });
  }

  private async ensureExists(tenantId: string, id: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException("Veículo não encontrado.");
  }

  private data(input: UpdateVehicleDto | CreateVehicleDto) {
    return {
      plate: input.plate,
      brand: nullable(input.brand),
      model: input.model?.trim(),
      year: input.year,
      color: nullable(input.color),
      renavam: nullable(input.renavam),
      chassis: nullable(input.chassis),
      category: nullable(input.category),
      status: input.status,
    };
  }
}
