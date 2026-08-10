import { Injectable, NotFoundException } from "@nestjs/common";
import {
  DomainEventType,
  Prisma,
  RegistryStatus,
  StudentProcessStatus,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { DomainEventService } from "../communication/domain-event.service";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { RegistryStatusDto } from "../common/dto/registry-status.dto";
import {
  nullable,
  optionalDate,
  throwConflict,
} from "../common/registration.utils";
import {
  CreateStudentDto,
  StudentAddressDto,
  StudentDocumentDto,
  StudentNoteDto,
  StudentProcessDto,
  UpdateStudentDto,
} from "./dto/student.dto";

const studentSummarySelect = {
  id: true,
  name: true,
  socialName: true,
  cpf: true,
  birthDate: true,
  email: true,
  phone: true,
  secondaryPhone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StudentSelect;

const studentDetailInclude = {
  address: {
    select: {
      id: true,
      zipCode: true,
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
    },
  },
  documents: {
    select: {
      id: true,
      type: true,
      number: true,
      issuingAuthority: true,
      issuedAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
  notes: {
    select: { id: true, content: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  },
  processes: {
    select: {
      id: true,
      category: true,
      renach: true,
      status: true,
      openedAt: true,
      completedAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.StudentInclude;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async create(tenantId: string, input: CreateStudentDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            tenantId,
            name: input.name.trim(),
            socialName: nullable(input.socialName),
            cpf: input.cpf,
            birthDate: optionalDate(input.birthDate),
            email: nullable(input.email)?.toLowerCase(),
            phone: nullable(input.phone),
            secondaryPhone: nullable(input.secondaryPhone),
            status: input.status ?? RegistryStatus.ACTIVE,
            address: input.address
              ? { create: this.addressData(input.address) }
              : undefined,
            documents: input.documents?.length
              ? {
                  create: input.documents.map((document) =>
                    this.documentData(document),
                  ),
                }
              : undefined,
            notes: input.notes?.length
              ? {
                  create: input.notes.map((note) => this.noteData(note)),
                }
              : undefined,
            processes: input.processes?.length
              ? {
                  create: input.processes.map((process) =>
                    this.processData(process),
                  ),
                }
              : undefined,
          },
          select: studentSummarySelect,
        });
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.STUDENT_CREATED,
          aggregateType: "Student",
          aggregateId: student.id,
          payload: {
            studentId: student.id,
            studentName: student.name,
          },
          idempotencyKey: `student-created:${tenantId}:${student.id}`,
        });
        return student;
      });
    } catch (error) {
      throwConflict(error, "CPF já cadastrado neste tenant.");
    }
  }

  async list(tenantId: string, query: PaginationQueryDto) {
    const search = query.search?.trim();
    const cpfSearch = search?.replace(/\D/g, "");
    const where: Prisma.StudentWhereInput = {
      tenantId,
      status: query.status,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { cpf: { contains: cpfSearch || search } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              { secondaryPhone: { contains: search } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: studentSummarySelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.student.count({ where }),
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
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
      select: {
        ...studentSummarySelect,
        ...studentDetailInclude,
      },
    });

    if (!student) throw new NotFoundException("Aluno não encontrado.");
    return student;
  }

  async update(tenantId: string, id: string, input: UpdateStudentDto) {
    await this.ensureExists(tenantId, id);
    const { address, documents, notes, processes, ...student } = input;

    try {
      await this.prisma.student.update({
        where: { id },
        data: {
          name: student.name?.trim(),
          socialName: nullable(student.socialName),
          cpf: student.cpf,
          birthDate: optionalDate(student.birthDate),
          email: nullable(student.email)?.toLowerCase(),
          phone: nullable(student.phone),
          secondaryPhone: nullable(student.secondaryPhone),
          status: student.status,
          address: address
            ? {
                upsert: {
                  create: this.addressData(address),
                  update: this.addressData(address),
                },
              }
            : undefined,
          documents: documents?.length
            ? {
                create: documents.map((document) =>
                  this.documentData(document),
                ),
              }
            : undefined,
          notes: notes?.length
            ? {
                create: notes.map((note) => this.noteData(note)),
              }
            : undefined,
          processes: processes?.length
            ? {
                create: processes.map((process) => this.processData(process)),
              }
            : undefined,
        },
      });
    } catch (error) {
      throwConflict(error, "CPF ou documento já cadastrado neste tenant.");
    }

    return this.findOne(tenantId, id);
  }

  async updateStatus(tenantId: string, id: string, input: RegistryStatusDto) {
    await this.ensureExists(tenantId, id);
    return this.prisma.student.update({
      where: { id },
      data: { status: input.status },
      select: studentSummarySelect,
    });
  }

  private async ensureExists(tenantId: string, id: string): Promise<void> {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("Aluno não encontrado.");
  }

  private addressData(address: StudentAddressDto) {
    return {
      zipCode: address.zipCode.replace(/\D/g, ""),
      street: address.street.trim(),
      number: address.number.trim(),
      complement: nullable(address.complement),
      neighborhood: address.neighborhood.trim(),
      city: address.city.trim(),
      state: address.state,
    };
  }

  private documentData(document: StudentDocumentDto) {
    return {
      type: document.type,
      number: document.number.trim(),
      issuingAuthority: nullable(document.issuingAuthority),
      issuedAt: optionalDate(document.issuedAt),
      expiresAt: optionalDate(document.expiresAt),
    };
  }

  private noteData(note: StudentNoteDto) {
    return { content: note.content.trim() };
  }

  private processData(process: StudentProcessDto) {
    return {
      category: process.category,
      renach: nullable(process.renach),
      status: process.status ?? StudentProcessStatus.OPEN,
      openedAt: process.openedAt ? new Date(process.openedAt) : undefined,
      completedAt: optionalDate(process.completedAt),
      expiresAt: optionalDate(process.expiresAt),
    };
  }
}
