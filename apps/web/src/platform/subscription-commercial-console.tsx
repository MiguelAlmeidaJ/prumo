"use client";

import type {
  CommercialBillingInterval,
  PaginatedResponse,
  PlatformPlanListResponse,
  PlatformPlanSummary,
  PlatformSubscriptionDetail,
  PlatformSubscriptionHistoryEntry,
  PlatformSubscriptionListResponse,
  PlatformSubscriptionSummary,
  PlatformTenantOption,
  TenantSubscriptionStatus,
} from "@prumo/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/auth/auth-context";
import { ActionMenu } from "@/components/action-menu";
import {
  billingIntervalLabels,
  centsToInput,
  formatCompanyDocument,
  formatCurrency,
  formatDate,
  formatDateTime,
  parseCurrencyToCents,
  referencePriceForInterval,
  subscriptionStatusLabels,
} from "./commercial-format";
import { PlatformOwnerGate } from "./platform-owner-gate";

const INTERVALS: CommercialBillingInterval[] = [
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
];

const STATUS_TONE: Record<TenantSubscriptionStatus | "PAST_DUE", string> = {
  DRAFT: "neutral",
  TRIALING: "info",
  ACTIVE: "success",
  PAST_DUE: "warning",
  SUSPENDED: "warning",
  CANCELLED: "danger",
  EXPIRED: "neutral",
};

const HISTORY_LABELS: Record<string, string> = {
  PLATFORM_SUBSCRIPTION_CREATED: "Assinatura criada",
  PLATFORM_SUBSCRIPTION_UPDATED: "Contrato atualizado",
  PLATFORM_SUBSCRIPTION_PLAN_CHANGED: "Plano alterado",
  PLATFORM_SUBSCRIPTION_PRICE_CHANGED: "Valor contratado alterado",
  PLATFORM_SUBSCRIPTION_TERM_CHANGED: "Vigência alterada",
  PLATFORM_SUBSCRIPTION_SUSPENDED: "Assinatura suspensa",
  PLATFORM_SUBSCRIPTION_REACTIVATED: "Assinatura reativada",
  PLATFORM_SUBSCRIPTION_CANCELLED: "Assinatura cancelada",
};

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="commercial-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusBadge({
  status,
}: {
  status: PlatformSubscriptionSummary["status"];
}) {
  return (
    <span
      className={`commercial-badge commercial-badge--${STATUS_TONE[status]}`}
    >
      {subscriptionStatusLabels[status]}
    </span>
  );
}

function tenantLabel(tenant: PlatformTenantOption): string {
  return tenant.document
    ? `${tenant.name} · ${formatCompanyDocument(tenant.document)}`
    : tenant.name;
}

