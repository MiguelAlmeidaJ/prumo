"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/auth/auth-context";

type View =
  | "dashboard"
  | "tenants"
  | "tenant-new"
  | "tenant"
  | "tenant-metrics"
  | "users"
  | "user"
  | "plans"
  | "subscriptions"
  | "support"
  | "support-detail"
  | "audit"
  | "health"
  | "settings";

type JsonRecord = Record<string, unknown>;
type PageResult = { data: JsonRecord[]; meta?: JsonRecord };

const configuration: Record<
  Exclude<View, "tenant-new">,
  { title: string; description: string; path: string }
> = {
  dashboard: {
    title: "Visão geral da plataforma",
    description: "Indicadores agregados, sem dados pessoais operacionais.",
    path: "/platform/dashboard",
  },
  tenants: {
    title: "Autoescolas",
    description: "Ciclo de vida, plano e utilização de cada tenant.",
    path: "/platform/tenants",
  },
  tenant: {
    title: "Autoescola",
    description: "Configuração, assinatura e ações de ciclo de vida.",
    path: "/platform/tenants/:id",
  },
  "tenant-metrics": {
    title: "Métricas da autoescola",
    description: "Consumo agregado no período selecionado.",
    path: "/platform/tenants/:id/metrics",
  },
  users: {
    title: "Usuários globais",
    description: "Acesso, sessões e papéis da plataforma.",
    path: "/platform/users",
  },
  user: {
    title: "Usuário",
    description: "Conta, memberships e sessões recentes.",
    path: "/platform/users/:id",
  },
  plans: {
    title: "Planos",
    description: "Limites e features internas do Prumo.",
    path: "/platform/plans",
  },
  subscriptions: {
    title: "Assinaturas",
    description: "Administração interna, sem cobrança real.",
    path: "/platform/subscriptions",
  },
  support: {
    title: "Sessões de suporte",
    description: "Acesso temporário, explícito e auditado.",
    path: "/platform/support-sessions",
  },
  "support-detail": {
    title: "Sessão de suporte",
    description: "Contexto, validade e trilha de auditoria.",
    path: "/platform/support-sessions/:id",
  },
  audit: {
    title: "Auditoria global",
    description: "Ações administrativas e acessos assistidos.",
    path: "/platform/audit",
  },
  health: {
    title: "Saúde dos serviços",
    description: "Disponibilidade conhecida dos componentes.",
    path: "/platform/health",
  },
  settings: {
    title: "Configurações globais",
    description: "Políticas operacionais do console.",
    path: "/platform/settings",
  },
};

function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function FieldGrid({ value }: { value: JsonRecord }) {
  return (
    <dl className="platform-fields">
      {Object.entries(value)
        .filter(
          ([key, field]) =>
            !key.startsWith("_") &&
            !["before", "after"].includes(key) &&
            typeof field !== "object",
        )
        .map(([key, field]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{valueLabel(field)}</dd>
          </div>
        ))}
    </dl>
  );
}

