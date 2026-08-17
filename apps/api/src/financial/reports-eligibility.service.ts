import { ConflictException, Injectable } from "@nestjs/common";
import {
  ContractItemSourceType,
  FinancialServiceCategory,
  isPrismaKnownRequestError,
  PaymentStatus,
  ReceivableStatus,
  StudentContractStatus,
} from "@prumo/database";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../schedule/audit.service";
import {
  FinancialReportQueryDto,
  UpdateFinancialSettingsDto,
} from "./dto/financial.dto";
import { itemTotal } from "./financial.utils";

const OPEN_RECEIVABLE_STATUSES: ReceivableStatus[] = [
  ReceivableStatus.PENDING,
  ReceivableStatus.PARTIALLY_PAID,
  ReceivableStatus.OVERDUE,
  ReceivableStatus.NEGOTIATED,
];

@Injectable()
export class FinancialEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  canScheduleLesson(tenantId: string, studentId: string) {
    return this.check(tenantId, studentId);
  }

  canScheduleExam(tenantId: string, studentId: string) {
    return this.check(tenantId, studentId);
  }

  async overdueBalance(tenantId: string, studentId: string) {
    await this.prisma.receivableInstallment.updateMany({
      where: {
        tenantId,
        studentId,
        status: ReceivableStatus.PENDING,
        dueDate: { lt: new Date() },
        balanceCents: { gt: 0 },
      },
      data: { status: ReceivableStatus.OVERDUE },
    });
    const result = await this.prisma.receivableInstallment.aggregate({
      where: {
        tenantId,
        studentId,
        status: ReceivableStatus.OVERDUE,
      },
      _sum: { balanceCents: true },
    });
    return result._sum.balanceCents ?? 0;
  }

  private async check(tenantId: string, studentId: string) {
    const settings = await this.prisma.tenantFinancialSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
    const overdueBalanceCents = await this.overdueBalance(tenantId, studentId);
    const blocked =
      settings.blockSchedulingWithDebt &&
      overdueBalanceCents > settings.debtToleranceCents;
    return {
      allowed: !blocked,
      overdueBalanceCents,
      toleranceCents: settings.debtToleranceCents,
      reason: blocked
        ? {
            code: "OVERDUE_BALANCE",
            message: "Aluno bloqueado por saldo vencido acima da tolerância.",
          }
        : null,
    };
  }
}