function snapshotPlanName(
  value: Record<string, unknown> | null,
): string | null {
  if (!value) return null;
  const plan = value.plan;
  if (plan && typeof plan === "object" && "name" in plan) {
    const name = (plan as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

function snapshotPrice(value: Record<string, unknown> | null): number | null {
  const price = value?.contractedPriceCents;
  return typeof price === "number" ? price : null;
}

function historyDescription(
  entry: PlatformSubscriptionHistoryEntry,
): string | null {
  const beforePlan = snapshotPlanName(entry.before);
  const afterPlan = snapshotPlanName(entry.after);
  if (
    entry.action === "PLATFORM_SUBSCRIPTION_PLAN_CHANGED" &&
    beforePlan &&
    afterPlan
  ) {
    return `${beforePlan} → ${afterPlan}`;
  }
  const beforePrice = snapshotPrice(entry.before);
  const afterPrice = snapshotPrice(entry.after);
  if (
    entry.action === "PLATFORM_SUBSCRIPTION_PRICE_CHANGED" &&
    beforePrice !== null &&
    afterPrice !== null
  ) {
    return `${formatCurrency(beforePrice)} → ${formatCurrency(afterPrice)}`;
  }
  if (entry.action === "PLATFORM_SUBSCRIPTION_CREATED") {
    return afterPlan;
  }
  return entry.reason;
}

export function SubscriptionCatalog() {
  const { request } = useAuth();
  const [result, setResult] = useState<PlatformSubscriptionListResponse | null>(
    null,
  );
  const [plans, setPlans] = useState<PlatformPlanSummary[]>([]);
  const [search, setSearch] = useState("");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState("");
  const [billingCycle, setBillingCycle] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage = page) => {
      const query = new URLSearchParams({
        page: String(targetPage),
        pageSize: "20",
      });
      if (search.trim()) query.set("search", search.trim());
      if (planId) query.set("planId", planId);
      if (status) query.set("status", status);
      if (billingCycle) query.set("billingCycle", billingCycle);
      try {
        const response = await request<PlatformSubscriptionListResponse>(
          `/platform/subscriptions?${query.toString()}`,
        );
        setResult(response);
        setPage(targetPage);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar as assinaturas.",
        );
      } finally {
        setLoading(false);
      }
    },
    [billingCycle, page, planId, request, search, status],
  );

  useEffect(() => {
    let active = true;
    request<PlatformSubscriptionListResponse>(
      "/platform/subscriptions?page=1&pageSize=20",
    )
      .then((response) => {
        if (active) setResult(response);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar as assinaturas.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  useEffect(() => {
    request<PlatformPlanListResponse>("/platform/plans?pageSize=100")
      .then((response) => setPlans(response.data))
      .catch(() => setPlans([]));
  }, [request]);

  async function runAction(
    subscription: PlatformSubscriptionSummary,
    action: "suspend" | "reactivate" | "cancel",
  ) {
    const labels = {
      suspend: "suspender",
      reactivate: "reativar",
      cancel: "cancelar definitivamente",
    };
    if (
      !window.confirm(
        `Deseja ${labels[action]} a assinatura de ${subscription.tenant.name}?`,
      )
    ) {
      return;
    }
    try {
      await request(`/platform/subscriptions/${subscription.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          reason: `Ação comercial realizada pelo console: ${labels[action]}.`,
        }),
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Não foi possível atualizar a assinatura.",
      );
    }
  }

  return (
    <PlatformOwnerGate>
      <section className="platform-page commercial-page">
        <header className="platform-page-title">
          <div>
            <span>Gestão comercial</span>
            <h1>Assinaturas</h1>
            <p>Gestão dos contratos e planos das autoescolas.</p>
          </div>
          <Link className="platform-primary" href="/platform/subscriptions/new">
            + Nova assinatura
          </Link>
        </header>

        {error ? <div className="platform-error">{error}</div> : null}
        {result ? (
          <div className="commercial-summary-grid">
            <SummaryCard
              label="Assinaturas ativas"
              value={String(result.summary.activeSubscriptions)}
            />
            <SummaryCard
              label="Em implantação"
              value={String(result.summary.trialingSubscriptions)}
            />
            <SummaryCard
              label="Suspensas"
              value={String(result.summary.suspendedSubscriptions)}
            />
            <SummaryCard
              label="Valor mensal contratado"
              value={formatCurrency(result.summary.contractedMonthlyValueCents)}
            />
          </div>
        ) : null}

        <form
          className="commercial-filter"
          onSubmit={(event) => {
            event.preventDefault();
            void load(1);
          }}
        >
          <label className="commercial-filter-search">
            <span>Buscar autoescola</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, nome fantasia ou CNPJ"
            />
          </label>
          <label>
            <span>Plano</span>
            <select
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
            >
              <option value="">Todos os planos</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Todos os status</option>
              {Object.entries(subscriptionStatusLabels)
                .filter(([value]) => value !== "PAST_DUE")
                .map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Periodicidade</span>
            <select
              value={billingCycle}
              onChange={(event) => setBillingCycle(event.target.value)}
            >
              <option value="">Todas</option>
              {INTERVALS.map((interval) => (
                <option value={interval} key={interval}>
                  {billingIntervalLabels[interval]}
                </option>
              ))}
            </select>
          </label>
          <button className="platform-primary">Aplicar filtros</button>
        </form>

        {loading ? (
          <div className="commercial-skeleton commercial-skeleton--table" />
        ) : result?.data.length ? (
          <>
            <div className="platform-table-wrap">
              <table className="platform-table commercial-table">
                <thead>
                  <tr>
                    <th>Autoescola</th>
                    <th>Plano</th>
                    <th>Valor contratado</th>
                    <th>Periodicidade</th>
                    <th>Início</th>
                    <th>Vigência</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((subscription) => (
                    <tr key={subscription.id}>
                      <td>
                        <strong>{subscription.tenant.name}</strong>
                        {subscription.tenant.document ? (
                          <small>
                            {formatCompanyDocument(
                              subscription.tenant.document,
                            )}
                          </small>
                        ) : null}
                      </td>
                      <td>{subscription.plan.name}</td>
                      <td>
                        {formatCurrency(subscription.contractedPriceCents)}
                      </td>
                      <td>
                        {billingIntervalLabels[subscription.billingCycle]}
                      </td>
                      <td>{formatDate(subscription.startsAt)}</td>
                      <td>{formatDate(subscription.endsAt)}</td>
                      <td>
                        <StatusBadge status={subscription.status} />
                      </td>
                      <td>
                        <ActionMenu
                          label={`Ações da assinatura de ${subscription.tenant.name}`}
                        >
                          <Link
                            href={`/platform/subscriptions/${subscription.id}`}
                          >
                            Ver detalhes e editar
                          </Link>
                          {["ACTIVE", "TRIALING"].includes(
                            subscription.status,
                          ) ? (
                            <button
                              type="button"
                              onClick={() =>
                                void runAction(subscription, "suspend")
                              }
                            >
                              Suspender
                            </button>
                          ) : null}
                          {subscription.status === "SUSPENDED" ? (
                            <button
                              type="button"
                              onClick={() =>
                                void runAction(subscription, "reactivate")
                              }
                            >
                              Reativar
                            </button>
                          ) : null}
                          {!["CANCELLED", "EXPIRED"].includes(
                            subscription.status,
                          ) ? (
                            <button
                              className="commercial-danger-text"
                              type="button"
                              onClick={() =>
                                void runAction(subscription, "cancel")
                              }
                            >
                              Cancelar
                            </button>
                          ) : null}
                        </ActionMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.meta.totalPages > 1 ? (
              <nav className="commercial-pagination" aria-label="Paginação">
                <button
                  disabled={page <= 1}
                  onClick={() => void load(page - 1)}
                >
                  Anterior
                </button>
                <span>
                  Página {page} de {result.meta.totalPages}
                </span>
                <button
                  disabled={page >= result.meta.totalPages}
                  onClick={() => void load(page + 1)}
                >
                  Próxima
                </button>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="platform-empty commercial-empty">
            <h2>Nenhuma assinatura encontrada</h2>
            <p>Ajuste os filtros ou registre o primeiro contrato comercial.</p>
            <Link
              className="platform-primary"
              href="/platform/subscriptions/new"
            >
              Criar assinatura
            </Link>
          </div>
        )}
      </section>
    </PlatformOwnerGate>
  );
}

export function SubscriptionEditor({
  subscriptionId,
}: {
  subscriptionId?: string;
}) {
  const { request } = useAuth();
  const router = useRouter();
  const [subscription, setSubscription] =
    useState<PlatformSubscriptionDetail | null>(null);
  const [plans, setPlans] = useState<PlatformPlanSummary[]>([]);
  const [tenants, setTenants] = useState<PlatformTenantOption[]>([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [interval, setInterval] =
    useState<CommercialBillingInterval>("MONTHLY");
  const [contractedPrice, setContractedPrice] = useState("");
  const [indefinite, setIndefinite] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [planResponse, tenantResponse, detail] = await Promise.all([
        request<PlatformPlanListResponse>(
          "/platform/plans?status=ACTIVE&pageSize=100",
        ),
        request<PaginatedResponse<PlatformTenantOption>>(
          "/platform/tenants?pageSize=100",
        ),
        subscriptionId
          ? request<PlatformSubscriptionDetail>(
              `/platform/subscriptions/${subscriptionId}`,
            )
          : Promise.resolve(null),
      ]);
      const availablePlans = [...planResponse.data];
      if (
        detail &&
        !availablePlans.some((plan) => plan.id === detail.plan.id)
      ) {
        const currentPlan = await request<PlatformPlanSummary>(
          `/platform/plans/${detail.plan.id}`,
        );
        availablePlans.push(currentPlan);
      }
      setPlans(availablePlans);
      setTenants(tenantResponse.data);
      setSubscription(detail);
      if (detail) {
        setTenantId(detail.tenant.id);
        setTenantSearch(detail.tenant.name);
        setSelectedPlanId(detail.plan.id);
        setInterval(
          detail.billingCycle === "MANUAL" ? "MONTHLY" : detail.billingCycle,
        );
        setContractedPrice(centsToInput(detail.contractedPriceCents));
        setIndefinite(detail.endsAt === null);
      } else if (availablePlans[0]) {
        const first = availablePlans[0];
        const firstInterval =
          first.defaultBillingCycle === "MANUAL"
            ? "MONTHLY"
            : first.defaultBillingCycle;
        setSelectedPlanId(first.id);
        setInterval(firstInterval);
        setContractedPrice(
          centsToInput(
            referencePriceForInterval(
              first.monthlyPriceCents,
              first.annualPriceCents,
              firstInterval,
            ),
          ),
        );
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar o contrato.",
      );
    } finally {
      setLoading(false);
    }
  }, [request, subscriptionId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    if (subscriptionId || !tenantSearch.trim()) return;
    const timeout = window.setTimeout(() => {
      const query = new URLSearchParams({
        search: tenantSearch.trim(),
        pageSize: "50",
      });
      request<PaginatedResponse<PlatformTenantOption>>(
        `/platform/tenants?${query.toString()}`,
      )
        .then((response) => setTenants(response.data))
        .catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [request, subscriptionId, tenantSearch]);

  const filteredTenants = useMemo(() => {
    const term = tenantSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return tenants;
    return tenants.filter((tenant) =>
      [tenant.name, tenant.slug, tenant.document]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("pt-BR").includes(term),
        ),
    );
  }, [tenantSearch, tenants]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);

  function applyReferencePrice(
    plan: PlatformPlanSummary | undefined,
    nextInterval: CommercialBillingInterval,
  ) {
    if (!plan) return;
    setContractedPrice(
      centsToInput(
        referencePriceForInterval(
          plan.monthlyPriceCents,
          plan.annualPriceCents,
          nextInterval,
        ),
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscriptionId && !tenantId) {
      setError("Selecione uma autoescola.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get("startsAt"));
    const endsAt = indefinite ? null : String(form.get("endsAt") || "");
    try {
      const payload = {
        ...(!subscriptionId
          ? {
              tenantId,
              status: String(form.get("status")),
            }
          : {}),
        planId: selectedPlanId,
        billingCycle: interval,
        contractedPriceCents: parseCurrencyToCents(contractedPrice),
        startsAt: `${startsAt}T00:00:00.000Z`,
        endsAt: endsAt ? `${endsAt}T23:59:59.999Z` : null,
        contractNumber: String(form.get("contractNumber") || "") || null,
        notes: String(form.get("notes") || "") || null,
      };
      const saved = await request<PlatformSubscriptionSummary>(
        subscriptionId
          ? `/platform/subscriptions/${subscriptionId}`
          : "/platform/subscriptions",
        {
          method: subscriptionId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!subscriptionId) {
        router.replace(`/platform/subscriptions/${saved.id}`);
      } else {
        setSuccess("Assinatura atualizada com sucesso.");
        await load();
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a assinatura.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: "suspend" | "reactivate" | "cancel") {
    if (!subscription) return;
    const labels = {
      suspend: "suspender",
      reactivate: "reativar",
      cancel: "cancelar definitivamente",
    };
    if (!window.confirm(`Deseja ${labels[action]} esta assinatura?`)) return;
    try {
      await request(`/platform/subscriptions/${subscription.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          reason: `Ação comercial realizada pelo console: ${labels[action]}.`,
        }),
      });
      setSuccess("Status da assinatura atualizado.");
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Não foi possível atualizar o status.",
      );
    }
  }

  return (
    <PlatformOwnerGate>
      <section className="platform-page commercial-page">
        <header className="platform-page-title">
          <div>
            <span>Gestão comercial</span>
            <h1>
              {subscriptionId ? "Detalhes da assinatura" : "Nova assinatura"}
            </h1>
            <p>
              {subscriptionId
                ? "Consulte o contrato, a utilização e o histórico de alterações."
                : "Registre o plano e as condições comerciais acordadas com a autoescola."}
            </p>
          </div>
          <Link className="commercial-secondary" href="/platform/subscriptions">
            Voltar para assinaturas
          </Link>
        </header>

        {error ? <div className="platform-error">{error}</div> : null}
        {success ? <div className="commercial-success">{success}</div> : null}
        {loading ? (
          <div className="commercial-skeleton commercial-skeleton--form" />
        ) : null}

        {!loading && subscription ? (
          <>
            <div className="commercial-detail-header">
              <div>
                <small>Autoescola</small>
                <h2>{subscription.tenant.name}</h2>
                <p>{formatCompanyDocument(subscription.tenant.document)}</p>
              </div>
              <StatusBadge status={subscription.status} />
              <div className="commercial-detail-actions">
                {["ACTIVE", "TRIALING"].includes(subscription.status) ? (
                  <button onClick={() => void runAction("suspend")}>
                    Suspender
                  </button>
                ) : null}
                {subscription.status === "SUSPENDED" ? (
                  <button onClick={() => void runAction("reactivate")}>
                    Reativar
                  </button>
                ) : null}
                {!["CANCELLED", "EXPIRED"].includes(subscription.status) ? (
                  <button
                    className="commercial-danger"
                    onClick={() => void runAction("cancel")}
                  >
                    Cancelar assinatura
                  </button>
                ) : null}
              </div>
            </div>

            <div className="commercial-usage-grid">
              {[
                [
                  "Unidades",
                  subscription.usage.units,
                  subscription.plan.maxUnits,
                ],
                [
                  "Usuários",
                  subscription.usage.users,
                  subscription.plan.maxUsers,
                ],
                [
                  "Instrutores",
                  subscription.usage.instructors,
                  subscription.plan.maxInstructors,
                ],
                [
                  "Alunos ativos",
                  subscription.usage.activeStudents,
                  subscription.plan.maxStudents,
                ],
              ].map(([label, used, limit]) => (
                <article key={String(label)}>
                  <span>{label}</span>
                  <strong>
                    {used} / {limit ?? "ilimitado"}
                  </strong>
                </article>
              ))}
            </div>
          </>
        ) : null}

        {!loading ? (
          <div className="commercial-detail-layout">
            <form className="commercial-form" onSubmit={submit}>
              <fieldset className="commercial-section">
                <legend>Autoescola</legend>
                {subscriptionId && subscription ? (
                  <div className="commercial-readonly-field">
                    <span>Autoescola contratante</span>
                    <strong>{tenantLabel(subscription.tenant)}</strong>
                  </div>
                ) : (
                  <div className="commercial-form-grid">
                    <label className="commercial-wide">
                      Buscar autoescola
                      <input
                        value={tenantSearch}
                        onChange={(event) =>
                          setTenantSearch(event.target.value)
                        }
                        placeholder="Busque por nome, nome fantasia ou CNPJ"
                      />
                    </label>
                    <label className="commercial-wide">
                      Autoescola selecionada
                      <select
                        required
                        value={tenantId}
                        onChange={(event) => setTenantId(event.target.value)}
                        size={Math.min(Math.max(filteredTenants.length, 2), 6)}
                      >
                        <option value="" disabled>
                          Selecione uma autoescola
                        </option>
                        {filteredTenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenantLabel(tenant)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </fieldset>

              <fieldset className="commercial-section">
                <legend>Contrato</legend>
                <div className="commercial-form-grid">
                  <label>
                    Plano
                    <select
                      required
                      value={selectedPlanId}
                      onChange={(event) => {
                        const nextPlan = plans.find(
                          (plan) => plan.id === event.target.value,
                        );
                        setSelectedPlanId(event.target.value);
                        applyReferencePrice(nextPlan, interval);
                      }}
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} —{" "}
                          {plan.monthlyPriceCents > 0
                            ? `${formatCurrency(plan.monthlyPriceCents)}/mês`
                            : "Sob consulta"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Periodicidade
                    <select
                      value={interval}
                      onChange={(event) => {
                        const next = event.target
                          .value as CommercialBillingInterval;
                        setInterval(next);
                        applyReferencePrice(selectedPlan, next);
                      }}
                    >
                      {INTERVALS.map((item) => (
                        <option value={item} key={item}>
                          {billingIntervalLabels[item]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="commercial-reference-price">
                    <span>Preço de referência</span>
                    <strong>
                      {selectedPlan
                        ? formatCurrency(
                            referencePriceForInterval(
                              selectedPlan.monthlyPriceCents,
                              selectedPlan.annualPriceCents,
                              interval,
                            ),
                          )
                        : "—"}
                    </strong>
                  </div>
                  <label>
                    Valor contratado
                    <span className="commercial-money-input">
                      <b>R$</b>
                      <input
                        required
                        inputMode="decimal"
                        value={contractedPrice}
                        onChange={(event) =>
                          setContractedPrice(event.target.value)
                        }
                        placeholder="399,00"
                      />
                    </span>
                    <small>Pode ser diferente do preço de referência.</small>
                  </label>
                  {!subscriptionId ? (
                    <label>
                      Status inicial
                      <select name="status" defaultValue="ACTIVE">
                        <option value="DRAFT">Rascunho</option>
                        <option value="TRIALING">Em implantação</option>
                        <option value="ACTIVE">Ativa</option>
                      </select>
                    </label>
                  ) : null}
                  <label>
                    Data de início
                    <input
                      name="startsAt"
                      type="date"
                      required
                      defaultValue={
                        subscription?.startsAt.slice(0, 10) ??
                        new Date().toISOString().slice(0, 10)
                      }
                    />
                  </label>
                  <label className="commercial-check commercial-wide">
                    <input
                      type="checkbox"
                      checked={indefinite}
                      onChange={(event) => setIndefinite(event.target.checked)}
                    />
                    Prazo indeterminado
                  </label>
                  {!indefinite ? (
                    <label>
                      Data final
                      <input
                        name="endsAt"
                        type="date"
                        required
                        defaultValue={subscription?.endsAt?.slice(0, 10) ?? ""}
                      />
                    </label>
                  ) : null}
                  <label>
                    Número ou referência do contrato
                    <input
                      name="contractNumber"
                      defaultValue={subscription?.contractNumber ?? ""}
                      placeholder="CONTRATO-2026-001"
                    />
                  </label>
                  <label className="commercial-wide">
                    Observações comerciais
                    <textarea
                      name="notes"
                      defaultValue={subscription?.notes ?? ""}
                      placeholder="Condições negociadas e informações relevantes do contrato."
                    />
                  </label>
                </div>
              </fieldset>
              <div className="commercial-form-actions">
                <Link
                  className="commercial-secondary"
                  href="/platform/subscriptions"
                >
                  Cancelar
                </Link>
                <button
                  className="platform-primary"
                  disabled={saving || plans.length === 0}
                >
                  {saving
                    ? "Salvando…"
                    : subscriptionId
                      ? "Salvar alterações"
                      : "Criar assinatura"}
                </button>
              </div>
            </form>

            {subscription ? (
              <aside className="commercial-history">
                <h2>Histórico da assinatura</h2>
                {subscription.history.length === 0 ? (
                  <p>Nenhuma alteração registrada.</p>
                ) : (
                  <ol>
                    {subscription.history.map((entry) => (
                      <li key={entry.id}>
                        <time>{formatDateTime(entry.createdAt)}</time>
                        <strong>
                          {HISTORY_LABELS[entry.action] ??
                            "Contrato atualizado"}
                        </strong>
                        {historyDescription(entry) ? (
                          <p>{historyDescription(entry)}</p>
                        ) : null}
                        <small>
                          Por: {entry.platformUser?.name ?? "Sistema"}
                        </small>
                      </li>
                    ))}
                  </ol>
                )}
              </aside>
            ) : null}
          </div>
        ) : null}
      </section>
    </PlatformOwnerGate>
  );
}
