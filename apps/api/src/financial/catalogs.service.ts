import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ContractItemSourceType,
  DomainEventType,
  Prisma,
  ServicePlanStatus,
  StudentContractStatus,
} from "@prumo/database";
import { PrismaService } from "../database/prisma.service";
import { DomainEventService } from "../communication/domain-event.service";
import { AuditService } from "../schedule/audit.service";
import {
  ActiveDto,
  ContractAdjustmentDto,
  CreateContractDto,
  CreateServiceDto,
  CreateServicePlanDto,
  FinancialPageQueryDto,
  PlanQueryDto,
  ServiceQueryDto,
  UpdateContractDto,
  UpdateServiceDto,
  UpdateServicePlanDto,
} from "./dto/financial.dto";
import {
  adjustmentDelta,
  itemTotal,
  nullable,
  pagination,
  rethrowUnique,
} from "./financial.utils";

const planInclude = {
  items: {
    include: { service: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.ServicePlanInclude;

const contractInclude = {
  student: { select: { id: true, name: true, cpf: true } },
  unit: { select: { id: true, name: true } },
  process: { select: { id: true, processType: true, status: true } },
  plan: { select: { id: true, name: true } },
  items: { include: { service: true }, orderBy: { createdAt: "asc" } },
  adjustments: { orderBy: { createdAt: "desc" } },
  installments: { orderBy: { installmentNumber: "asc" } },
  payments: {
    include: { allocations: true },
    orderBy: { receivedAt: "desc" },
  },
} satisfies Prisma.StudentContractInclude;

@Injectable()
export class CatalogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: DomainEventService,
  ) {}

  async createService(
    tenantId: string,
    actorUserId: string,
    input: CreateServiceDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.service.create({
          data: {
            tenantId,
            code: input.code.trim().toUpperCase(),
            name: input.name.trim(),
            description: nullable(input.description),
            category: input.category,
            defaultPriceCents: input.defaultPriceCents,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "Service",
          entityId: created.id,
          action: "CREATED",
          actorUserId,
          after: created,
        });
        return created;
      });
    } catch (error) {
      rethrowUnique(error, "Já existe um serviço com este código.");
    }
  }

  async listServices(tenantId: string, query: ServiceQueryDto) {
    const where: Prisma.ServiceWhereInput = {
      tenantId,
      active: query.active,
      category: query.category,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: "insensitive" } },
            { code: { contains: query.search, mode: "insensitive" } },
          ]
        : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        orderBy: [{ active: "desc" }, { name: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.service.count({ where }),
    ]);
    return { data, meta: pagination(query.page, query.pageSize, total) };
  }

  async findService(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!service) throw new NotFoundException("Serviço não encontrado.");
    return service;
  }

  async updateService(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateServiceDto,
  ) {
    const before = await this.findService(tenantId, id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const after = await tx.service.update({
          where: { id },
          data: {
            code: input.code?.trim().toUpperCase(),
            name: input.name?.trim(),
            description: nullable(input.description),
            category: input.category,
            defaultPriceCents: input.defaultPriceCents,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "Service",
          entityId: id,
          action: "UPDATED",
          actorUserId,
          before,
          after,
        });
        return after;
      });
    } catch (error) {
      rethrowUnique(error, "Já existe um serviço com este código.");
    }
  }

  async setServiceStatus(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: ActiveDto,
  ) {
    const before = await this.findService(tenantId, id);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.service.update({
        where: { id },
        data: { active: input.active },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Service",
        entityId: id,
        action: input.active ? "ACTIVATED" : "DEACTIVATED",
        actorUserId,
        before,
        after,
      });
      return after;
    });
  }

  async createPlan(
    tenantId: string,
    actorUserId: string,
    input: CreateServicePlanDto,
  ) {
    const items = await this.planItems(tenantId, input.items);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.servicePlan.create({
        data: {
          tenantId,
          name: input.name.trim(),
          description: nullable(input.description),
          totalPriceCents: items.reduce(
            (sum, item) => sum + item.totalCents,
            0,
          ),
        },
      });
      if (items.length) {
        await tx.servicePlanItem.createMany({
          data: items.map((item) => ({
            tenantId,
            planId: created.id,
            ...item,
          })),
        });
      }
      const after = await tx.servicePlan.findUniqueOrThrow({
        where: { id: created.id },
        include: planInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ServicePlan",
        entityId: created.id,
        action: "CREATED",
        actorUserId,
        after,
      });
      return after;
    });
  }

  async listPlans(tenantId: string, query: PlanQueryDto) {
    const where: Prisma.ServicePlanWhereInput = {
      tenantId,
      status: query.status,
      name: query.search
        ? { contains: query.search, mode: "insensitive" }
        : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.servicePlan.findMany({
        where,
        include: { _count: { select: { items: true, contracts: true } } },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.servicePlan.count({ where }),
    ]);
    return { data, meta: pagination(query.page, query.pageSize, total) };
  }

  async findPlan(tenantId: string, id: string) {
    const plan = await this.prisma.servicePlan.findFirst({
      where: { id, tenantId },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException("Plano não encontrado.");
    return plan;
  }

  async updatePlan(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateServicePlanDto,
  ) {
    const before = await this.findPlan(tenantId, id);
    if (before.status !== ServicePlanStatus.DRAFT) {
      throw new ConflictException(
        "Somente planos em rascunho podem ter estrutura alterada.",
      );
    }
    const items =
      input.items === undefined
        ? undefined
        : await this.planItems(tenantId, input.items);
    return this.prisma.serializableTransaction(async (tx) => {
      const claimed = await tx.servicePlan.updateMany({
        where: {
          id,
          tenantId,
          status: ServicePlanStatus.DRAFT,
          updatedAt: before.updatedAt,
        },
        data: {
          name: input.name?.trim(),
          description: nullable(input.description),
          totalPriceCents: items
            ? items.reduce((sum, item) => sum + item.totalCents, 0)
            : undefined,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "O plano foi alterado por outra operação. Atualize os dados e tente novamente.",
        );
      }
      if (items) {
        await tx.servicePlanItem.deleteMany({
          where: { tenantId, planId: id },
        });
        if (items.length) {
          await tx.servicePlanItem.createMany({
            data: items.map((item) => ({ tenantId, planId: id, ...item })),
          });
        }
      }
      const after = await tx.servicePlan.findUniqueOrThrow({
        where: { id },
        include: planInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ServicePlan",
        entityId: id,
        action: "UPDATED",
        actorUserId,
        before,
        after,
      });
      return after;
    });
  }

  activatePlan(tenantId: string, actorUserId: string, id: string) {
    return this.transitionPlan(
      tenantId,
      actorUserId,
      id,
      [ServicePlanStatus.DRAFT, ServicePlanStatus.INACTIVE],
      ServicePlanStatus.ACTIVE,
    );
  }

  deactivatePlan(tenantId: string, actorUserId: string, id: string) {
    return this.transitionPlan(
      tenantId,
      actorUserId,
      id,
      [ServicePlanStatus.ACTIVE],
      ServicePlanStatus.INACTIVE,
    );
  }

  archivePlan(tenantId: string, actorUserId: string, id: string) {
    return this.transitionPlan(
      tenantId,
      actorUserId,
      id,
      [ServicePlanStatus.DRAFT, ServicePlanStatus.INACTIVE],
      ServicePlanStatus.ARCHIVED,
    );
  }

  async createContract(
    tenantId: string,
    actorUserId: string,
    studentId: string,
    input: CreateContractDto,
  ) {
    const [student, unit, process, plan] = await Promise.all([
      this.prisma.student.findFirst({ where: { id: studentId, tenantId } }),
      this.prisma.schoolUnit.findFirst({
        where: { id: input.unitId, tenantId, active: true },
      }),
      input.processId
        ? this.prisma.studentLicenseProcess.findFirst({
            where: { id: input.processId, tenantId, studentId },
          })
        : null,
      input.planId
        ? this.prisma.servicePlan.findFirst({
            where: {
              id: input.planId,
              tenantId,
              status: ServicePlanStatus.ACTIVE,
            },
            include: { items: { include: { service: true } } },
          })
        : null,
    ]);
    if (
      !student ||
      !unit ||
      (input.processId && !process) ||
      (input.planId && !plan)
    ) {
      throw new NotFoundException(
        "Aluno, unidade, processo ou plano não pertence ao tenant ativo.",
      );
    }
    const manualItems = await this.contractItems(tenantId, input.items);
    const planItems =
      plan?.items.map((item) => ({
        serviceId: item.serviceId,
        description: item.service.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        surchargeCents: 0,
        totalCents: item.totalCents,
        sourceType: ContractItemSourceType.PLAN,
        sourceId: undefined,
      })) ?? [];
    const items = [...planItems, ...manualItems];
    if (!items.length) {
      throw new ConflictException("O contrato deve possuir ao menos um item.");
    }
    const subtotalCents = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    );
    const itemDiscount = items.reduce(
      (sum, item) => sum + item.discountCents,
      0,
    );
    const itemSurcharge = items.reduce(
      (sum, item) => sum + item.surchargeCents,
      0,
    );
    const totalCents =
      subtotalCents -
      itemDiscount -
      input.discountCents +
      itemSurcharge +
      input.surchargeCents;
    if (totalCents < 0) {
      throw new ConflictException("O total do contrato não pode ser negativo.");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.studentContract.create({
          data: {
            tenantId,
            studentId,
            unitId: input.unitId,
            processId: input.processId,
            planId: input.planId,
            contractNumber: input.contractNumber.trim().toUpperCase(),
            subtotalCents,
            discountCents: itemDiscount + input.discountCents,
            surchargeCents: itemSurcharge + input.surchargeCents,
            totalCents,
            signedAt: input.signedAt ? new Date(input.signedAt) : null,
            createdByUserId: actorUserId,
          },
        });
        await tx.studentContractItem.createMany({
          data: items.map((item) => ({
            tenantId,
            contractId: created.id,
            ...item,
          })),
        });
        const after = await tx.studentContract.findUniqueOrThrow({
          where: { id: created.id },
          include: contractInclude,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "StudentContract",
          entityId: created.id,
          action: "CREATED",
          actorUserId,
          after,
        });
        return after;
      });
    } catch (error) {
      rethrowUnique(error, "Número de contrato já utilizado neste tenant.");
    }
  }

  async listStudentContracts(
    tenantId: string,
    studentId: string,
    query: FinancialPageQueryDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) throw new NotFoundException("Aluno não encontrado.");
    const where = { tenantId, studentId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.studentContract.findMany({
        where,
        include: {
          unit: { select: { id: true, name: true } },
          plan: { select: { id: true, name: true } },
          _count: { select: { items: true, installments: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.studentContract.count({ where }),
    ]);
    return { data, meta: pagination(query.page, query.pageSize, total) };
  }

  async findContract(tenantId: string, id: string) {
    const contract = await this.prisma.studentContract.findFirst({
      where: { id, tenantId },
      include: contractInclude,
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado.");
    return contract;
  }

  async updateContract(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateContractDto,
  ) {
    const before = await this.findContract(tenantId, id);
    if (before.status !== StudentContractStatus.DRAFT) {
      throw new ConflictException(
        "Contrato ativo deve ser alterado por ajuste financeiro.",
      );
    }
    if (input.planId !== undefined && input.planId !== before.planId) {
      throw new ConflictException(
        "Para trocar o plano, crie um novo contrato em rascunho.",
      );
    }
    const unitId = input.unitId ?? before.unitId;
    const processId =
      input.processId === undefined
        ? (before.processId ?? undefined)
        : input.processId;
    const [unit, process] = await Promise.all([
      this.prisma.schoolUnit.findFirst({
        where: { id: unitId, tenantId, active: true },
      }),
      processId
        ? this.prisma.studentLicenseProcess.findFirst({
            where: {
              id: processId,
              tenantId,
              studentId: before.studentId,
            },
          })
        : null,
    ]);
    if (!unit || (processId && !process)) {
      throw new NotFoundException(
        "Unidade ou processo não pertence ao tenant e aluno.",
      );
    }
    const items =
      input.items === undefined
        ? before.items.map((item) => ({
            serviceId: item.serviceId ?? undefined,
            description: item.description,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            discountCents: item.discountCents,
            surchargeCents: item.surchargeCents,
            totalCents: item.totalCents,
            sourceType: item.sourceType,
            sourceId: item.sourceId ?? undefined,
          }))
        : await this.contractItems(tenantId, input.items);
    if (!items.length) {
      throw new ConflictException("O contrato deve possuir ao menos um item.");
    }
    const subtotalCents = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    );
    const existingItemDiscount = before.items.reduce(
      (sum, item) => sum + item.discountCents,
      0,
    );
    const existingItemSurcharge = before.items.reduce(
      (sum, item) => sum + item.surchargeCents,
      0,
    );
    const discountCents =
      items.reduce((sum, item) => sum + item.discountCents, 0) +
      (input.discountCents ??
        Math.max(0, before.discountCents - existingItemDiscount));
    const surchargeCents =
      items.reduce((sum, item) => sum + item.surchargeCents, 0) +
      (input.surchargeCents ??
        Math.max(0, before.surchargeCents - existingItemSurcharge));
    const totalCents = subtotalCents - discountCents + surchargeCents;
    if (totalCents < 0) {
      throw new ConflictException("O total do contrato não pode ser negativo.");
    }
    try {
      return await this.prisma.serializableTransaction(async (tx) => {
        const claimed = await tx.studentContract.updateMany({
          where: {
            id,
            tenantId,
            status: StudentContractStatus.DRAFT,
            updatedAt: before.updatedAt,
          },
          data: {
            unitId,
            processId,
            contractNumber: input.contractNumber?.trim().toUpperCase(),
            signedAt: input.signedAt ? new Date(input.signedAt) : undefined,
            subtotalCents,
            discountCents,
            surchargeCents,
            totalCents,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            "O contrato foi alterado por outra operação. Atualize os dados e tente novamente.",
          );
        }
        if (input.items !== undefined) {
          await tx.studentContractItem.deleteMany({
            where: { tenantId, contractId: id },
          });
          await tx.studentContractItem.createMany({
            data: items.map((item) => ({
              tenantId,
              contractId: id,
              ...item,
            })),
          });
        }
        const after = await tx.studentContract.findUniqueOrThrow({
          where: { id },
          include: contractInclude,
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "StudentContract",
          entityId: id,
          action: "UPDATED",
          actorUserId,
          before,
          after,
        });
        return after;
      });
    } catch (error) {
      rethrowUnique(error, "Número de contrato já utilizado neste tenant.");
    }
  }

  activateContract(tenantId: string, actorUserId: string, id: string) {
    return this.transitionContract(
      tenantId,
      actorUserId,
      id,
      [StudentContractStatus.DRAFT],
      StudentContractStatus.ACTIVE,
      { activatedAt: new Date() },
    );
  }

  async completeContract(tenantId: string, actorUserId: string, id: string) {
    const contract = await this.findContract(tenantId, id);
    if (
      contract.installments.some(
        (item) =>
          !["PAID", "CANCELLED", "REFUNDED"].includes(item.status) &&
          item.balanceCents > 0,
      )
    ) {
      throw new ConflictException("Existem parcelas com saldo pendente.");
    }
    return this.transitionContract(
      tenantId,
      actorUserId,
      id,
      [StudentContractStatus.ACTIVE, StudentContractStatus.DEFAULTED],
      StudentContractStatus.COMPLETED,
      { completedAt: new Date() },
    );
  }

  async cancelContract(
    tenantId: string,
    actorUserId: string,
    id: string,
    reason: string,
  ) {
    const contract = await this.findContract(tenantId, id);
    if (contract.payments.some((payment) => payment.status === "CONFIRMED")) {
      throw new ConflictException(
        "Estorne ou cancele pagamentos confirmados antes do contrato.",
      );
    }
    return this.transitionContract(
      tenantId,
      actorUserId,
      id,
      [StudentContractStatus.DRAFT, StudentContractStatus.ACTIVE],
      StudentContractStatus.CANCELLED,
      { cancelledAt: new Date(), cancellationReason: reason.trim() },
    );
  }

  async addAdjustment(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: ContractAdjustmentDto,
  ) {
    const delta = adjustmentDelta(input.type, input.amountCents);
    return this.prisma.serializableTransaction(async (tx) => {
      const contract = await tx.studentContract.findFirst({
        where: { id, tenantId },
        include: contractInclude,
      });
      if (!contract) throw new NotFoundException("Contrato não encontrado.");
      if (
        contract.status !== StudentContractStatus.ACTIVE &&
        contract.status !== StudentContractStatus.DEFAULTED
      ) {
        throw new ConflictException("O contrato não aceita ajustes.");
      }
      if (contract.totalCents + delta < 0) {
        throw new ConflictException("O ajuste tornaria o contrato negativo.");
      }
      const claimed = await tx.studentContract.updateMany({
        where: {
          id,
          tenantId,
          status: {
            in: [StudentContractStatus.ACTIVE, StudentContractStatus.DEFAULTED],
          },
          updatedAt: contract.updatedAt,
        },
        data: {
          totalCents: { increment: delta },
          discountCents:
            delta < 0 ? { increment: input.amountCents } : undefined,
          surchargeCents:
            delta > 0 ? { increment: input.amountCents } : undefined,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "O contrato foi alterado por outra operação. Atualize os dados e tente novamente.",
        );
      }
      const adjustment = await tx.contractAdjustment.create({
        data: {
          tenantId,
          contractId: id,
          type: input.type,
          amountCents: input.amountCents,
          reason: input.reason.trim(),
          createdByUserId: actorUserId,
        },
      });
      const after = await tx.studentContract.findUniqueOrThrow({
        where: { id },
      });
      const last = await tx.receivableInstallment.findFirst({
        where: {
          tenantId,
          contractId: id,
          status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
        },
        orderBy: { installmentNumber: "desc" },
      });
      if (last) {
        const due = last.amountDueCents + delta;
        const balance = due - last.amountPaidCents;
        if (due < last.amountPaidCents) {
          throw new ConflictException(
            "O ajuste é maior que o saldo das parcelas abertas.",
          );
        }
        const installmentClaimed = await tx.receivableInstallment.updateMany({
          where: {
            id: last.id,
            tenantId,
            status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
            updatedAt: last.updatedAt,
          },
          data: {
            adjustmentCents: { increment: delta },
            amountDueCents: due,
            balanceCents: balance,
          },
        });
        if (installmentClaimed.count !== 1) {
          throw new ConflictException(
            "A parcela foi alterada por outra operação. Atualize os dados e tente novamente.",
          );
        }
      }
      await this.audit.record(tx, {
        tenantId,
        entityType: "ContractAdjustment",
        entityId: adjustment.id,
        action: "CREATED",
        actorUserId,
        before: contract,
        after: { adjustment, contract: after },
      });
      return adjustment;
    });
  }

  private async planItems(
    tenantId: string,
    inputs: CreateServicePlanDto["items"],
  ) {
    const ids = [...new Set(inputs.map((item) => item.serviceId))];
    if (ids.length !== inputs.length) {
      throw new ConflictException("Um serviço não pode ser repetido no plano.");
    }
    const services = await this.prisma.service.findMany({
      where: { tenantId, id: { in: ids }, active: true },
    });
    if (services.length !== ids.length) {
      throw new NotFoundException(
        "Um ou mais serviços estão inativos ou pertencem a outro tenant.",
      );
    }
    return inputs.map((input) => {
      const service = services.find((item) => item.id === input.serviceId)!;
      const unitPriceCents = input.unitPriceCents ?? service.defaultPriceCents;
      return {
        serviceId: service.id,
        quantity: input.quantity,
        unitPriceCents,
        discountCents: input.discountCents,
        totalCents: itemTotal(
          input.quantity,
          unitPriceCents,
          input.discountCents,
        ),
      };
    });
  }

  private async contractItems(
    tenantId: string,
    inputs: CreateContractDto["items"],
  ) {
    const ids = inputs
      .map((item) => item.serviceId)
      .filter((id): id is string => Boolean(id));
    const services = await this.prisma.service.findMany({
      where: { tenantId, id: { in: ids }, active: true },
    });
    if (services.length !== new Set(ids).size) {
      throw new NotFoundException(
        "Um serviço do contrato está inativo ou pertence a outro tenant.",
      );
    }
    return inputs.map((input) => ({
      serviceId: input.serviceId,
      description: input.description.trim(),
      quantity: input.quantity,
      unitPriceCents: input.unitPriceCents,
      discountCents: input.discountCents,
      surchargeCents: input.surchargeCents,
      totalCents: itemTotal(
        input.quantity,
        input.unitPriceCents,
        input.discountCents,
        input.surchargeCents,
      ),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    }));
  }

  private async transitionPlan(
    tenantId: string,
    actorUserId: string,
    id: string,
    allowed: ServicePlanStatus[],
    status: ServicePlanStatus,
  ) {
    const before = await this.findPlan(tenantId, id);
    if (!allowed.includes(before.status)) {
      throw new ConflictException("Transição de plano inválida.");
    }
    if (status === ServicePlanStatus.ACTIVE && !before.items.length) {
      throw new ConflictException("Plano sem itens não pode ser ativado.");
    }
    return this.prisma.serializableTransaction(async (tx) => {
      const claimed = await tx.servicePlan.updateMany({
        where: { id, tenantId, status: { in: allowed } },
        data: { status },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Transição de plano inválida.");
      }
      const after = await tx.servicePlan.findUniqueOrThrow({
        where: { id },
        include: planInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ServicePlan",
        entityId: id,
        action: status,
        actorUserId,
        before,
        after,
      });
      return after;
    });
  }

  private async transitionContract(
    tenantId: string,
    actorUserId: string,
    id: string,
    allowed: StudentContractStatus[],
    status: StudentContractStatus,
    extra: Prisma.StudentContractUpdateManyMutationInput = {},
  ) {
    const before = await this.findContract(tenantId, id);
    if (!allowed.includes(before.status)) {
      throw new ConflictException("Transição de contrato inválida.");
    }
    return this.prisma.serializableTransaction(async (tx) => {
      const claimed = await tx.studentContract.updateMany({
        where: { id, tenantId, status: { in: allowed } },
        data: { status, ...extra },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Transição de contrato inválida.");
      }
      const after = await tx.studentContract.findUniqueOrThrow({
        where: { id },
        include: contractInclude,
      });
      if (
        status === StudentContractStatus.COMPLETED &&
        after.installments.some(
          (item) =>
            !["PAID", "CANCELLED", "REFUNDED"].includes(item.status) &&
            item.balanceCents > 0,
        )
      ) {
        throw new ConflictException("Existem parcelas com saldo pendente.");
      }
      if (
        status === StudentContractStatus.CANCELLED &&
        after.payments.some((payment) => payment.status === "CONFIRMED")
      ) {
        throw new ConflictException(
          "Estorne ou cancele pagamentos confirmados antes do contrato.",
        );
      }
      await this.audit.record(tx, {
        tenantId,
        entityType: "StudentContract",
        entityId: id,
        action: status,
        actorUserId,
        before,
        after,
      });
      if (status === StudentContractStatus.ACTIVE) {
        await this.events.publishInTransaction(tx, {
          tenantId,
          type: DomainEventType.CONTRACT_ACTIVATED,
          aggregateType: "StudentContract",
          aggregateId: after.id,
          payload: {
            contractId: after.id,
            studentId: after.studentId,
            totalCents: after.totalCents,
          },
          idempotencyKey: `contract-activated:${tenantId}:${after.id}`,
        });
      }
      return after;
    });
  }
}
