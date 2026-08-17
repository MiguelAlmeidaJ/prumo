"use client";

import type {
  CommercialBillingInterval,
  PlatformPlanListResponse,
  PlatformPlanStatus,
  PlatformPlanSummary,
} from "@prumo/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/auth-context";
import {
  billingIntervalLabels,
  centsToInput,
  formatCurrency,
  parseCurrencyToCents,
  planStatusLabels,
} from "./commercial-format";
import { PlatformOwnerGate } from "./platform-owner-gate";

const FEATURES = [
  ["STUDENT_MANAGEMENT", "Gestão de alunos"],
  ["ENROLLMENTS", "Matrículas"],
  ["SCHEDULE", "Agenda"],
  ["FINANCIAL", "Financeiro"],
  ["DOCUMENTS", "Documentos"],
  ["STUDENT_APP", "App do aluno"],
  ["INSTRUCTOR_APP", "App do instrutor"],
  ["ADVANCED_REPORTS", "Relatórios avançados"],
  ["MULTI_UNIT", "Multiunidade"],
  ["NOTIFICATIONS", "Notificações"],
  ["DATA_MIGRATION", "Migração de dados"],
  ["API_ACCESS", "API e integrações"],
  ["PRIORITY_SUPPORT", "Suporte prioritário"],
] as const;

const LIMITS = [
  ["maxUnits", "Unidades"],
  ["maxUsers", "Usuários administrativos"],
  ["maxInstructors", "Instrutores"],
  ["maxStudents", "Alunos ativos"],
  ["maxVehicles", "Veículos"],
] as const;

const STATUS_TONE: Record<PlatformPlanStatus, string> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  INACTIVE: "warning",
  ARCHIVED: "danger",
};

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="commercial-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function featureLabel(key: string): string {
  return FEATURES.find(([feature]) => feature === key)?.[1] ?? key;
}

