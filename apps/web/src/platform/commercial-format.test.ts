import { describe, expect, it } from "vitest";
import {
  formatCompanyDocument,
  parseCurrencyToCents,
  referencePriceForInterval,
  subscriptionStatusLabels,
} from "./commercial-format";

describe("formatação comercial", () => {
  it("converte valores em reais para centavos sem expor a unidade técnica", () => {
    expect(parseCurrencyToCents("R$ 1.249,90")).toBe(124_990);
    expect(parseCurrencyToCents("399,00")).toBe(39_900);
  });

  it("usa a referência anual quando configurada", () => {
    expect(referencePriceForInterval(44_900, 480_000, "ANNUAL")).toBe(480_000);
    expect(referencePriceForInterval(44_900, null, "QUARTERLY")).toBe(134_700);
  });

  it("traduz status para a experiência em português", () => {
    expect(subscriptionStatusLabels.ACTIVE).toBe("Ativa");
    expect(subscriptionStatusLabels.TRIALING).toBe("Em implantação");
  });

  it("formata CNPJ para a experiência comercial", () => {
    expect(formatCompanyDocument("12345678000199")).toBe("12.345.678/0001-99");
  });
});
