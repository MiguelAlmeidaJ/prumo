import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  ContractAdjustmentType,
  Prisma,
  ReceivableStatus,
} from "@prisma/client";

export function itemTotal(
  quantity: number,
  unitPriceCents: number,
  discountCents = 0,
  surchargeCents = 0,
) {
  const total = quantity * unitPriceCents - discountCents + surchargeCents;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new BadRequestException("O total calculado do item é inválido.");
  }
  return total;
}

export function adjustmentDelta(
  type: ContractAdjustmentType,
  amountCents: number,
) {
  return type === ContractAdjustmentType.DISCOUNT ||
    type === ContractAdjustmentType.CREDIT
    ? -amountCents
    : amountCents;
}

export function addMonthsUtc(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export function installmentAmounts(total: number, quantity: number) {
  const base = Math.floor(total / quantity);
  return Array.from({ length: quantity }, (_, index) =>
    index === quantity - 1 ? total - base * (quantity - 1) : base,
  );
}

export function installmentStatus(
  amountDueCents: number,
  amountPaidCents: number,
  dueDate: Date,
): ReceivableStatus {
  if (amountPaidCents >= amountDueCents) return ReceivableStatus.PAID;
  if (amountPaidCents > 0) return ReceivableStatus.PARTIALLY_PAID;
  if (dueDate < new Date()) return ReceivableStatus.OVERDUE;
  return ReceivableStatus.PENDING;
}

export function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export function nullable(value: string | undefined) {
  if (value === undefined) return undefined;
  return value.trim() || null;
}

export function rethrowUnique(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
