import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RegistryStatus } from "@prumo/database";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { RegistryStatusDto } from "../common/dto/registry-status.dto";
import {
  nullable,
  optionalDate,
  throwConflict,
} from "../common/registration.utils";
import { PrismaService } from "../database/prisma.service";
import {
  CreateInstructorDto,
  UpdateInstructorDto,
} from "./dto/instructor.dto";

const instructorSelect = {
  id: true,
  name: true,
  cpf: true,
  email: true,
  phone: true,
  license: true,
  licenseCategory: true,
  licenseExpiresAt: true,
  credentialNumber: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InstructorSelect;

@Injectable()
export class InstructorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, input: CreateInstructorDto) {
    try {
      return await this.prisma.instructor.create({
        data: {
          tenantId,
          name: input.name.trim(),
          cpf: input.cpf,
          email: nullable(input.email)?.toLowerCase(),
          phone: nullable(input.phone),
          license: nullable(input.license),
          licenseCategory: nullable(input.licenseCategory),
          licenseExpiresAt: optionalDate(input.licenseExpiresAt),
          credentialNumber: nullable(input.credentialNumber),
          status: input.status ?? RegistryStatus.ACTIVE,
        },
        select: instructorSelect,
      });
    } catch (error) {
      throwConflict(error, "CPF já cadastrado neste tenant.");
    }
  }

  async list(tenantId: string, query: PaginationQueryDto) {
    const search = query.search?.trim();
    const cpfSearch = search?.replace(/\D/g, "");
    const where: Prisma.InstructorWhereInput = {
      tenantId,
      status: query.status,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { cpf: { contains: cpfSearch || search } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              { license: { contains: search } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.instructor.findMany({
        where,
        select: instructorSelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.instructor.count({ where }),
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
    const instructor = await this.prisma.instructor.findFirst({
      where: { id, tenantId },
      select: instructorSelect,
    });
    if (!instructor) throw new NotFoundException("Instrutor não encontrado.");
    return instructor;
  }

  async update(tenantId: string, id: string, input: UpdateInstructorDto) {
    await this.ensureExists(tenantId, id);
    try {
      return await this.prisma.instructor.update({
        where: { id },
        data: this.data(input),
        select: instructorSelect,
      });
    } catch (error) {
      throwConflict(error, "CPF já cadastrado neste tenant.");
    }
  }

  async updateStatus(
    tenantId: string,
    id: string,
    input: RegistryStatusDto,
  ) {
    await this.ensureExists(tenantId, id);
    return this.prisma.instructor.update({
      where: { id },
      data: { status: input.status },
      select: instructorSelect,
    });
  }

  private async ensureExists(tenantId: string, id: string): Promise<void> {
    const instructor = await this.prisma.instructor.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!instructor) throw new NotFoundException("Instrutor não encontrado.");
  }

  private data(input: UpdateInstructorDto | CreateInstructorDto) {
    return {
      name: input.name?.trim(),
      cpf: input.cpf,
      email: nullable(input.email)?.toLowerCase(),
      phone: nullable(input.phone),
      license: nullable(input.license),
      licenseCategory: nullable(input.licenseCategory),
      licenseExpiresAt: optionalDate(input.licenseExpiresAt),
      credentialNumber: nullable(input.credentialNumber),
      status: input.status,
    };
  }
}
