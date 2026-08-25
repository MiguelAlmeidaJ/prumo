import { ImportEntityType } from "@prumo/database";

export interface ImportFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  example?: string;
}

export const MIGRATION_ENTITY_ORDER: readonly ImportEntityType[] = [
  ImportEntityType.UNITS,
  ImportEntityType.INSTRUCTORS,
  ImportEntityType.STUDENTS,
  ImportEntityType.ENROLLMENTS,
  ImportEntityType.FINANCIAL,
  ImportEntityType.LESSONS,
  ImportEntityType.EXAMS,
  ImportEntityType.DOCUMENTS,
];

export const EXECUTABLE_IMPORT_ENTITIES = new Set<ImportEntityType>([
  ImportEntityType.UNITS,
  ImportEntityType.INSTRUCTORS,
  ImportEntityType.STUDENTS,
]);

export const IMPORT_FIELDS: Record<
  ImportEntityType,
  readonly ImportFieldDefinition[]
> = {
  [ImportEntityType.UNITS]: [
    {
      key: "legacyId",
      label: "ID no sistema antigo",
      required: true,
      example: "UNIDADE-1",
    },
    { key: "name", label: "Nome", required: true, example: "Unidade Centro" },
    { key: "document", label: "CNPJ" },
    { key: "phone", label: "Telefone", required: true, example: "11999999999" },
    {
      key: "email",
      label: "E-mail",
      required: true,
      example: "centro@autoescola.com.br",
    },
    {
      key: "address",
      label: "Endereço",
      required: true,
      example: "Rua Exemplo, 100",
    },
    { key: "openingTime", label: "Abertura", example: "08:00" },
    { key: "closingTime", label: "Fechamento", example: "18:00" },
    { key: "active", label: "Ativa", example: "true" },
  ],
  [ImportEntityType.INSTRUCTORS]: [
    {
      key: "legacyId",
      label: "ID no sistema antigo",
      required: true,
      example: "INSTRUTOR-15",
    },
    { key: "name", label: "Nome", required: true, example: "Maria Souza" },
    { key: "cpf", label: "CPF", required: true, example: "52998224725" },
    { key: "email", label: "E-mail" },
    { key: "phone", label: "Telefone" },
    { key: "license", label: "CNH" },
    { key: "licenseCategory", label: "Categoria da CNH", example: "AB" },
    {
      key: "licenseExpiresAt",
      label: "Validade da CNH",
      example: "2028-12-31",
    },
    { key: "status", label: "Status", example: "ACTIVE" },
  ],
  [ImportEntityType.STUDENTS]: [
    {
      key: "legacyId",
      label: "ID no sistema antigo",
      required: true,
      example: "ALUNO-57392",
    },
    { key: "name", label: "Nome", required: true, example: "João da Silva" },
    { key: "socialName", label: "Nome social" },
    { key: "cpf", label: "CPF", required: true, example: "52998224725" },
    { key: "birthDate", label: "Data de nascimento", example: "1995-05-20" },
    { key: "email", label: "E-mail" },
    { key: "phone", label: "Telefone" },
    { key: "secondaryPhone", label: "Telefone secundário" },
    { key: "status", label: "Status", example: "ACTIVE" },
  ],
  [ImportEntityType.ENROLLMENTS]: [
    { key: "legacyId", label: "ID da matrícula", required: true },
    { key: "legacyStudentId", label: "ID legado do aluno", required: true },
  ],
  [ImportEntityType.FINANCIAL]: [
    { key: "legacyId", label: "ID financeiro", required: true },
    { key: "legacyStudentId", label: "ID legado do aluno", required: true },
    { key: "amountCents", label: "Valor em centavos", required: true },
    { key: "origin", label: "Origem", example: "LEGACY_IMPORT" },
  ],
  [ImportEntityType.LESSONS]: [
    { key: "legacyId", label: "ID da aula", required: true },
    { key: "legacyStudentId", label: "ID legado do aluno", required: true },
    {
      key: "legacyInstructorId",
      label: "ID legado do instrutor",
      required: true,
    },
  ],
  [ImportEntityType.EXAMS]: [
    { key: "legacyId", label: "ID do exame", required: true },
    { key: "legacyStudentId", label: "ID legado do aluno", required: true },
  ],
  [ImportEntityType.DOCUMENTS]: [
    { key: "legacyId", label: "ID do documento", required: true },
    { key: "legacyStudentId", label: "ID legado do aluno", required: true },
    { key: "fileName", label: "Nome do arquivo", required: true },
  ],
};

export function requiredImportFields(entityType: ImportEntityType): string[] {
  return IMPORT_FIELDS[entityType]
    .filter((field) => field.required)
    .map((field) => field.key);
}