function DataTable({
  rows,
  detailBase,
}: {
  rows: JsonRecord[];
  detailBase?: string;
}) {
  const columns = useMemo(() => {
    const preferred = [
      "name",
      "email",
      "slug",
      "code",
      "status",
      "platformRole",
      "planCode",
      "reason",
      "action",
      "createdAt",
    ];
    const available = new Set(rows.flatMap((row) => Object.keys(row)));
    return preferred.filter((column) => available.has(column)).slice(0, 6);
  }, [rows]);
  if (rows.length === 0) {
    return <div className="platform-empty">Nenhum registro encontrado.</div>;
  }
  return (
    <div className="platform-table-wrap">
      <table className="platform-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
            {detailBase ? <th>Ações</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {columns.map((column) => (
                <td key={column}>{valueLabel(row[column])}</td>
              ))}
              {detailBase && row.id ? (
                <td>
                  <Link href={`${detailBase}/${String(row.id)}`}>
                    Abrir
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TenantForm() {
  const { request } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setMessage(null);
    try {
      const created = await request<JsonRecord>("/platform/tenants", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          slug: form.get("slug"),
          document: form.get("document") || undefined,
          planCode: form.get("planCode") || undefined,
          provisioningKey: form.get("provisioningKey") || undefined,
          owner: form.get("ownerEmail")
            ? {
                name: form.get("ownerName"),
                email: form.get("ownerEmail"),
                password: form.get("ownerPassword") || undefined,
              }
            : undefined,
        }),
      });
      setMessage(`Autoescola criada: ${String(created.name)}`);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="platform-page">
      <header className="platform-page-title">
        <div>
          <span>Provisionamento idempotente</span>
          <h1>Nova autoescola</h1>
          <p>
            Tenant, configurações, financeiro, comunicação e proprietário são
            preparados em conjunto.
          </p>
        </div>
      </header>
      <form className="platform-form platform-card" onSubmit={submit}>
        <label>Nome<input name="name" required minLength={2} /></label>
        <label>Slug<input name="slug" required minLength={2} /></label>
        <label>Documento<input name="document" /></label>
        <label>Código do plano<input name="planCode" placeholder="PRO" /></label>
        <label>Chave idempotente<input name="provisioningKey" /></label>
        <h2>Proprietário opcional</h2>
        <label>Nome<input name="ownerName" /></label>
        <label>E-mail<input name="ownerEmail" type="email" /></label>
        <label>Senha inicial<input name="ownerPassword" type="password" minLength={12} /></label>
        <button className="platform-primary" disabled={loading}>
          {loading ? "Provisionando…" : "Criar autoescola"}
        </button>
        {message ? <p className="platform-feedback">{message}</p> : null}
      </form>
    </section>
  );
}

export function PlatformConsole({ view }: { view: View }) {
  const { request, session } = useAuth();
  const params = useParams<{ id?: string }>();
  const [payload, setPayload] = useState<JsonRecord | PageResult | JsonRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(view !== "tenant-new");
  const [search, setSearch] = useState("");
  const [tenantStatus, setTenantStatus] = useState("");
  const [planCode, setPlanCode] = useState("");

  const config = view === "tenant-new" ? null : configuration[view];
  const path = config?.path.replace(":id", params.id ?? "");

  async function load(extraQuery = "") {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const data = await request<
        JsonRecord | PageResult | JsonRecord[]
      >(`${path}${extraQuery}`);
      setPayload(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!path) return;
    let active = true;
    void request<JsonRecord | PageResult | JsonRecord[]>(path)
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, request]);

  if (view === "tenant-new") return <TenantForm />;
  if (!config) return null;

  const rows = Array.isArray(payload)
    ? payload
    : payload && "data" in payload && Array.isArray(payload.data)
      ? payload.data
      : [];
  const record =
    payload && !Array.isArray(payload) && !("data" in payload)
      ? payload
      : null;

  async function criticalTenantAction(action: string) {
    if (!params.id) return;
    const reason = window.prompt(
      `Confirme ${action}: informe o motivo obrigatório.`,
    );
    if (!reason) return;
    const currentPassword = window.prompt(
      "Reautenticação: informe sua senha atual.",
    );
    if (!currentPassword) return;
    if (!window.confirm(`Executar ${action} neste tenant?`)) return;
    try {
      await request(`/platform/tenants/${params.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason, currentPassword }),
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Ação recusada.",
      );
    }
  }

  async function extendTrial() {
    if (!params.id) return;
    const days = Number(window.prompt("Quantos dias deseja prorrogar?", "7"));
    if (!Number.isInteger(days) || days < 1) return;
    const reason = window.prompt("Informe o motivo obrigatório.");
    if (!reason) return;
    const currentPassword = window.prompt(
      "Reautenticação: informe sua senha atual.",
    );
    if (!currentPassword || !window.confirm(`Prorrogar por ${days} dias?`)) {
      return;
    }
    try {
      await request(`/platform/tenants/${params.id}/extend-trial`, {
        method: "POST",
        body: JSON.stringify({ days, reason, currentPassword }),
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Ação recusada.",
      );
    }
  }

  async function userAction(action: "enable" | "disable" | "reset-sessions") {
    if (!params.id) return;
    const reason = window.prompt("Informe o motivo obrigatório.");
    const currentPassword =
      action === "enable"
        ? undefined
        : window.prompt("Reautenticação: informe sua senha atual.");
    if (
      !reason ||
      (action !== "enable" && !currentPassword) ||
      !window.confirm(`Executar ${action} nesta conta?`)
    ) {
      return;
    }
    try {
      await request(`/platform/users/${params.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason, currentPassword }),
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Ação recusada.",
      );
    }
  }

  async function changeUserRole() {
    if (!params.id) return;
    const role = window.prompt(
      "Novo papel: USER, PLATFORM_SUPPORT, PLATFORM_ADMIN ou PLATFORM_OWNER.",
    );
    if (
      !role ||
      ![
        "USER",
        "PLATFORM_SUPPORT",
        "PLATFORM_ADMIN",
        "PLATFORM_OWNER",
      ].includes(role)
    ) {
      return;
    }
    const reason = window.prompt("Informe o motivo obrigatório.");
    const currentPassword = window.prompt(
      "Reautenticação: informe sua senha atual.",
    );
    if (!reason || !currentPassword || !window.confirm(`Atribuir ${role}?`)) {
      return;
    }
    try {
      await request(`/platform/users/${params.id}/platform-role`, {
        method: "PATCH",
        body: JSON.stringify({ role, reason, currentPassword }),
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Ação recusada.",
      );
    }
  }

  async function startSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const support = await request<JsonRecord>(
        "/platform/support-sessions",
        {
          method: "POST",
          body: JSON.stringify({
            tenantId: form.get("tenantId"),
            reason: form.get("reason"),
            ticketReference: form.get("ticketReference") || undefined,
            durationMinutes: Number(form.get("durationMinutes") || 30),
          }),
        },
      );
      window.sessionStorage.setItem(
        "prumo.support.session",
        JSON.stringify(support),
      );
      window.dispatchEvent(new Event("prumo-support-change"));
      await load();
    } catch (supportError) {
      setError(
        supportError instanceof Error
          ? supportError.message
          : "Falha ao iniciar suporte.",
      );
    }
  }

  async function endSupport() {
    if (!params.id || !window.confirm("Encerrar esta sessão de suporte?")) {
      return;
    }
    await request(`/platform/support-sessions/${params.id}/end`, {
      method: "POST",
      body: JSON.stringify({ reason: "Encerrada pelo console da plataforma." }),
    });
    window.sessionStorage.removeItem("prumo.support.session");
    window.dispatchEvent(new Event("prumo-support-change"));
    await load();
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request("/platform/plans", {
        method: "POST",
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          monthlyPriceCents: Number(form.get("monthlyPriceCents")),
          status: "ACTIVE",
          features: {
            FINANCIAL: true,
            MOBILE_APP: true,
            NOTIFICATIONS: true,
          },
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "Falha.");
    }
  }

  async function createSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const now = new Date();
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    try {
      await request("/platform/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          tenantId: form.get("tenantId"),
          planId: form.get("planId"),
          status: "ACTIVE",
          billingCycle: "MANUAL",
          startsAt: now.toISOString(),
          currentPeriodStartsAt: now.toISOString(),
          currentPeriodEndsAt: endsAt.toISOString(),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (subscriptionError) {
      setError(
        subscriptionError instanceof Error
          ? subscriptionError.message
          : "Falha ao criar assinatura.",
      );
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = Number(form.get("duration"));
    try {
      await request("/platform/settings", {
        method: "PATCH",
        body: JSON.stringify({
          settings: [
            {
              key: "support.maxDurationMinutes",
              value: minutes,
              description: "Duração máxima da sessão de suporte em minutos.",
            },
          ],
        }),
      });
      await load();
    } catch (settingsError) {
      setError(
        settingsError instanceof Error ? settingsError.message : "Falha.",
      );
    }
  }

  return (
    <section className="platform-page">
      <header className="platform-page-title">
        <div>
          <span>Prumo · Anoar</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        {view === "tenants" ? (
          <Link className="platform-primary" href="/platform/tenants/new">
            Nova autoescola
          </Link>
        ) : null}
      </header>

      {["tenants", "users", "audit"].includes(view) ? (
        <form
          className="platform-filter"
          onSubmit={(event) => {
            event.preventDefault();
            const query = new URLSearchParams();
            if (search) {
              query.set(view === "audit" ? "action" : "search", search);
            }
            if (view === "tenants" && tenantStatus) {
              query.set("status", tenantStatus);
            }
            if (view === "tenants" && planCode) {
              query.set("planCode", planCode);
            }
            void load(query.size > 0 ? `?${query.toString()}` : "");
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar…"
          />
          {view === "tenants" ? (
            <>
              <select
                value={tenantStatus}
                onChange={(event) => setTenantStatus(event.target.value)}
              >
                <option value="">Todos os status</option>
                {[
                  "TRIAL",
                  "ACTIVE",
                  "PAST_DUE",
                  "SUSPENDED",
                  "CANCELLED",
                  "ARCHIVED",
                ].map((status) => (
                  <option value={status} key={status}>
                    {status}
                  </option>
                ))}
              </select>
              <input
                value={planCode}
                onChange={(event) => setPlanCode(event.target.value)}
                placeholder="Plano"
              />
            </>
          ) : null}
          <button>Filtrar</button>
        </form>
      ) : null}

      {view === "support" &&
      session?.platform?.permissions.includes("platform.support.start") ? (
        <form className="platform-form platform-card" onSubmit={startSupport}>
          <h2>Iniciar acesso assistido</h2>
          <label>ID do tenant<input name="tenantId" required /></label>
          <label>Motivo<input name="reason" required minLength={5} /></label>
          <label>Ticket<input name="ticketReference" /></label>
          <label>Duração (min)<input name="durationMinutes" type="number" defaultValue={30} min={5} max={120} /></label>
          <button className="platform-primary">Iniciar sessão</button>
        </form>
      ) : null}

      {view === "plans" &&
      session?.platform?.permissions.includes("platform.plans.manage") ? (
        <form className="platform-inline-form platform-card" onSubmit={createPlan}>
          <input name="code" placeholder="Código" required />
          <input name="name" placeholder="Nome" required />
          <input name="monthlyPriceCents" type="number" placeholder="Mensal (centavos)" required />
          <button className="platform-primary">Criar plano</button>
        </form>
      ) : null}

      {view === "settings" ? (
        <form className="platform-inline-form platform-card" onSubmit={saveSettings}>
          <label>Duração máxima do suporte<input name="duration" type="number" min={5} max={120} defaultValue={30} /></label>
          <button className="platform-primary">Salvar</button>
        </form>
      ) : null}

      {view === "subscriptions" &&
      session?.platform?.permissions.includes(
        "platform.subscriptions.manage",
      ) ? (
        <form
          className="platform-inline-form platform-card"
          onSubmit={createSubscription}
        >
          <input name="tenantId" placeholder="ID do tenant" required />
          <input name="planId" placeholder="ID do plano" required />
          <button className="platform-primary">Criar assinatura manual</button>
        </form>
      ) : null}

      {view === "tenant" && record ? (
        <div className="platform-actions">
          {["activate", "suspend", "reactivate", "cancel", "archive"].map(
            (action) => (
              <button
                key={action}
                onClick={() => void criticalTenantAction(action)}
                type="button"
              >
                {action}
              </button>
            ),
          )}
          <button type="button" onClick={() => void extendTrial()}>
            Prorrogar teste
          </button>
          <Link href={`/platform/tenants/${params.id}/metrics`}>
            Ver métricas
          </Link>
        </div>
      ) : null}

      {view === "user" &&
      record &&
      session?.platform?.permissions.includes("platform.users.manage") ? (
        <div className="platform-actions">
          <button type="button" onClick={() => void userAction("enable")}>
            Habilitar
          </button>
          <button type="button" onClick={() => void userAction("disable")}>
            Desabilitar
          </button>
          <button
            type="button"
            onClick={() => void userAction("reset-sessions")}
          >
            Revogar sessões
          </button>
          {session.platform.permissions.includes("platform.users.roles") ? (
            <button type="button" onClick={() => void changeUserRole()}>
              Alterar papel global
            </button>
          ) : null}
        </div>
      ) : null}

      {view === "support-detail" && record?.status === "ACTIVE" ? (
        <div className="platform-actions">
          <button type="button" onClick={() => void endSupport()}>
            Encerrar sessão
          </button>
        </div>
      ) : null}

      {loading ? <div className="platform-card">Carregando…</div> : null}
      {error ? <div className="platform-error">{error}</div> : null}
      {!loading && rows.length > 0 ? (
        <DataTable
          rows={rows}
          detailBase={
            view === "tenants"
              ? "/platform/tenants"
              : view === "users"
                ? "/platform/users"
                : view === "support"
                  ? "/platform/support"
                  : undefined
          }
        />
      ) : null}
      {!loading && record ? (
        <article className="platform-card">
          <FieldGrid value={record} />
          <details>
            <summary>Resposta agregada completa</summary>
            <pre>{JSON.stringify(record, null, 2)}</pre>
          </details>
        </article>
      ) : null}
      {!loading && !record && rows.length === 0 && !error ? (
        <div className="platform-empty">Nenhum dado disponível.</div>
      ) : null}
    </section>
  );
}
