import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CashMovementType,
  CashRegisterStatus,
  DomainEventType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceivableStatus,
  StudentContractStatus,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { DomainEventService } from "../communication/domain-event.service";
import { AuditService } from "../schedule/audit.service";
import {
  AmountReasonDto,
  CreatePaymentDto,
  GenerateInstallmentsDto,
  PaymentQueryDto,
  ReceivableQueryDto,
} from "./dto/financial.dto";
import {
  addMonthsUtc,
  installmentAmounts,
  installmentStatus,
  nullable,
  pagination,
  rethrowUnique,
} from "./financial.utils";

const receivableInclude = {
  student: { select: { id: true, name: true, cpf: true } },
  contract: {
    select: {
      id: true,
      contractNumber: true,
      unit: { select: { id: true, name: true } },
    },
  },
  allocations: {
    include: {
      payment: {
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          receivedAt: true,
        },
      },
    },
  },
} satisfies Prisma.ReceivableInstallmentInclude;

const paymentInclude = {
  student: { select: { id: true, name: true, cpf: true } },
  contract: { select: { id: true, contractNumber: true, unitId: true } },
  cashRegister: { select: { id: true, unitId: true, status: true } },
  allocations: {
    include: {
      installment: {
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          amountDueCents: true,
          balanceCents: true,
          status: true,
        },
      },
    },
  },
  refunds: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class ReceivablesPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: DomainEventService,
  ) {}

  async generateInstallments(
    tenantId: string,
    actorUserId: string,
    contractId: string,
    input: GenerateInstallmentsDto,
  ) {
    const contract = await this.prisma.studentContract.findFirst({
      where: { id: contractId, tenantId },
      include: { installments: true },
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado.");
    if (contract.status !== StudentContractStatus.ACTIVE) {
      throw new ConflictException("Ative o contrato antes de gerar parcelas.");
    }
    if (contract.installments.length) {
      throw new ConflictException(
        "As parcelas deste contrato já foram geradas.",
      );
    }
    const firstDueDate = new Date(input.firstDueDate);
    let schedule: Array<{ dueDate: Date; amountCents: number }>;
    if (input.customInstallments?.length) {
      schedule = input.customInstallments.map((item) => ({
        dueDate: new Date(item.dueDate),
        amountCents: item.amountCents,
      }));
      if (schedule.length !== input.quantity) {
        throw new ConflictException(
          "A quantidade não corresponde aos valores personalizados.",
        );
      }
    } else if (input.downPaymentCents > 0) {
      if (input.quantity < 2 || input.downPaymentCents >= contract.totalCents) {
        throw new ConflictException(
          "A entrada exige ao menos duas parcelas e deve ser menor que o total.",
        );
      }
      const remaining = installmentAmounts(
        contract.totalCents - input.downPaymentCents,
        input.quantity - 1,
      );
      schedule = [
        { dueDate: firstDueDate, amountCents: input.downPaymentCents },
        ...remaining.map((amountCents, index) => ({
          dueDate: addMonthsUtc(firstDueDate, index + 1),
          amountCents,
        })),
      ];
    } else {
      schedule = installmentAmounts(contract.totalCents, input.quantity).map(
        (amountCents, index) => ({
          dueDate: addMonthsUtc(firstDueDate, index),
          amountCents,
        }),
      );
    }
    if (
      schedule.reduce((sum, item) => sum + item.amountCents, 0) !==
      contract.totalCents
    ) {
      throw new ConflictException(
        "A soma das parcelas deve ser igual ao total do contrato.",
      );
    }
    try {
      return await this.prisma.serializableTransaction(async (tx) => {
        const current = await tx.studentContract.findFirst({
          where: { id: contractId, tenantId },
          include: { installments: true },
        });
        if (!current) throw new NotFoundException("Contrato não encontrado.");
        if (current.status !== StudentContractStatus.ACTIVE) {
          throw new ConflictException(
            "Ative o contrato antes de gerar parcelas.",
          );
        }
        if (current.installments.length) {
          throw new ConflictException(
            "As parcelas deste contrato já foram geradas.",
          );
        }
        if (current.totalCents !== contract.totalCents) {
          throw new ConflictException(
            "O contrato foi alterado; recalcule as parcelas.",
          );
        }
        await tx.receivableInstallment.createMany({
          data: schedule.map((item, index) => ({
            tenantId,
            contractId,
            studentId: current.studentId,
            installmentNumber: index + 1,
            dueDate: item.dueDate,
            originalAmountCents: item.amountCents,
            amountDueCents: item.amountCents,
            balanceCents: item.amountCents,
            status: installmentStatus(item.amountCents, 0, item.dueDate),
          })),
        });
        const after = await tx.receivableInstallment.findMany({
          where: { tenantId, contractId },
          orderBy: { installmentNumber: "asc" },
        });
        await this.audit.record(tx, {
          tenantId,
          entityType: "StudentContract",
          entityId: contractId,
          action: "INSTALLMENTS_GENERATED",
          actorUserId,
          before: [],
          after,
        });
        for (const installment of after) {
          await this.events.publishInTransaction(tx, {
            tenantId,
            type: DomainEventType.INSTALLMENT_CREATED,
            aggregateType: "ReceivableInstallment",
            aggregateId: installment.id,
            payload: {
              installmentId: installment.id,
              contractId,
              studentId: installment.studentId,
              dueDate: installment.dueDate.toISOString(),
              balanceCents: installment.balanceCents,
            },
            idempotencyKey: `installment-created:${tenantId}:${installment.id}`,
          });
        }
        return after;
      });
    } catch (error) {
      rethrowUnique(error, "As parcelas deste contrato já foram geradas.");
    }
  }

  async listReceivables(tenantId: string, query: ReceivableQueryDto) {
    await this.refreshOverdue(tenantId);
    const where: Prisma.ReceivableInstallmentWhereInput = {
      tenantId,
      studentId: query.studentId,
      status: query.status,
      contract: query.unitId ? { unitId: query.unitId } : undefined,
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
              student: {
                name: { contains: query.search, mode: "insensitive" },
              },
            },
            {
              contract: {
                contractNumber: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            },
          ]
        : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.receivableInstallment.findMany({
        where,
        include: receivableInclude,
        orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.receivableInstallment.count({ where }),
    ]);
    return { data, meta: pagination(query.page, query.pageSize, total) };
  }

  async findReceivable(tenantId: string, id: string) {
    await this.refreshOverdue(tenantId);
    const item = await this.prisma.receivableInstallment.findFirst({
      where: { id, tenantId },
      include: receivableInclude,
    });
    if (!item) throw new NotFoundException("Parcela não encontrada.");
    return item;
  }

  discount(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: AmountReasonDto,
  ) {
    return this.adjustReceivable(
      tenantId,
      actorUserId,
      id,
      "DISCOUNT",
      -input.amountCents,
      input.reason,
    );
  }

  interest(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: AmountReasonDto,
  ) {
    return this.adjustReceivable(
      tenantId,
      actorUserId,
      id,
      "INTEREST",
      input.amountCents,
      input.reason,
    );
  }

  fine(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: AmountReasonDto,
  ) {
    return this.adjustReceivable(
      tenantId,
      actorUserId,
      id,
      "FINE",
      input.amountCents,
      input.reason,
    );
  }

  adjustment(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: AmountReasonDto,
  ) {
    return this.adjustReceivable(
      tenantId,
      actorUserId,
      id,
      "ADJUSTMENT",
      input.amountCents,
      input.reason,
    );
  }

  async cancelReceivable(
    tenantId: string,
    actorUserId: string,
    id: string,
    reason: string,
  ) {
    const before = await this.findReceivable(tenantId, id);
    if (before.amountPaidCents > 0) {
      throw new ConflictException(
        "Parcela com pagamento não pode ser cancelada.",
      );
    }
    return this.prisma.serializableTransaction(async (tx) => {
      const claimed = await tx.receivableInstallment.updateMany({
        where: {
          id,
          tenantId,
          amountPaidCents: 0,
          status: {
            in: [
              ReceivableStatus.PENDING,
              ReceivableStatus.OVERDUE,
              ReceivableStatus.NEGOTIATED,
            ],
          },
          updatedAt: before.updatedAt,
        },
        data: {
          status: ReceivableStatus.CANCELLED,
          cancelledAt: new Date(),
          balanceCents: 0,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "A parcela recebeu pagamento ou foi alterada por outra operação.",
        );
      }
      const after = await tx.receivableInstallment.findUniqueOrThrow({
        where: { id },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ReceivableInstallment",
        entityId: id,
        action: "CANCELLED",
        actorUserId,
        before,
        after: { ...after, reason },
      });
      return after;
    });
  }

  async createPayment(
    tenantId: string,
    actorUserId: string,
    input: CreatePaymentDto,
  ) {
    const allocationTotal = input.allocations.reduce(
      (sum, allocation) => sum + allocation.amountCents,
      0,
    );
    if (allocationTotal !== input.amountCents) {
      throw new ConflictException(
        "A soma das alocações deve ser igual ao valor do pagamento.",
      );
    }
    if (
      new Set(input.allocations.map((item) => item.installmentId)).size !==
      input.allocations.length
    ) {
      throw new ConflictException(
        "Uma parcela não pode ser alocada duas vezes.",
      );
    }
    const [student, installments, settings] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: input.studentId, tenantId },
      }),
      this.prisma.receivableInstallment.findMany({
        where: {
          tenantId,
          id: { in: input.allocations.map((item) => item.installmentId) },
          studentId: input.studentId,
          contractId: input.contractId,
        },
      }),
      this.settings(tenantId),
    ]);
    if (!student || installments.length !== input.allocations.length) {
      throw new NotFoundException(
        "Aluno, contrato ou parcela não pertence ao tenant ativo.",
      );
    }
    for (const allocation of input.allocations) {
      const installment = installments.find(
        (item) => item.id === allocation.installmentId,
      )!;
      if (
        installment.status === ReceivableStatus.CANCELLED ||
        installment.status === ReceivableStatus.PAID ||
        installment.status === ReceivableStatus.REFUNDED ||
        allocation.amountCents > installment.balanceCents
      ) {
        throw new ConflictException(
          "A alocação excede o saldo ou a parcela não aceita pagamento.",
        );
      }
    }
    let cashRegisterId = input.cashRegisterId;
    if (input.paymentMethod === PaymentMethod.CASH) {
      const cash = cashRegisterId
        ? await this.prisma.cashRegister.findFirst({
            where: {
              id: cashRegisterId,
              tenantId,
              status: CashRegisterStatus.OPEN,
            },
          })
        : null;
      if (settings.requireOpenCashRegisterForCashPayment && !cash) {
        throw new ConflictException(
          "Pagamento em dinheiro exige um caixa aberto.",
        );
      }
      cashRegisterId = cash?.id;
    } else {
      cashRegisterId = undefined;
    }
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId,
          studentId: input.studentId,
          contractId: input.contractId,
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
          receivedAt: new Date(input.receivedAt),
          cashRegisterId,
          externalReference: nullable(input.externalReference),
          notes: nullable(input.notes),
          receivedByUserId: actorUserId,
        },
      });
      await tx.paymentAllocation.createMany({
        data: input.allocations.map((allocation) => ({
          tenantId,
          paymentId: payment.id,
          installmentId: allocation.installmentId,
          amountCents: allocation.amountCents,
        })),
      });
      const after = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: paymentInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Payment",
        entityId: payment.id,
        action: "CREATED",
        actorUserId,
        after,
      });
      return after;
    });
  }

  async listPayments(tenantId: string, query: PaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      studentId: query.studentId,
      status: query.status,
      paymentMethod: query.paymentMethod,
      contract: query.unitId ? { unitId: query.unitId } : undefined,
      receivedAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lt: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
      OR: query.search
        ? [
            {
              student: {
                name: { contains: query.search, mode: "insensitive" },
              },
            },
            {
              externalReference: {
                contains: query.search,
                mode: "insensitive",
              },
            },
          ]
        : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: { receivedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data, meta: pagination(query.page, query.pageSize, total) };
  }

  async findPayment(tenantId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId },
      include: paymentInclude,
    });
    if (!payment) throw new NotFoundException("Pagamento não encontrado.");
    return payment;
  }

  async confirmPayment(tenantId: string, actorUserId: string, id: string) {
    const before = await this.findPayment(tenantId, id);
    if (before.status !== PaymentStatus.PENDING) {
      throw new ConflictException("O pagamento já foi processado.");
    }
    return this.prisma.serializableTransaction(async (tx) => {
      if (before.contractId) {
        const contractClaimed = await tx.studentContract.updateMany({
          where: {
            id: before.contractId,
            tenantId,
            status: {
              in: [
                StudentContractStatus.ACTIVE,
                StudentContractStatus.DEFAULTED,
              ],
            },
          },
          data: { updatedAt: new Date() },
        });
        if (contractClaimed.count !== 1) {
          throw new ConflictException(
            "O contrato não aceita confirmação de pagamento.",
          );
        }
      }
      const claimed = await tx.payment.updateMany({
        where: { id, tenantId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.CONFIRMED, confirmedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("O pagamento já foi processado.");
      }
      for (const allocation of before.allocations) {
        const installment = await tx.receivableInstallment.findFirst({
          where: { id: allocation.installmentId, tenantId },
        });
        if (
          !installment ||
          allocation.amountCents > installment.balanceCents ||
          installment.status === ReceivableStatus.CANCELLED ||
          installment.status === ReceivableStatus.PAID
        ) {
          throw new ConflictException(
            "O saldo da parcela foi alterado; revise as alocações.",
          );
        }
        const amountPaidCents =
          installment.amountPaidCents + allocation.amountCents;
        const balanceCents = installment.amountDueCents - amountPaidCents;
        await tx.receivableInstallment.update({
          where: { id: installment.id },
          data: {
            amountPaidCents,
            balanceCents,
            status: installmentStatus(
              installment.amountDueCents,
              amountPaidCents,
              installment.dueDate,
            ),
            paidAt: balanceCents === 0 ? new Date() : null,
          },
        });
      }
      if (before.paymentMethod === PaymentMethod.CASH) {
        if (!before.cashRegisterId) {
          throw new ConflictException("Pagamento sem caixa vinculado.");
        }
        await this.cashMovement(
          tx,
          tenantId,
          actorUserId,
          before.cashRegisterId,
          CashMovementType.INCOME,
          before.amountCents,
          `Recebimento ${before.id}`,
          before.id,
        );
      }
      const after = await tx.payment.findUniqueOrThrow({
        where: { id },
        include: paymentInclude,
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Payment",
        entityId: id,
        action: "CONFIRMED",
        actorUserId,
        before,
        after,
      });
      await this.events.publishInTransaction(tx, {
        tenantId,
        type: DomainEventType.PAYMENT_CONFIRMED,
        aggregateType: "Payment",
        aggregateId: after.id,
        payload: {
          paymentId: after.id,
          studentId: after.studentId,
          amountCents: after.amountCents,
        },
        idempotencyKey: `payment-confirmed:${tenantId}:${after.id}`,
      });
      return after;
    });
  }

  async cancelPayment(
    tenantId: string,
    actorUserId: string,
    id: string,
    reason: string,
  ) {
    const before = await this.findPayment(tenantId, id);
    if (before.status !== PaymentStatus.PENDING) {
      throw new ConflictException(
        "Pagamento confirmado deve ser corrigido por estorno.",
      );
    }
    return this.prisma.serializableTransaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id, tenantId, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.CANCELLED,
          cancelledAt: new Date(),
          notes: reason.trim(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "Pagamento confirmado deve ser corrigido por estorno.",
        );
      }
      const after = await tx.payment.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, {
        tenantId,
        entityType: "Payment",
        entityId: id,
        action: "CANCELLED",
        actorUserId,
        before,
        after,
      });
      return after;
    });
  }

  async refundPayment(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: AmountReasonDto,
  ) {
    return this.prisma.serializableTransaction(async (tx) => {
      const before = await tx.payment.findFirst({
        where: { id, tenantId },
        include: paymentInclude,
      });
      if (!before) throw new NotFoundException("Pagamento não encontrado.");
      if (
        before.status !== PaymentStatus.CONFIRMED &&
        before.status !== PaymentStatus.PARTIALLY_REFUNDED
      ) {
        throw new ConflictException("O pagamento não aceita estorno.");
      }
      const available = before.amountCents - before.refundedAmountCents;
      if (input.amountCents > available) {
        throw new ConflictException("O estorno excede o valor disponível.");
      }
      const refundedAmountCents =
        before.refundedAmountCents + input.amountCents;
      const claimed = await tx.payment.updateMany({
        where: {
          id,
          tenantId,
          status: {
            in: [PaymentStatus.CONFIRMED, PaymentStatus.PARTIALLY_REFUNDED],
          },
          refundedAmountCents: before.refundedAmountCents,
        },
        data: {
          refundedAmountCents,
          status:
            refundedAmountCents === before.amountCents
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "O pagamento foi estornado por outra operação.",
        );
      }
      let remaining = input.amountCents;
      let alreadyRefunded = before.refundedAmountCents;
      for (const allocation of before.allocations) {
        const consumed = Math.min(alreadyRefunded, allocation.amountCents);
        alreadyRefunded -= consumed;
        const refundable = allocation.amountCents - consumed;
        const reversed = Math.min(remaining, refundable);
        if (!reversed) continue;
        const installment = await tx.receivableInstallment.findUniqueOrThrow({
          where: { id: allocation.installmentId },
        });
        const amountPaidCents = installment.amountPaidCents - reversed;
        const balanceCents = installment.amountDueCents - amountPaidCents;
        await tx.receivableInstallment.update({
          where: { id: installment.id },
          data: {
            amountPaidCents,
            balanceCents,
            paidAt: null,
            status:
              amountPaidCents === 0 && balanceCents === 0
                ? ReceivableStatus.REFUNDED
                : installmentStatus(
                    installment.amountDueCents,
                    amountPaidCents,
                    installment.dueDate,
                  ),
          },
        });
        remaining -= reversed;
        if (!remaining) break;
      }
      const after = await tx.payment.findUniqueOrThrow({ where: { id } });
      const refund = await tx.paymentRefund.create({
        data: {
          tenantId,
          paymentId: id,
          amountCents: input.amountCents,
          reason: input.reason.trim(),
          createdByUserId: actorUserId,
          confirmedAt: new Date(),
        },
      });
      if (
        before.paymentMethod === PaymentMethod.CASH &&
        before.cashRegisterId
      ) {
        await this.cashMovement(
          tx,
          tenantId,
          actorUserId,
          before.cashRegisterId,
          CashMovementType.REFUND,
          input.amountCents,
          `Estorno ${refund.id}`,
          before.id,
        );
      }
      await this.audit.record(tx, {
        tenantId,
        entityType: "PaymentRefund",
        entityId: refund.id,
        action: "CONFIRMED",
        actorUserId,
        before,
        after: { payment: after, refund },
      });
      await this.events.publishInTransaction(tx, {
        tenantId,
        type: DomainEventType.PAYMENT_REFUNDED,
        aggregateType: "PaymentRefund",
        aggregateId: refund.id,
        payload: {
          paymentId: after.id,
          refundId: refund.id,
          studentId: before.studentId,
          amountCents: refund.amountCents,
        },
        idempotencyKey: `payment-refunded:${tenantId}:${refund.id}`,
      });
      return refund;
    });
  }

  private async adjustReceivable(
    tenantId: string,
    actorUserId: string,
    id: string,
    kind: "DISCOUNT" | "INTEREST" | "FINE" | "ADJUSTMENT",
    delta: number,
    reason: string,
  ) {
    const before = await this.findReceivable(tenantId, id);
    if (
      before.status === ReceivableStatus.PAID ||
      before.status === ReceivableStatus.CANCELLED ||
      before.status === ReceivableStatus.REFUNDED
    ) {
      throw new ConflictException("Parcela imutável neste estado.");
    }
    const amountDueCents = before.amountDueCents + delta;
    if (amountDueCents < before.amountPaidCents) {
      throw new ConflictException("O ajuste excede o saldo da parcela.");
    }
    return this.prisma.serializableTransaction(async (tx) => {
      const claimed = await tx.receivableInstallment.updateMany({
        where: {
          id,
          tenantId,
          status: {
            notIn: [
              ReceivableStatus.PAID,
              ReceivableStatus.CANCELLED,
              ReceivableStatus.REFUNDED,
            ],
          },
          updatedAt: before.updatedAt,
        },
        data: {
          discountCents:
            kind === "DISCOUNT" ? { increment: Math.abs(delta) } : undefined,
          interestCents: kind === "INTEREST" ? { increment: delta } : undefined,
          fineCents: kind === "FINE" ? { increment: delta } : undefined,
          adjustmentCents:
            kind === "ADJUSTMENT" ? { increment: delta } : undefined,
          amountDueCents,
          balanceCents: amountDueCents - before.amountPaidCents,
          status: installmentStatus(
            amountDueCents,
            before.amountPaidCents,
            before.dueDate,
          ),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "A parcela foi paga ou alterada por outra operação.",
        );
      }
      const after = await tx.receivableInstallment.findUniqueOrThrow({
        where: { id },
      });
      await this.audit.record(tx, {
        tenantId,
        entityType: "ReceivableInstallment",
        entityId: id,
        action: kind,
        actorUserId,
        before,
        after: { ...after, reason },
      });
      return after;
    });
  }

  private async cashMovement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    cashRegisterId: string,
    type: CashMovementType,
    amountCents: number,
    description: string,
    paymentId?: string,
  ) {
    const subtract =
      type === CashMovementType.EXPENSE ||
      type === CashMovementType.WITHDRAWAL ||
      type === CashMovementType.REFUND;
    const claimed = await tx.cashRegister.updateMany({
      where: {
        id: cashRegisterId,
        tenantId,
        status: CashRegisterStatus.OPEN,
        expectedBalanceCents: subtract ? { gte: amountCents } : undefined,
      },
      data: {
        expectedBalanceCents: {
          increment: subtract ? -amountCents : amountCents,
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
        cashRegisterId,
        type,
        amountCents,
        paymentId,
        description,
        createdByUserId: actorUserId,
      },
    });
    return movement;
  }

  private async refreshOverdue(tenantId: string) {
    await this.prisma.receivableInstallment.updateMany({
      where: {
        tenantId,
        status: ReceivableStatus.PENDING,
        dueDate: { lt: new Date() },
        balanceCents: { gt: 0 },
      },
      data: { status: ReceivableStatus.OVERDUE },
    });
  }

  private async settings(tenantId: string) {
    return this.prisma.tenantFinancialSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
  }
}
