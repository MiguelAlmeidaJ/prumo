import * as ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { MigrationFileParser } from "./migration-file.parser";

describe("MigrationFileParser", () => {
  const parser = new MigrationFileParser();

  it("lê CSV separado por ponto e vírgula", async () => {
    const parsed = await parser.parse(
      "alunos.csv",
      Buffer.from("Codigo;NomeAluno;CPF\r\n1;Maria;52998224725"),
    );

    expect(parsed.headers).toEqual(["Codigo", "NomeAluno", "CPF"]);
    expect(parsed.rows).toEqual([
      { Codigo: "1", NomeAluno: "Maria", CPF: "52998224725" },
    ]);
  });

  it("lê a primeira aba de um XLSX", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Alunos");
    sheet.addRow(["legacyId", "name", "cpf"]);
    sheet.addRow(["ALUNO-1", "João", "52998224725"]);
    const content = await workbook.xlsx.writeBuffer();

    const parsed = await parser.parse("alunos.xlsx", Buffer.from(content));

    expect(parsed.format).toBe("XLSX");
    expect(parsed.rows[0]).toMatchObject({
      legacyId: "ALUNO-1",
      name: "João",
      cpf: "52998224725",
    });
  });

  it("rejeita cabeçalhos duplicados", async () => {
    await expect(
      parser.parse("duplicado.csv", Buffer.from("CPF;CPF\r\n1;2")),
    ).rejects.toThrow("Coluna duplicada");
  });
});
