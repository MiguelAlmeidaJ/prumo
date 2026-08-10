import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CashMovementType,
  CashRegisterStatus,
  ExpenseStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../schedule/audit.service";
import {
  CashMovementDto,
  CashRegisterQueryDto,
  CloseCashRegisterDto,
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  ExpenseQueryDto,
  OpenCashRegisterDto,
  PayExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from "./dto/financial.dto";
import { nullable, pagination, rethrowUnique } from "./financial.utils";

const cashInclude = {
  unit: { select: { id: true, name: true } },
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  movements: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.CashRegisterInclude;

const expenseInclude = {
  unit: { select: { id: true, name: true } },
  category: true,
  cashRegister: { select: { id: true, status: true } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class CashExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async openCash(
    tenantId: string,
    actorUserId: string,
    input: OpenCashRegisterDto,
  ) {
    try {
      return await this.prisma.serializableTransaction(async (tx) => {
        const unit = await tx.schoolUnit.findFirst({
          where: { id: input.unitId, tenantId, active: true },
        });
        if (!unit) throw new NotFoundException("Unidade não encontrada.");
        const existing = await tx.cashRegister.findFirst({
          where: {
            tenantId,
            status: CashRegisterStatus.OPEN,
            OR: [{ unitId: input.unitId }, { openedByUserId: actorUserId }],
          },
        });
        if (existing) {
          throw new ConflictException(
            "Já existe caixa aberto para esta unidade ou usuário.",
          );
        }
        const cash = await tx.cashRegister.create({
          data: {
            tenantId,
            unitId: input.unitId,
            openingBalanceCents: input.openingBalanceCents,
            expectedBalanceCents: input.openingBalanceCents,
            openedByUserId: actorUserId,
            notes: nullable(input.notes),
          },
        });
        const opening = await tx.cashMovement.create({
          data: {
            tenantId,
            cashRegisterId: cash.id,
            type: CashMovementType.OPENING,
            amountCents: input.openingBalanceCents,
            description: "Abertura do caixa",
            createdByUserId: actorUserId,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "CashRegister",
          entityId: cash.id,
          action: "OPENED",
          actorUserId,
          after: { cash, opening },
        });
        return tx.cashRegister.findUniqueOrThrow({
          where: { id: cash.id },
          include: cashInclude,
        });
      });
    } catch (error) {
      rethrowUnique(
        error,
        "Já existe caixa aberto para esta unidade ou usuário.",
      );
    }
  }

  currentCash(tenantId: string, actorUserId: string, unitId?: string) {
    return this.prisma.cashRegister.findFirst({
      where: {
        tenantId,
        unitId,
        openedByUserId: unitId ? undefined : actorUserId,
        status: CashRegisterStatus.OPEN,
      },
      include: cashInclude,
      orderBy: { openedAt: "desc" },
    });
  }

  async listCash(tenantId: string, query: CashRegisterQueryDto) {
    const where: Prisma.CashRegisterWhereInput = {
      tenantId,
      unitId: query.unitId,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.cashRegister.findMany({
        where,
        include: {
          unit: { select: { id: true, name: true } },
          openedBy: { select: { id: true, name: true } },
        },
        orderBy: { openedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.cashRegister.count({ where }),
    ]);
    return { data, meta: pagination(query.page, query.pageSize, total) };
  }

  async findCash(tenantId: string, id: string) {
    const cash = await this.prisma.cashRegister.findFirst({
      where: { id, tenantId },
      include: cashInclude,
    });
    if (!cash) throw new NotFoundException("Caixa não encontrado.");
    return cash;
  }

  supply(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: CashMovementDto,
  ) {
    return this.manualMovement(
      tenantId,
      actorUserId,
      id,
      CashMovementType.SUPPLY,
      input,
    );
  }

  withdrawal(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: CashMovementDto,
  ) {
    return this.manualMovement(
      tenantId,
      actorUserId,
      id,
      CashMovementType.WITHDRAWAL,
      input,
    );
  }

  adjustment(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: CashMovementDto,
  ) {
    return this.manualMovement(
      tenantId,
      actorUserId,
      id,
      CashMovementType.ADJUSTMENT,
      input,
    );
  }

  async closeCash(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: CloseCashRegisterDto,
  ) {
    return this.prisma.serializableTransaction(async (tx) => {
      const before = await tx.cashRegister.findFirst({
        where: { id, tenantId },
        include: cashInclude,
      });
      if (!before) throw new NotFoundException("Caixa não encontrado.");
      if (before.status !== CashRegisterStatus.OPEN) {
        throw new ConflictException("O caixa já está fechado.");
      }
      const claimed = await tx.cashRegister.updateMany({
        where: {
          id,
          tenantId,
          status: CashRegisterStatus.OPEN,
          expectedBalanceCents: before.expectedBalanceCents,
        },
        data: {
          status: CashRegisterStatus.CLOSED,
          countedBalanceCents: input.countedBalanceCents,
          differenceCents:
            input.countedBalanceCents - before.expectedBalanceCents,
          closedByUserId: actorUserId,
          closedAt: new Date(),
          notes: nullable(input.notes),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "O caixa foi alterado por outra operação; tente novamente.",
        );
      }
      await tx.cashMovement.create({
        data: {
          tenantId,
          cashRegisterId: id,
          type: CashMovementType.CLOSING,
          amountCents: input.countedBalanceCents,
          description: "Fechamento do caixa",
          createdByUserId: actorUserId,
        },
      });
      const after = await tx.cashRegister.findUniqueOrThrow({
        where: { id },
        include: cashInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "CashRegister",
        entityId: id,
        action: "CLOSED",
        actorUserId,
        before,
        after,
      });
      return after;
    });
  }

  async createExpenseCategory(
    tenantId: string,
    actorUserId: string,
    input: CreateExpenseCategoryDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await tx.expenseCategory.create({
          data: { tenantId, name: input.name.trim() },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "ExpenseCategory",
          entityId: category.id,
          action: "CREATED",
          actorUserId,
          after: category,
        });
        return category;
      });
    } catch (error) {
      rethrowUnique(error, "Categoria de despesa já cadastrada.");
    }
  }

  listExpenseCategories(tenantId: string) {
    return this.prisma.expenseCategory.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
  }

  async updateExpenseCategory(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateExpenseCategoryDto,
  ) {
    const before = await this.prisma.expenseCategory.findFirst({
      where: { id, tenantId },
    });
    if (!before) throw new NotFoundException("Categoria não encontrada.");
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.expenseCategory.update({
        where: { id },
        data: { name: input.name?.trim(), active: input.active },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ExpenseCategory",
        entityId: id,
        action: "UPDATED",
        actorUserId,
        before,
        after,
      });
      return after;
    });
  }

  async createExpense(
    tenantId: string,
    actorUserId: string,
    input: CreateExpenseDto,
  ) {
    await this.validateExpenseLinks(tenantId, input.unitId, input.categoryId);
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          tenantId,
          unitId: input.unitId,
          categoryId: input.categoryId,
          supplierName: nullable(input.supplierName),
          description: input.description.trim(),
          amountCents: input.amountCents,
          dueDate: new Date(input.dueDate),
          status:
            new Date(input.dueDate) < new Date()
              ? ExpenseStatus.OVERDUE
              : ExpenseStatus.PENDING,
          createdByUserId: actorUserId,
        },
        include: expenseInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Expense",
        entityId: expense.id,
        action: "CREATED",
        actorUserId,
        after: expense,
      });
      return expense;
    });
  }

  async listExpenses(tenantId: string, query: ExpenseQueryDto) {
    await this.refreshOverdueExpenses(tenantId);
    const where: Prisma.ExpenseWhereInput = {
      tenantId,
      unitId: query.unitId,
      categoryId: query.categoryId,
      status: query.status,
      dueDate:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lt: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
      OR: query.search
        ? [
            {
              description: { contains: query.search, mode: "insensitive" },
            },
            {
              supplierName: { contains: query.search, mode: "insensitive" },
            },
          ]
        : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: { dueDate: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data, meta: pagination(query.page, query.pageSize, total) };
  }

  async findExpense(tenantId: string, id: string) {
    await this.refreshOverdueExpenses(tenantId);
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId },
      include: expenseInclude,
    });
    if (!expense) throw new NotFoundException("Despesa não encontrada.");
    return expense;
  }

  async updateExpense(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateExpenseDto,
  ) {
    const before = await this.findExpense(tenantId, id);
    if (before.status === ExpenseStatus.PAID) {
      throw new ConflictException("Despesa paga é imutável.");
    }
    if (before.status === ExpenseStatus.CANCELLED) {
      throw new ConflictException("Despesa cancelada é imutável.");
    }
    await this.validateExpenseLinks(
      tenantId,
      input.unitId ?? before.unitId,
      input.categoryId ?? before.categoryId,
    );
    return this.prisma.serializableTransaction(async (tx) => {
      const claimed = await tx.expense.updateMany({
        where: {
          id,
          tenantId,
          status: { in: [ExpenseStatus.PENDING, ExpenseStatus.OVERDUE] },
          updatedAt: before.updatedAt,
        },
        data: {
          unitId: input.unitId,
          categoryId: input.categoryId,
          supplierName: nullable(input.supplierName),
          description: input.description?.trim(),
          amountCents: input.amountCents,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "A despesa foi processada ou alterada por outra operação.",
        );
      }
      const after = await tx.expense.findUniqueOrThrow({
        where: { id },
        include: expenseInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Expense",
        entityId: id,
        action: "UPDATED",
        actorUserId,
        before,
        after,
      });
      return after;
    });
  }

  async payExpense(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: PayExpenseDto,
  ) {
    return this.prisma.serializableTransaction(async (tx) => {
      const before = await tx.expense.findFirst({
        where: { id, tenantId },
        include: expenseInclude,
      });
      if (!before) throw new NotFoundException("Despesa não encontrada.");
      if (
        before.status !== ExpenseStatus.PENDING &&
        before.status !== ExpenseStatus.OVERDUE
      ) {
        throw new ConflictException("A despesa não pode ser paga.");
      }
      const cash =
        input.paymentMethod === PaymentMethod.CASH && input.cashRegisterId
          ? await tx.cashRegister.findFirst({
              where: {
                id: input.cashRegisterId,
                tenantId,
                unitId: before.unitId,
                status: CashRegisterStatus.OPEN,
              },
            })
          : null;
      if (input.paymentMethod === PaymentMethod.CASH && !cash) {
        throw new ConflictException(
          "Despesa em dinheiro exige caixa aberto na mesma unidade.",
        );
      }
      const claimed = await tx.expense.updateMany({
        where: {
          id,
          tenantId,
          status: { in: [ExpenseStatus.PENDING, ExpenseStatus.OVERDUE] },
          updatedAt: before.updatedAt,
        },
        data: {
          status: ExpenseStatus.PAID,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          paymentMethod: input.paymentMethod,
          cashRegisterId: cash?.id,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "A despesa foi processada por outra operação.",
        );
      }
      if (cash) {
        const cashClaimed = await tx.cashRegister.updateMany({
          where: {
            id: cash.id,
            tenantId,
            status: CashRegisterStatus.OPEN,
            expectedBalanceCents: { gte: before.amountCents },
          },
          data: {
            expectedBalanceCents: { decrement: before.amountCents },
          },
        });
        if (cashClaimed.count !== 1) {
          throw new ConflictException(
            "O caixa foi fechado ou não possui saldo suficiente.",
          );
        }
        const movement = await tx.cashMovement.create({
          data: {
            tenantId,
            cashRegisterId: cash.id,
            type: CashMovementType.EXPENSE,
            amountCents: before.amountCents,
            expenseId: id,
            description: before.description,
            createdByUserId: actorUserId,
          },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "CashMovement",
          entityId: movement.id,
          action: "EXPENSE",
          actorUserId,
          after: movement,
        });
      }
      const after = await tx.expense.findUniqueOrThrow({
        where: { id },
        include: expenseInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Expense",
        entityId: id,
        action: "PAID",
        actorUserId,
        before,
        after,
      });
      return after;
    });
  }

  async cancelExpense(
    tenantId: string,
    actorUserId: string,
    id: string,
    reason: string,
  ) {
    const before = await this.findExpense(tenantId, id);
    if (before.status === ExpenseStatus.PAID) {
      throw new ConflictException(
        "Despesa paga exige estorno explícito antes do cancelamento.",
      );
    }
    if (before.status === ExpenseStatus.CANCELLED) {
      throw new ConflictException("A despesa já foi cancelada.");
    }
    return this.prisma.serializableTransaction(async (tx) => {
      const claimed = await tx.expense.updateMany({
        where: {
          id,
          tenantId,
          status: { in: [ExpenseStatus.PENDING, ExpenseStatus.OVERDUE] },
          updatedAt: before.updatedAt,
        },
        data: {
          status: ExpenseStatus.CANCELLED,
          description: `${before.description} — ${reason.trim()}`,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "A despesa foi processada por outra operação.",
        );
      }
      const after = await tx.expense.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Expense",
        entityId: id,
        action: "CANCELLED",
        actorUserId,
        before,
        after,
      });
      return after;
    });
  }

  private async manualMovement(
    tenantId: string,
    actorUserId: string,
    id: string,
    type: CashMovementType,
    input: CashMovementDto,
  ) {
    const decrement = type === CashMovementType.WITHDRAWAL;
    return this.prisma.serializableTransaction(async (tx) => {
      const cash = await tx.cashRegister.findFirst({
        where: { id, tenantId },
        include: cashInclude,
      });
      if (!cash) throw new NotFoundException("Caixa não encontrado.");
      if (cash.status !== CashRegisterStatus.OPEN) {
        throw new ConflictException("Caixa fechado é imutável.");
      }
      if (decrement && input.amountCents > cash.expectedBalanceCents) {
        throw new ConflictException("Saldo insuficiente para retirada.");
      }
      const claimed = await tx.cashRegister.updateMany({
        where: {
          id,
          tenantId,
          status: CashRegisterStatus.OPEN,
          expectedBalanceCents: decrement
            ? { gte: input.amountCents }
            : undefined,
        },
        data: {
          expectedBalanceCents: {
            increment: decrement ? -input.amountCents : input.amountCents,
          },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "O caixa foi fechado ou não possui saldo suficiente.",
        );
      }
      const movement = await tx.cashMovement.create({
        data: {
          tenantId,
          cashRegisterId: id,
          type,
          amountCents: input.amountCents,
          description: input.reason.trim(),
          createdByUserId: actorUserId,
        },
      });
      const after = await tx.cashRegister.findUniqueOrThrow({
        where: { id },
        include: cashInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "CashMovement",
        entityId: movement.id,
        action: type,
        actorUserId,
        before: cash,
        after: { movement, cash: after },
      });
      return movement;
    });
  }

  private async validateExpenseLinks(
    tenantId: string,
    unitId: string,
    categoryId: string,
  ) {
    const [unit, category] = await Promise.all([
      this.prisma.schoolUnit.findFirst({
        where: { id: unitId, tenantId, active: true },
      }),
      this.prisma.expenseCategory.findFirst({
        where: { id: categoryId, tenantId, active: true },
      }),
    ]);
    if (!unit || !category) {
      throw new NotFoundException(
        "Unidade ou categoria não pertence ao tenant ativo.",
      );
    }
  }

  private refreshOverdueExpenses(tenantId: string) {
    return this.prisma.expense.updateMany({
      where: {
        tenantId,
        status: ExpenseStatus.PENDING,
        dueDate: { lt: new Date() },
      },
      data: { status: ExpenseStatus.OVERDUE },
    });
  }
}