@Injectable()
export class AutomaticChargeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async chargeExamRetest(input: {
    tenantId: string;
    actorUserId: string;
    examId: string;
    studentId: string;
    processId: string;
    attemptNumber: number;
  }) {
    if (input.attemptNumber <= 1) return null;
    const settings = await this.prisma.tenantFinancialSettings.findUnique({
      where: { tenantId: input.tenantId },
    });
    if (!settings?.autoChargeExamRetest) return null;
    return this.charge({
      ...input,
      sourceType: ContractItemSourceType.EXAM,
      sourceId: input.examId,
      category: FinancialServiceCategory.RETEST,
      description: `Reteste — tentativa ${input.attemptNumber}`,
    });
  }

  async chargeExtraLesson(input: {
    tenantId: string;
    actorUserId: string;
    lessonId: string;
    studentId: string;
    processId?: string | null;
  }) {
    const settings = await this.prisma.tenantFinancialSettings.findUnique({
      where: { tenantId: input.tenantId },
    });
    if (!settings?.autoChargeExtraLesson) return null;
    const contract = await this.prisma.studentContract.findFirst({
      where: {
        tenantId: input.tenantId,
        studentId: input.studentId,
        processId: input.processId ?? undefined,
        status: StudentContractStatus.ACTIVE,
      },
      include: {
        items: { include: { service: true } },
      },
      orderBy: { activatedAt: "desc" },
    });
    if (!contract) return null;
    const packageQuantity = contract.items
      .filter(
        (item) =>
          item.service?.category ===
          FinancialServiceCategory.PRACTICAL_LESSON_PACKAGE,
      )
      .reduce((sum, item) => sum + item.quantity, 0);
    const lessonCount = await this.prisma.lesson.count({
      where: {
        tenantId: input.tenantId,
        studentId: input.studentId,
        processId: input.processId ?? undefined,
        status: { not: "CANCELLED" },
      },
    });
    if (lessonCount <= packageQuantity) return null;
    return this.charge({
      ...input,
      processId: input.processId ?? "",
      sourceType: ContractItemSourceType.PRACTICAL_LESSON,
      sourceId: input.lessonId,
      category: FinancialServiceCategory.PRACTICAL_LESSON,
      description: "Aula prática adicional",
    });
  }

  private async charge(input: {
    tenantId: string;
    actorUserId: string;
    studentId: string;
    processId: string;
    sourceType: ContractItemSourceType;
    sourceId: string;
    category: FinancialServiceCategory;
    description: string;
  }) {
    try {
      return await this.prisma.serializableTransaction(async (tx) => {
        const duplicate = await tx.studentContractItem.findFirst({
          where: {
            tenantId: input.tenantId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          },
        });
        if (duplicate) return duplicate;
        const [contract, service] = await Promise.all([
          tx.studentContract.findFirst({
            where: {
              tenantId: input.tenantId,
              studentId: input.studentId,
              processId: input.processId || undefined,
              status: StudentContractStatus.ACTIVE,
            },
            orderBy: { activatedAt: "desc" },
          }),
          tx.service.findFirst({
            where: {
              tenantId: input.tenantId,
              category: input.category,
              active: true,
            },
            orderBy: { createdAt: "asc" },
          }),
        ]);
        if (!contract || !service) return null;
        const totalCents = itemTotal(1, service.defaultPriceCents);
        const claimed = await tx.studentContract.updateMany({
          where: {
            id: contract.id,
            tenantId: input.tenantId,
            status: StudentContractStatus.ACTIVE,
            updatedAt: contract.updatedAt,
          },
          data: {
            subtotalCents: { increment: totalCents },
            totalCents: { increment: totalCents },
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            "O contrato foi alterado por outra operação. Tente novamente.",
          );
        }
        const item = await tx.studentContractItem.create({
          data: {
            tenantId: input.tenantId,
            contractId: contract.id,
            serviceId: service.id,
            description: input.description,
            quantity: 1,
            unitPriceCents: service.defaultPriceCents,
            totalCents,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          },
        });
        const updatedContract = await tx.studentContract.findUniqueOrThrow({
          where: { id: contract.id },
        });
        const last = await tx.receivableInstallment.findFirst({
          where: {
            tenantId: input.tenantId,
            contractId: contract.id,
            status: { in: [...OPEN_RECEIVABLE_STATUSES] },
          },
          orderBy: { installmentNumber: "desc" },
        });
        if (last) {
          await tx.receivableInstallment.update({
            where: { id: last.id },
            data: {
              adjustmentCents: { increment: totalCents },
              amountDueCents: { increment: totalCents },
              balanceCents: { increment: totalCents },
            },
          });
        }
        await this.audit.record(tx, {
          tenantId: input.tenantId,
          entityType: "StudentContractItem",
          entityId: item.id,
          action: "AUTO_CHARGED",
          actorUserId: input.actorUserId,
          after: { item, contract: updatedContract },
        });
        return item;
      });
    } catch (error) {
      if (
        isPrismaKnownRequestError(error) &&
        error.code === "P2002"
      ) {
        const duplicate = await this.prisma.studentContractItem.findFirst({
          where: {
            tenantId: input.tenantId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          },
        });
        if (duplicate) return duplicate;
      }
      throw error;
    }
  }
}

