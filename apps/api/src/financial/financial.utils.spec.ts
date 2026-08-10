import { ContractAdjustmentType, ReceivableStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  adjustmentDelta,
  addMonthsUtc,
  installmentAmounts,
  installmentStatus,
  itemTotal,
} from "./financial.utils";

describe("regras financeiras puras", () => {
  it("calcula itens e ajustes somente em centavos", () => {
    expect(itemTotal(3, 10_000, 1_500, 500)).toBe(29_000);
    expect(adjustmentDelta(ContractAdjustmentType.DISCOUNT, 500)).toBe(-500);
    expect(adjustmentDelta(ContractAdjustmentType.DEBIT, 500)).toBe(500);
  });

  it("distribui a diferença de divisão na última parcela", () => {
    expect(installmentAmounts(10_000, 3)).toEqual([3333, 3333, 3334]);
  });

  it("preserva o dia válido na periodicidade mensal e calcula status", () => {
    expect(
      addMonthsUtc(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString(),
    ).toBe("2026-02-28T12:00:00.000Z");
    expect(
      installmentStatus(10_000, 4_000, new Date("2099-01-01T00:00:00.000Z")),
    ).toBe(ReceivableStatus.PARTIALLY_PAID);
  });
});
