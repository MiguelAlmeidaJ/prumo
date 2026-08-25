import { BadRequestException, Injectable } from "@nestjs/common";
import { ImportFileFormat } from "@prumo/database";
import * as ExcelJS from "exceljs";
import { Readable } from "node:stream";

export type ParsedImportRow = Record<string, string>;

export interface ParsedImportFile {
  format: ImportFileFormat;
  headers: string[];
  rows: ParsedImportRow[];
}

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 100;

function extension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index + 1).toLowerCase();
}

function delimiterFor(buffer: Buffer): string {
  const firstLine =
    buffer
      .toString("utf8", 0, Math.min(buffer.length, 4096))
      .split(/\r?\n/, 1)[0] ?? "";
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

@Injectable()
export class MigrationFileParser {
  async parse(fileName: string, buffer: Buffer): Promise<ParsedImportFile> {
    const fileExtension = extension(fileName);
    if (fileExtension !== "csv" && fileExtension !== "xlsx") {
      throw new BadRequestException("Envie um arquivo CSV ou XLSX.");
    }
    if (buffer.length === 0) {
      throw new BadRequestException("O arquivo enviado está vazio.");
    }

    const workbook = new ExcelJS.Workbook();
    if (fileExtension === "csv") {
      await workbook.csv.read(Readable.from(buffer), {
        parserOptions: { delimiter: delimiterFor(buffer) },
      });
    } else {
      const arrayBuffer = Uint8Array.from(buffer).buffer;
      await workbook.xlsx.load(arrayBuffer);
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet)
      throw new BadRequestException("A planilha não possui abas.");

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    const seen = new Set<string>();
    const columnCount = Math.min(headerRow.cellCount, MAX_COLUMNS + 1);
    if (columnCount > MAX_COLUMNS) {
      throw new BadRequestException(
        `A planilha excede ${MAX_COLUMNS} colunas.`,
      );
    }
    for (let column = 1; column <= columnCount; column += 1) {
      const header = headerRow.getCell(column).text.trim();
      if (!header) continue;
      if (seen.has(header)) {
        throw new BadRequestException(`Coluna duplicada: ${header}.`);
      }
      seen.add(header);
      headers.push(header);
    }
    if (headers.length === 0) {
      throw new BadRequestException(
        "A primeira linha deve conter os nomes das colunas.",
      );
    }

    const rows: ParsedImportRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      if (rows.length >= MAX_ROWS) return;
      const parsed: ParsedImportRow = {};
      for (let column = 1; column <= columnCount; column += 1) {
        const header = headerRow.getCell(column).text.trim();
        if (header) parsed[header] = row.getCell(column).text.trim();
      }
      if (Object.values(parsed).some(Boolean)) rows.push(parsed);
    });
    if (worksheet.rowCount - 1 > MAX_ROWS) {
      throw new BadRequestException(`O arquivo excede ${MAX_ROWS} registros.`);
    }
    if (rows.length === 0) {
      throw new BadRequestException(
        "A planilha não possui registros para importar.",
      );
    }
    return {
      format:
        fileExtension === "csv" ? ImportFileFormat.CSV : ImportFileFormat.XLSX,
      headers,
      rows,
    };
  }
}