@Injectable()
export class FinancialReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async settings(tenantId: string) {
    return this.prisma.tenantFinancialSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
  }

  updateSettings(tenantId: string, input: UpdateFinancialSettingsDto) {
    return this.prisma.tenantFinancialSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: input,
    });
  }

  async dashboard(tenantId: string, query: FinancialReportQueryDto) {
    const period = this.period(query);
    const [
      receivables,
      overdue,
      received,
      expenses,
      cash,
      activeContracts,
      tickets,
    ] = await this.prisma.$transaction([
      this.prisma.receivableInstallment.aggregate({
        where: {
          tenantId,
          status: { in: [...OPEN_RECEIVABLE_STATUSES] },
          contract: query.unitId ? { unitId: query.unitId } : undefined,
        },
        _sum: { balanceCents: true },
      }),
      this.prisma.receivableInstallment.aggregate({
        where: {
          tenantId,
          status: ReceivableStatus.OVERDUE,
          contract: query.unitId ? { unitId: query.unitId } : undefined,
        },
        _sum: { balanceCents: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          tenantId,
          status: {
            in: [PaymentStatus.CONFIRMED, PaymentStatus.PARTIALLY_REFUNDED],
          },
          receivedAt: period,
          contract: query.unitId ? { unitId: query.unitId } : undefined,
        },
        _sum: { amountCents: true, refundedAmountCents: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          tenantId,
          status: "PAID",
          paidAt: period,
          unitId: query.unitId,
        },
        _sum: { amountCents: true },
      }),
      this.prisma.cashRegister.aggregate({
        where: {
          tenantId,
          status: "OPEN",
          unitId: query.unitId,
        },
        _sum: { expectedBalanceCents: true },
      }),
      this.prisma.studentContract.count({
        where: {
          tenantId,
          status: StudentContractStatus.ACTIVE,
          unitId: query.unitId,
        },
      }),
      this.prisma.studentContract.aggregate({
        where: {
          tenantId,
          status: { in: ["ACTIVE", "COMPLETED"] },
          unitId: query.unitId,
        },
        _avg: { totalCents: true },
      }),
    ]);
    const receivedCents =
      (received._sum.amountCents ?? 0) -
      (received._sum.refundedAmountCents ?? 0);
    const totalReceivableCents = receivables._sum.balanceCents ?? 0;
    const overdueCents = overdue._sum.balanceCents ?? 0;
    return {
      totalReceivableCents,
      overdueCents,
      receivedCents,
      expensesCents: expenses._sum.amountCents ?? 0,
      cashBalanceCents: cash._sum.expectedBalanceCents ?? 0,
      defaultRateBasisPoints: totalReceivableCents
        ? Math.round((overdueCents * 10_000) / totalReceivableCents)
        : 0,
      activeContracts,
      averageTicketCents: Math.round(tickets._avg.totalCents ?? 0),
    };
  }

  receivables(tenantId: string, query: FinancialReportQueryDto) {
    return this.prisma.receivableInstallment.findMany({
      where: {
        tenantId,
        studentId: query.studentId,
        dueDate: this.period(query),
        contract: query.unitId ? { unitId: query.unitId } : undefined,
      },
      include: {
        student: { select: { id: true, name: true } },
        contract: { select: { id: true, contractNumber: true, unitId: true } },
      },
      orderBy: { dueDate: "asc" },
    });
  }

  overdue(tenantId: string, query: FinancialReportQueryDto) {
    return this.prisma.receivableInstallment.findMany({
      where: {
        tenantId,
        studentId: query.studentId,
        status: ReceivableStatus.OVERDUE,
        dueDate: this.period(query),
        contract: query.unitId ? { unitId: query.unitId } : undefined,
      },
      include: { student: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
    });
  }

  payments(tenantId: string, query: FinancialReportQueryDto) {
    return this.prisma.payment.findMany({
      where: {
        tenantId,
        studentId: query.studentId,
        paymentMethod: query.paymentMethod,
        receivedAt: this.period(query),
        contract: query.unitId ? { unitId: query.unitId } : undefined,
      },
      include: { student: { select: { id: true, name: true } } },
      orderBy: { receivedAt: "desc" },
    });
  }

  cashFlow(tenantId: string, query: FinancialReportQueryDto) {
    return this.prisma.cashMovement.findMany({
      where: {
        tenantId,
        createdAt: this.period(query),
        cashRegister: query.unitId ? { unitId: query.unitId } : undefined,
      },
      include: {
        cashRegister: {
          select: { id: true, unit: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  expenses(tenantId: string, query: FinancialReportQueryDto) {
    return this.prisma.expense.findMany({
      where: {
        tenantId,
        unitId: query.unitId,
        categoryId: query.categoryId,
        paidAt: this.period(query),
      },
      include: { category: true, unit: { select: { id: true, name: true } } },
      orderBy: { dueDate: "desc" },
    });
  }

  async revenueByService(tenantId: string, query: FinancialReportQueryDto) {
    const items = await this.prisma.studentContractItem.findMany({
      where: {
        tenantId,
        serviceId: query.serviceId,
        contract: {
          unitId: query.unitId,
          payments: {
            some: {
              status: {
                in: [PaymentStatus.CONFIRMED, PaymentStatus.PARTIALLY_REFUNDED],
              },
              receivedAt: this.period(query),
            },
          },
        },
      },
      include: { service: { select: { id: true, name: true } } },
    });
    const grouped = new Map<
      string,
      { id: string; name: string; cents: number }
    >();
    for (const item of items) {
      const key = item.serviceId ?? "manual";
      const current = grouped.get(key) ?? {
        id: key,
        name: item.service?.name ?? "Item manual",
        cents: 0,
      };
      current.cents += item.totalCents;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => b.cents - a.cents);
  }

  async revenueByUnit(tenantId: string, query: FinancialReportQueryDto) {
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        status: {
          in: [PaymentStatus.CONFIRMED, PaymentStatus.PARTIALLY_REFUNDED],
        },
        receivedAt: this.period(query),
        contract: query.unitId ? { unitId: query.unitId } : { isNot: null },
      },
      include: {
        contract: {
          select: { unit: { select: { id: true, name: true } } },
        },
      },
    });
    const grouped = new Map<
      string,
      { id: string; name: string; cents: number }
    >();
    for (const payment of payments) {
      const unit = payment.contract?.unit;
      if (!unit) continue;
      const current = grouped.get(unit.id) ?? { ...unit, cents: 0 };
      current.cents += payment.amountCents - payment.refundedAmountCents;
      grouped.set(unit.id, current);
    }
    return [...grouped.values()].sort((a, b) => b.cents - a.cents);
  }

  private period(query: FinancialReportQueryDto) {
    return query.from || query.to
      ? {
          gte: query.from ? new Date(query.from) : undefined,
          lt: query.to ? new Date(query.to) : undefined,
        }
      : undefined;
  }
}
