import type {
  CommercialBillingInterval,
  PlatformPlanStatus,
  TenantSubscriptionStatus,
} from "@prumo/contracts";

export const planStatusLabels: Record<PlatformPlanStatus, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const subscriptionStatusLabels: Record<
  TenantSubscriptionStatus | "PAST_DUE",
  string
> = {
  DRAFT: "Rascunho",
  TRIALING: "Em implantação",
  ACTIVE: "Ativa",
  PAST_DUE: "Revisão necessária",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

export const billingIntervalLabels: Record<
  CommercialBillingInterval | "MANUAL",
  string
> = {
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
  MANUAL: "Personalizada",
};

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Indeterminada";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatCompanyDocument(value: string | null): string {
  if (!value) return "CNPJ não informado";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function parseCurrencyToCents(value: string): number {
  const normalized = value
    .trim()
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Informe um valor válido em reais.");
  }
  return Math.round(amount * 100);
}

export function referencePriceForInterval(
  monthlyPriceCents: number,
  annualPriceCents: number | null,
  interval: CommercialBillingInterval,
): number {
  if (interval === "ANNUAL" && annualPriceCents !== null) {
    return annualPriceCents;
  }
  const months: Record<CommercialBillingInterval, number> = {
    MONTHLY: 1,
    QUARTERLY: 3,
    SEMIANNUAL: 6,
    ANNUAL: 12,
  };
  return monthlyPriceCents * months[interval];
}
