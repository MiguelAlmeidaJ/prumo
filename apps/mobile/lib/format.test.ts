import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("formata centavos sem expor o valor bruto", () => {
    expect(formatMoney(125090)).toMatch(/R\$\s*1\.250,90/);
  });
});