export function PlanCatalog() {
  const { request } = useAuth();
  const [result, setResult] = useState<PlatformPlanListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    request<PlatformPlanListResponse>("/platform/plans?pageSize=100")
      .then((response) => active && setResult(response))
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os planos.",
          );
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [request]);

  return (
    <PlatformOwnerGate>
      <section className="platform-page commercial-page">
        <header className="platform-page-title">
          <div>
            <span>Catálogo comercial</span>
            <h1>Planos</h1>
            <p>Configure os produtos comerciais oferecidos às autoescolas.</p>
          </div>
          <Link className="platform-primary" href="/platform/plans/new">
            + Novo plano
          </Link>
        </header>

        {error ? <div className="platform-error">{error}</div> : null}
        {loading ? (
          <div className="commercial-skeleton-grid" aria-label="Carregando">
            {[1, 2, 3, 4].map((item) => (
              <div className="commercial-skeleton" key={item} />
            ))}
          </div>
        ) : result ? (
          <>
            <div className="commercial-summary-grid">
              <SummaryCard
                label="Planos ativos"
                value={String(result.summary.activePlans)}
              />
              <SummaryCard
                label="Autoescolas assinantes"
                value={String(result.summary.subscribingTenants)}
              />
              <SummaryCard
                label="Valor mensal contratado"
                value={formatCurrency(
                  result.summary.contractedMonthlyValueCents,
                )}
              />
              <SummaryCard
                label="Ticket médio"
                value={formatCurrency(result.summary.averageTicketCents)}
              />
            </div>

            {result.data.length === 0 ? (
              <div className="platform-empty commercial-empty">
                <h2>Seu catálogo ainda está vazio</h2>
                <p>Crie o primeiro plano comercial oferecido pelo Prumo.</p>
                <Link className="platform-primary" href="/platform/plans/new">
                  Criar plano
                </Link>
              </div>
            ) : (
              <div className="commercial-plan-grid">
                {result.data.map((plan) => {
                  const enabledFeatures = Object.entries(plan.features)
                    .filter(([, enabled]) => enabled)
                    .slice(0, 5);
                  return (
                    <article
                      className={`commercial-plan-card${plan.featured ? " commercial-plan-card--featured" : ""}`}
                      key={plan.id}
                    >
                      <header>
                        <div>
                          <small>{plan.code}</small>
                          <h2>{plan.name}</h2>
                        </div>
                        <span
                          className={`commercial-badge commercial-badge--${STATUS_TONE[plan.status]}`}
                        >
                          {planStatusLabels[plan.status]}
                        </span>
                      </header>
                      {plan.featured ? (
                        <strong className="commercial-highlight">
                          Destaque comercial
                        </strong>
                      ) : null}
                      <p className="commercial-plan-description">
                        {plan.description || "Sem descrição comercial."}
                      </p>
                      <div className="commercial-price">
                        <strong>
                          {plan.monthlyPriceCents > 0
                            ? formatCurrency(plan.monthlyPriceCents)
                            : "Sob consulta"}
                        </strong>
                        {plan.monthlyPriceCents > 0 ? <span>/ mês</span> : null}
                      </div>
                      <p className="commercial-subscribers">
                        {plan.subscriberCount} autoescola
                        {plan.subscriberCount === 1 ? "" : "s"} utilizando
                      </p>
                      <ul className="commercial-feature-list">
                        {enabledFeatures.length > 0 ? (
                          enabledFeatures.map(([feature]) => (
                            <li key={feature}>{featureLabel(feature)}</li>
                          ))
                        ) : (
                          <li>Recursos ainda não configurados</li>
                        )}
                      </ul>
                      <Link
                        className="commercial-secondary"
                        href={`/platform/plans/${plan.id}`}
                      >
                        Ver e editar plano
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </section>
    </PlatformOwnerGate>
  );
}

export function PlanEditor({ planId }: { planId?: string }) {
  const { request } = useAuth();
  const router = useRouter();
  const [plan, setPlan] = useState<PlatformPlanSummary | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(Boolean(planId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) return;
    let active = true;
    request<PlatformPlanSummary>(`/platform/plans/${planId}`)
      .then((response) => {
        if (active) {
          setPlan(response);
          setFeatures(response.features);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar o plano.",
          );
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [planId, request]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status")) as PlatformPlanStatus;
    if (
      plan?.status === "ACTIVE" &&
      status === "INACTIVE" &&
      plan.subscriberCount > 0 &&
      !window.confirm(
        `Este plano possui ${plan.subscriberCount} autoescola(s). Ele deixará de aparecer em novas assinaturas, mas os contratos atuais serão preservados. Continuar?`,
      )
    ) {
      setSaving(false);
      return;
    }
    try {
      const maxStorageGb = String(form.get("maxStorageGb") || "").trim();
      const payload = {
        code: String(form.get("code") || ""),
        name: String(form.get("name") || ""),
        description: String(form.get("description") || "") || undefined,
        status,
        featured: form.get("featured") === "on",
        displayOrder: Number(form.get("displayOrder") || 0),
        defaultBillingCycle: String(
          form.get("defaultBillingCycle"),
        ) as CommercialBillingInterval,
        monthlyPriceCents: parseCurrencyToCents(
          String(form.get("monthlyPrice") || "0"),
        ),
        annualPriceCents: form.get("annualPrice")
          ? parseCurrencyToCents(String(form.get("annualPrice")))
          : null,
        ...Object.fromEntries(
          LIMITS.map(([key]) => {
            const value = String(form.get(key) || "").trim();
            return [key, value ? Number(value) : null];
          }),
        ),
        maxStorageBytes: maxStorageGb
          ? Math.round(Number(maxStorageGb.replace(",", ".")) * 1024 ** 3)
          : null,
        features: Object.fromEntries(
          FEATURES.map(([feature]) => [feature, features[feature] === true]),
        ),
      };
      const response = await request<PlatformPlanSummary>(
        planId ? `/platform/plans/${planId}` : "/platform/plans",
        {
          method: planId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setPlan(response);
      setSuccess(
        planId ? "Plano atualizado com sucesso." : "Plano criado com sucesso.",
      );
      if (!planId) router.replace(`/platform/plans/${response.id}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o plano.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <PlatformOwnerGate>
      <section className="platform-page commercial-page">
        <header className="platform-page-title">
          <div>
            <span>Catálogo comercial</span>
            <h1>{planId ? "Editar plano" : "Novo plano"}</h1>
            <p>
              Defina o posicionamento, os preços de referência, limites e
              recursos do produto.
            </p>
          </div>
          <Link className="commercial-secondary" href="/platform/plans">
            Voltar para planos
          </Link>
        </header>

        {loading ? (
          <div className="commercial-skeleton commercial-skeleton--form" />
        ) : null}
        {error ? <div className="platform-error">{error}</div> : null}
        {success ? <div className="commercial-success">{success}</div> : null}

        {!loading ? (
          <form className="commercial-form" onSubmit={submit}>
            <fieldset className="commercial-section">
              <legend>Informações</legend>
              <div className="commercial-form-grid">
                <label>
                  Nome
                  <input name="name" required defaultValue={plan?.name ?? ""} />
                </label>
                <label>
                  Código interno
                  <input
                    name="code"
                    required
                    disabled={Boolean(planId)}
                    defaultValue={plan?.code ?? ""}
                    placeholder="PRUMO_PRO"
                  />
                </label>
                <label className="commercial-wide">
                  Descrição
                  <textarea
                    name="description"
                    defaultValue={plan?.description ?? ""}
                    placeholder="Explique para qual perfil de autoescola este plano foi criado."
                  />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={plan?.status ?? "DRAFT"}>
                    {Object.entries(planStatusLabels).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ordem de exibição
                  <input
                    name="displayOrder"
                    type="number"
                    min="0"
                    defaultValue={plan?.displayOrder ?? 0}
                  />
                </label>
                <label className="commercial-check commercial-wide">
                  <input
                    name="featured"
                    type="checkbox"
                    defaultChecked={plan?.featured ?? false}
                  />
                  Destacar este plano comercialmente
                </label>
              </div>
            </fieldset>

            <fieldset className="commercial-section">
              <legend>Preço de referência</legend>
              <p className="commercial-help">
                Valores comerciais de referência. Não há cobrança automática.
              </p>
              <div className="commercial-form-grid">
                <label>
                  Valor mensal
                  <span className="commercial-money-input">
                    <b>R$</b>
                    <input
                      name="monthlyPrice"
                      inputMode="decimal"
                      required
                      defaultValue={centsToInput(plan?.monthlyPriceCents ?? 0)}
                      placeholder="449,00"
                    />
                  </span>
                </label>
                <label>
                  Valor anual (opcional)
                  <span className="commercial-money-input">
                    <b>R$</b>
                    <input
                      name="annualPrice"
                      inputMode="decimal"
                      defaultValue={centsToInput(plan?.annualPriceCents)}
                      placeholder="4.490,00"
                    />
                  </span>
                </label>
                <label>
                  Periodicidade padrão
                  <select
                    name="defaultBillingCycle"
                    defaultValue={
                      plan?.defaultBillingCycle === "MANUAL"
                        ? "MONTHLY"
                        : (plan?.defaultBillingCycle ?? "MONTHLY")
                    }
                  >
                    {(
                      [
                        "MONTHLY",
                        "QUARTERLY",
                        "SEMIANNUAL",
                        "ANNUAL",
                      ] as CommercialBillingInterval[]
                    ).map((interval) => (
                      <option value={interval} key={interval}>
                        {billingIntervalLabels[interval]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="commercial-section">
              <legend>Limites do plano</legend>
              <p className="commercial-help">
                Deixe um campo vazio para oferecer o recurso sem limite.
              </p>
              <div className="commercial-form-grid commercial-limit-grid">
                {LIMITS.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      name={key}
                      type="number"
                      min="1"
                      defaultValue={plan?.[key] ?? ""}
                      placeholder="Ilimitado"
                    />
                  </label>
                ))}
                <label>
                  Armazenamento (GB)
                  <input
                    name="maxStorageGb"
                    inputMode="decimal"
                    defaultValue={
                      plan?.maxStorageBytes
                        ? String(
                            Math.round(
                              (Number(plan.maxStorageBytes) / 1024 ** 3) * 10,
                            ) / 10,
                          ).replace(".", ",")
                        : ""
                    }
                    placeholder="Ilimitado"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="commercial-section">
              <legend>Recursos incluídos</legend>
              <div className="commercial-feature-grid">
                {FEATURES.map(([feature, label]) => (
                  <label className="commercial-check" key={feature}>
                    <input
                      type="checkbox"
                      checked={features[feature] === true}
                      onChange={(event) =>
                        setFeatures((current) => ({
                          ...current,
                          [feature]: event.target.checked,
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="commercial-form-actions">
              <Link className="commercial-secondary" href="/platform/plans">
                Cancelar
              </Link>
              <button className="platform-primary" disabled={saving}>
                {saving ? "Salvando…" : "Salvar plano"}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </PlatformOwnerGate>
  );
}
