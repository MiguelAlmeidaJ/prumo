import type {
  InstructorSummary,
  Permission,
  StudentDetail,
  StudentSummary,
  VehicleSummary,
} from "@prumo/contracts";

export interface RegistryField {
  name: string;
  label: string;
  type?: "text" | "email" | "date" | "number";
  placeholder?: string;
  required?: boolean;
  section?: string;
  span?: 1 | 2;
  maxLength?: number;
}

export interface BaseRegistryRecord {
  id: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface RegistryConfig<T extends BaseRegistryRecord> {
  endpoint: string;
  route: string;
  singular: string;
  plural: string;
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  readPermission: Permission;
  createPermission: Permission;
  updatePermission: Permission;
  statusPermission: Permission;
  fields: RegistryField[];
  primary: (item: T) => string;
  secondary: (item: T) => string;
  tertiary: (item: T) => string;
  emptyValues: Record<string, string>;
  fromRecord: (item: T) => Record<string, string>;
  toPayload: (values: Record<string, string>) => Record<string, unknown>;
}

function dateValue(value: string | null): string {
  return value?.slice(0, 10) ?? "";
}

function optional(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

function formatCpf(cpf: string): string {
  return cpf.replace(
    /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
    "$1.$2.$3-$4",
  );
}

export const studentConfig: RegistryConfig<StudentSummary | StudentDetail> = {
  endpoint: "/students",
  route: "/students",
  singular: "aluno",
  plural: "alunos",
  title: "Alunos",
  subtitle: "Cadastros e processos vinculados à autoescola ativa.",
  searchPlaceholder: "Buscar por nome, CPF, e-mail ou telefone",
  readPermission: "students.read",
  createPermission: "students.create",
  updatePermission: "students.update",
  statusPermission: "students.status",
  fields: [
    {
      name: "name",
      label: "Nome completo",
      required: true,
      section: "Dados pessoais",
      span: 2,
    },
    { name: "socialName", label: "Nome social", span: 2 },
    { name: "cpf", label: "CPF", required: true, placeholder: "000.000.000-00" },
    { name: "birthDate", label: "Data de nascimento", type: "date" },
    { name: "email", label: "E-mail", type: "email", span: 2 },
    { name: "phone", label: "Telefone" },
    { name: "secondaryPhone", label: "Telefone alternativo" },
    {
      name: "zipCode",
      label: "CEP",
      section: "Endereço",
      placeholder: "00000-000",
    },
    { name: "street", label: "Logradouro", span: 2 },
    { name: "number", label: "Número" },
    { name: "complement", label: "Complemento" },
    { name: "neighborhood", label: "Bairro" },
    { name: "city", label: "Cidade" },
    { name: "state", label: "UF", maxLength: 2 },
    {
      name: "processCategory",
      label: "Categoria pretendida",
      section: "Processo inicial",
      placeholder: "B",
    },
    { name: "renach", label: "RENACH" },
  ],
  primary: (item) => item.name,
  secondary: (item) => formatCpf(item.cpf),
  tertiary: (item) => item.email ?? item.phone ?? "Sem contato",
  emptyValues: {
    name: "",
    socialName: "",
    cpf: "",
    birthDate: "",
    email: "",
    phone: "",
    secondaryPhone: "",
    zipCode: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    processCategory: "",
    renach: "",
  },
  fromRecord: (record) => {
    const detail = record as StudentDetail;
    return {
      name: record.name,
      socialName: record.socialName ?? "",
      cpf: formatCpf(record.cpf),
      birthDate: dateValue(record.birthDate),
      email: record.email ?? "",
      phone: record.phone ?? "",
      secondaryPhone: record.secondaryPhone ?? "",
      zipCode: detail.address?.zipCode ?? "",
      street: detail.address?.street ?? "",
      number: detail.address?.number ?? "",
      complement: detail.address?.complement ?? "",
      neighborhood: detail.address?.neighborhood ?? "",
      city: detail.address?.city ?? "",
      state: detail.address?.state ?? "",
      processCategory: "",
      renach: "",
    };
  },
  toPayload: (values) => {
    const hasAddress = [
      "zipCode",
      "street",
      "number",
      "neighborhood",
      "city",
      "state",
    ].some((field) => values[field]?.trim());
    const hasProcess = values.processCategory?.trim();

    return {
      name: values.name,
      socialName: optional(values.socialName),
      cpf: values.cpf,
      birthDate: optional(values.birthDate),
      email: optional(values.email),
      phone: optional(values.phone),
      secondaryPhone: optional(values.secondaryPhone),
      address: hasAddress
        ? {
            zipCode: values.zipCode,
            street: values.street,
            number: values.number,
            complement: optional(values.complement),
            neighborhood: values.neighborhood,
            city: values.city,
            state: values.state,
          }
        : undefined,
      processes: hasProcess
        ? [
            {
              category: values.processCategory,
              renach: optional(values.renach),
            },
          ]
        : undefined,
    };
  },
};

export const instructorConfig: RegistryConfig<InstructorSummary> = {
  endpoint: "/instructors",
  route: "/instructors",
  singular: "instrutor",
  plural: "instrutores",
  title: "Instrutores",
  subtitle: "Equipe habilitada para conduzir a formação dos alunos.",
  searchPlaceholder: "Buscar por nome, CPF, e-mail, telefone ou CNH",
  readPermission: "instructors.read",
  createPermission: "instructors.create",
  updatePermission: "instructors.update",
  statusPermission: "instructors.status",
  fields: [
    {
      name: "name",
      label: "Nome completo",
      required: true,
      section: "Dados pessoais",
      span: 2,
    },
    { name: "cpf", label: "CPF", required: true },
    { name: "email", label: "E-mail", type: "email" },
    { name: "phone", label: "Telefone" },
    {
      name: "license",
      label: "Número da CNH",
      required: true,
      section: "Habilitação",
    },
    { name: "licenseCategory", label: "Categoria" },
    { name: "licenseExpiresAt", label: "Validade da CNH", type: "date" },
    { name: "credentialNumber", label: "Credencial do instrutor" },
  ],
  primary: (item) => item.name,
  secondary: (item) => formatCpf(item.cpf),
  tertiary: (item) =>
    item.license
      ? `CNH ${item.license} • ${item.licenseCategory ?? "Sem categoria"}`
      : "CNH não informada",
  emptyValues: {
    name: "",
    cpf: "",
    email: "",
    phone: "",
    license: "",
    licenseCategory: "",
    licenseExpiresAt: "",
    credentialNumber: "",
  },
  fromRecord: (item) => ({
    name: item.name,
    cpf: formatCpf(item.cpf),
    email: item.email ?? "",
    phone: item.phone ?? "",
    license: item.license ?? "",
    licenseCategory: item.licenseCategory ?? "",
    licenseExpiresAt: dateValue(item.licenseExpiresAt),
    credentialNumber: item.credentialNumber ?? "",
  }),
  toPayload: (values) => ({
    name: values.name,
    cpf: values.cpf,
    email: optional(values.email),
    phone: optional(values.phone),
    license: optional(values.license),
    licenseCategory: optional(values.licenseCategory),
    licenseExpiresAt: optional(values.licenseExpiresAt),
    credentialNumber: optional(values.credentialNumber),
  }),
};

export const vehicleConfig: RegistryConfig<VehicleSummary> = {
  endpoint: "/vehicles",
  route: "/vehicles",
  singular: "veículo",
  plural: "veículos",
  title: "Veículos",
  subtitle: "Frota disponível no ambiente ativo da autoescola.",
  searchPlaceholder: "Buscar por placa, marca, modelo ou Renavam",
  readPermission: "vehicles.read",
  createPermission: "vehicles.create",
  updatePermission: "vehicles.update",
  statusPermission: "vehicles.status",
  fields: [
    {
      name: "plate",
      label: "Placa",
      required: true,
      section: "Identificação",
      placeholder: "ABC1D23",
    },
    { name: "renavam", label: "Renavam" },
    { name: "chassis", label: "Chassi", span: 2 },
    {
      name: "brand",
      label: "Marca",
      section: "Características",
    },
    { name: "model", label: "Modelo", required: true },
    { name: "year", label: "Ano", type: "number" },
    { name: "color", label: "Cor" },
    { name: "category", label: "Categoria" },
  ],
  primary: (item) => `${item.brand ?? ""} ${item.model}`.trim(),
  secondary: (item) => item.plate,
  tertiary: (item) =>
    [item.year, item.color, item.category && `Categoria ${item.category}`]
      .filter(Boolean)
      .join(" • ") || "Detalhes não informados",
  emptyValues: {
    plate: "",
    renavam: "",
    chassis: "",
    brand: "",
    model: "",
    year: "",
    color: "",
    category: "",
  },
  fromRecord: (item) => ({
    plate: item.plate,
    renavam: item.renavam ?? "",
    chassis: item.chassis ?? "",
    brand: item.brand ?? "",
    model: item.model,
    year: item.year?.toString() ?? "",
    color: item.color ?? "",
    category: item.category ?? "",
  }),
  toPayload: (values) => ({
    plate: values.plate,
    renavam: optional(values.renavam),
    chassis: optional(values.chassis),
    brand: optional(values.brand),
    model: values.model,
    year: values.year ? Number(values.year) : undefined,
    color: optional(values.color),
    category: optional(values.category),
  }),
};
