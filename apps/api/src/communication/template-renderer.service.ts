import { BadRequestException, Injectable } from "@nestjs/common";

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function valueAt(input: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, input);
}

@Injectable()
export class TemplateRendererService {
  variables(...sources: Array<string | null | undefined>): string[] {
    const variables = new Set<string>();
    for (const source of sources) {
      if (!source) continue;
      for (const match of source.matchAll(VARIABLE_PATTERN)) {
        variables.add(match[1]);
      }
    }
    return [...variables];
  }

  validate(
    allowedVariables: readonly string[],
    ...sources: Array<string | null | undefined>
  ): void {
    const invalid = this.variables(...sources).filter(
      (variable) => !allowedVariables.includes(variable),
    );
    if (invalid.length) {
      throw new BadRequestException(
        `Variáveis não permitidas: ${invalid.join(", ")}.`,
      );
    }
  }

  render(
    source: string,
    variables: Record<string, unknown>,
    options: { html?: boolean } = {},
  ): string {
    return source.replace(VARIABLE_PATTERN, (_match, path: string) => {
      const value = valueAt(variables, path);
      if (value === undefined || value === null) {
        throw new BadRequestException(`Variável ausente: ${path}.`);
      }
      const rendered =
        value instanceof Date
          ? value.toISOString()
          : typeof value === "object"
            ? JSON.stringify(value)
            : typeof value === "string"
              ? value
              : typeof value === "number" || typeof value === "boolean"
                ? `${value}`
                : JSON.stringify(value);
      return options.html ? escapeHtml(rendered) : rendered;
    });
  }
}
