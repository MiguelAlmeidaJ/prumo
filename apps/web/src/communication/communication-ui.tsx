"use client";

import type {
  CommunicationSettingsSummary,
  NotificationPreferenceSummary,
  NotificationSummary,
  NotificationTemplateSummary,
  PaginatedResponse,
} from "@prumo/contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useAuth } from "@/auth/auth-context";
import { ActionMenu } from "@/components/action-menu";
import { AppShell } from "@/components/app-shell";

type Row = Record<string, unknown> & { id: string };

function date(value: unknown) {
  return typeof value === "string"
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="communication-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function NotificationCenter() {
  const { request } = useAuth();
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [read, setRead] = useState("");
  const [priority, setPriority] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ page: "1", pageSize: "50" });
      if (read) query.set("read", read);
      if (priority) query.set("priority", priority);
      const result = await request<PaginatedResponse<NotificationSummary>>(
        `/notifications?${query}`,
      );
      setItems(result.data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar.");
    }
  }, [priority, read, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function markRead(id: string) {
    await request(`/notifications/${id}/read`, { method: "POST" });
    await load();
  }

  return (
    <AppShell>
      <section className="communication-page">
        <PageHeader
          eyebrow="Sua central"
          title="Notificações"
          description="Atualizações da autoescola, agenda, processos e financeiro."
          action={
            <button
              className="communication-button"
              onClick={async () => {
                await request("/notifications/read-all", { method: "POST" });
                await load();
              }}
            >
              Marcar todas como lidas
            </button>
          }
        />
        <div className="communication-filters">
          <select
            value={read}
            onChange={(event) => setRead(event.target.value)}
          >
            <option value="">Todas</option>
            <option value="false">Não lidas</option>
            <option value="true">Lidas</option>
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="">Toda prioridade</option>
            <option value="URGENT">Urgente</option>
            <option value="HIGH">Alta</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Baixa</option>
          </select>
        </div>
        {error && <p className="communication-error">{error}</p>}
        <div className="notification-list">
          {items.map((item) => (
            <article
              className={`notification-card ${item.readAt ? "" : "notification-card--unread"}`}
              key={item.id}
            >
              <div>
                <span
                  className={`priority priority--${item.priority.toLowerCase()}`}
                >
                  {item.priority}
                </span>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                <small>{date(item.createdAt)}</small>
              </div>
              <div className="notification-actions">
                {!item.readAt && (
                  <button onClick={() => void markRead(item.id)}>
                    Marcar lida
                  </button>
                )}
                {item.actionUrl && <Link href={item.actionUrl}>Abrir</Link>}
              </div>
            </article>
          ))}
          {!items.length && (
            <div className="communication-empty">Nenhuma notificação.</div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

const consoleViews = {
  history: {
    eyebrow: "Observabilidade",
    title: "Histórico de entregas",
    description: "Acompanhe canal, provider, status e falhas de envio.",
    endpoint: "/communication/deliveries",
    columns: ["channel", "status", "provider", "templateCode", "destination"],
  },
  events: {
    eyebrow: "Outbox",
    title: "Eventos de domínio",
    description:
      "Eventos publicados pelos módulos e seu estado de processamento.",
    endpoint: "/communication/events",
    columns: ["type", "status", "aggregateType", "aggregateId", "occurredAt"],
  },
  campaigns: {
    eyebrow: "Comunicação manual",
    title: "Campanhas",
    description: "Envios operacionais para públicos simples e controlados.",
    endpoint: "/communication/campaigns",
    columns: ["name", "audienceType", "channel", "status", "scheduledAt"],
  },
} as const;

export function CommunicationHome() {
  return (
    <AppShell>
      <section className="communication-page">
        <PageHeader
          eyebrow="Comunicação"
          title="Central de comunicação"
          description="Templates, eventos, entregas, campanhas e preferências em um só lugar."
        />
        <div className="communication-grid">
          {[
            [
              "/communication/templates",
              "Templates",
              "Conteúdo versionado por canal e tenant.",
            ],
            [
              "/communication/history",
              "Histórico",
              "Entregas, status, providers e retentativas.",
            ],
            [
              "/communication/events",
              "Eventos",
              "Outbox e reprocessamento administrativo.",
            ],
            [
              "/communication/campaigns",
              "Campanhas",
              "Comunicação manual sem automação de marketing.",
            ],
            [
              "/settings/notifications",
              "Preferências",
              "Canais, timezone e horários silenciosos.",
            ],
          ].map(([href, title, body]) => (
            <Link className="communication-tile" href={href} key={href}>
              <strong>{title}</strong>
              <span>{body}</span>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function CommunicationTable({
  view,
}: {
  view: keyof typeof consoleViews;
}) {
  const config = consoleViews[view];
  const { request } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const query = status ? `?status=${status}` : "";
      const result = await request<PaginatedResponse<Row>>(
        `${config.endpoint}${query}`,
      );
      setRows(result.data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar.");
    }
  }, [config.endpoint, request, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function action(row: Row) {
    if (view === "history") {
      await request(`/communication/deliveries/${row.id}/retry`, {
        method: "POST",
      });
    }
    if (view === "events") {
      await request(`/communication/events/${row.id}/reprocess`, {
        method: "POST",
      });
    }
    await load();
  }

  return (
    <AppShell>
      <section className="communication-page">
        <PageHeader
          {...config}
          action={
            view === "campaigns" ? (
              <Link
                className="communication-button"
                href="/communication/campaigns/new"
              >
                Nova campanha
              </Link>
            ) : undefined
          }
        />
        <div className="communication-filters">
          <input
            placeholder="Filtrar por status"
            value={status}
            onChange={(event) => setStatus(event.target.value.toUpperCase())}
          />
        </div>
        {error && <p className="communication-error">{error}</p>}
        <div className="communication-table-wrap">
          <table className="communication-table">
            <thead>
              <tr>
                {config.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {config.columns.map((column) => (
                    <td key={column}>
                      {column.endsWith("At")
                        ? date(row[column])
                        : String(row[column] ?? "—")}
                    </td>
                  ))}
                  <td>
                    <ActionMenu label="Ações do registro de comunicação">
                      {view === "campaigns" ? (
                        <Link href={`/communication/campaigns/${row.id}`}>
                          Ver detalhes
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            view === "history"
                              ? row.status !== "FAILED"
                              : !["FAILED", "DEAD_LETTER"].includes(
                                  String(row.status),
                                )
                          }
                          onClick={() => void action(row)}
                        >
                          {view === "history" ? "Reenviar" : "Reprocessar"}
                        </button>
                      )}
                    </ActionMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

export function TemplatesPage() {
  const { request } = useAuth();
  const [templates, setTemplates] = useState<NotificationTemplateSummary[]>([]);
  useEffect(() => {
    void request<PaginatedResponse<NotificationTemplateSummary>>(
      "/communication/templates?pageSize=100",
    ).then((response) => setTemplates(response.data));
  }, [request]);
  return (
    <AppShell>
      <section className="communication-page">
        <PageHeader
          eyebrow="Conteúdo"
          title="Templates"
          description="Versões globais e sobrescritas específicas da autoescola."
          action={
            <Link
              className="communication-button"
              href="/communication/templates/new"
            >
              Novo template
            </Link>
          }
        />
        <div className="communication-grid">
          {templates.map((template) => (
            <Link
              className="communication-tile"
              href={`/communication/templates/${template.id}`}
              key={template.id}
            >
              <strong>{template.code}</strong>
              <span>
                {template.channel} · v{template.version} ·{" "}
                {template.tenantId ? "tenant" : "global"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function TemplateForm({ create = false }: { create?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const { request } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    code: "",
    channel: "IN_APP",
    subject: "",
    title: "",
    body: "",
    allowedVariables: "userName,tenantName,actionUrl,eventType",
  });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!create && id) {
      void request<NotificationTemplateSummary>(
        `/communication/templates/${id}`,
      )
        .then((template) =>
          setForm({
            code: template.code,
            channel: template.channel,
            subject: template.subject ?? "",
            title: template.title ?? "",
            body: template.body,
            allowedVariables: template.allowedVariables.join(","),
          }),
        )
        .catch((cause: Error) => setError(cause.message));
    }
  }, [create, id, request]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = {
      ...(create ? { code: form.code, channel: form.channel } : {}),
      subject: form.subject || undefined,
      title: form.title || undefined,
      body: form.body,
      allowedVariables: form.allowedVariables
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      active: true,
    };
    try {
      await request(
        create ? "/communication/templates" : `/communication/templates/${id}`,
        { method: create ? "POST" : "PATCH", body: JSON.stringify(body) },
      );
      router.push("/communication/templates");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar.");
    }
  }
  return (
    <AppShell>
      <section className="communication-page">
        <PageHeader
          eyebrow="Templates"
          title={create ? "Novo template" : "Nova versão"}
          description="Use somente variáveis explicitamente permitidas."
        />
        <form className="communication-form" onSubmit={submit}>
          <label>
            Código
            <input
              disabled={!create}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label>
            Canal
            <select
              disabled={!create}
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
            >
              <option>IN_APP</option>
              <option>EMAIL</option>
              <option>PUSH</option>
            </select>
          </label>
          <label>
            Assunto
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </label>
          <label>
            Título
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="communication-form--wide">
            Corpo
            <textarea
              rows={10}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <label className="communication-form--wide">
            Variáveis permitidas
            <input
              value={form.allowedVariables}
              onChange={(e) =>
                setForm({ ...form, allowedVariables: e.target.value })
              }
            />
          </label>
          {error && <p className="communication-error">{error}</p>}
          <button className="communication-button">Salvar versão</button>
        </form>
      </section>
    </AppShell>
  );
}

export function CampaignForm() {
  const { request } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    audienceType: "ALL_STUDENTS",
    channel: "IN_APP",
    subject: "",
    body: "",
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    const campaign = await request<Row>("/communication/campaigns", {
      method: "POST",
      body: JSON.stringify({ ...form, subject: form.subject || undefined }),
    });
    router.push(`/communication/campaigns/${campaign.id}`);
  }
  return (
    <AppShell>
      <section className="communication-page">
        <PageHeader
          eyebrow="Campanhas"
          title="Nova campanha"
          description="Crie uma comunicação operacional para um público simples."
        />
        <form className="communication-form" onSubmit={submit}>
          <label>
            Nome
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Público
            <select
              value={form.audienceType}
              onChange={(e) =>
                setForm({ ...form, audienceType: e.target.value })
              }
            >
              {[
                "ALL_STUDENTS",
                "ACTIVE_STUDENTS",
                "INSTRUCTORS",
                "OVERDUE_STUDENTS",
                "PROCESS_STAGE",
                "MANUAL_SELECTION",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Canal
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
            >
              <option>IN_APP</option>
              <option>EMAIL</option>
              <option>PUSH</option>
            </select>
          </label>
          <label>
            Assunto
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </label>
          <label className="communication-form--wide">
            Mensagem
            <textarea
              required
              rows={9}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <button className="communication-button">Criar rascunho</button>
        </form>
      </section>
    </AppShell>
  );
}

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { request } = useAuth();
  const [campaign, setCampaign] = useState<Row | null>(null);
  const [recipients, setRecipients] = useState<Row[]>([]);
  const load = useCallback(async () => {
    const [detail, audience] = await Promise.all([
      request<Row>(`/communication/campaigns/${id}`),
      request<PaginatedResponse<Row>>(
        `/communication/campaigns/${id}/recipients?pageSize=100`,
      ),
    ]);
    setCampaign(detail);
    setRecipients(audience.data);
  }, [id, request]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (!campaign)
    return (
      <AppShell>
        <section className="communication-page">Carregando…</section>
      </AppShell>
    );
  return (
    <AppShell>
      <section className="communication-page">
        <PageHeader
          eyebrow="Campanha"
          title={String(campaign.name)}
          description={`${campaign.audienceType} · ${campaign.channel} · ${campaign.status}`}
          action={
            <div className="notification-actions">
              <button
                onClick={async () => {
                  await request(`/communication/campaigns/${id}/send`, {
                    method: "POST",
                  });
                  await load();
                }}
              >
                Enviar
              </button>
              <button
                onClick={async () => {
                  await request(`/communication/campaigns/${id}/cancel`, {
                    method: "POST",
                  });
                  await load();
                }}
              >
                Cancelar
              </button>
            </div>
          }
        />
        <article className="communication-message">
          {String(campaign.body)}
        </article>
        <h2>Destinatários</h2>
        <div className="communication-table-wrap">
          <table className="communication-table">
            <thead>
              <tr>
                <th>Destino</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((item) => (
                <tr key={item.id}>
                  <td>{String(item.destination)}</td>
                  <td>{String(item.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

const generalChannelFields = [
  {
    field: "emailEnabled",
    label: "Habilitar E-mail",
  },
  {
    field: "pushEnabled",
    label: "Habilitar Push",
  },
  {
    field: "smsEnabled",
    label: "Habilitar SMS",
  },
] as const;

const eventChannelFields = [
  {
    field: "inAppEnabled",
    label: "No aplicativo",
  },
  {
    field: "emailEnabled",
    label: "E-mail",
  },
  {
    field: "pushEnabled",
    label: "Push",
  },
] as const;

export function NotificationSettings() {
  const { request } = useAuth();
  const [settings, setSettings] = useState<CommunicationSettingsSummary | null>(
    null,
  );
  const [preferences, setPreferences] = useState<
    NotificationPreferenceSummary[]
  >([]);
  useEffect(() => {
    void Promise.all([
      request<CommunicationSettingsSummary>("/communication/settings"),
      request<NotificationPreferenceSummary[]>("/communication/preferences"),
    ]).then(([general, specific]) => {
      setSettings(general);
      setPreferences(specific);
    });
  }, [request]);
  if (!settings)
    return (
      <AppShell>
        <section className="communication-page">Carregando…</section>
      </AppShell>
    );
  return (
    <AppShell>
      <section className="communication-page">
        <PageHeader
          eyebrow="Preferências"
          title="Notificações e canais"
          description="Defina canais gerais, timezone e horários silenciosos."
        />
        <form
          className="communication-form"
          onSubmit={async (event) => {
            event.preventDefault();
            await request("/communication/settings", {
              method: "PUT",
              body: JSON.stringify(settings),
            });
          }}
        >
          {generalChannelFields.map(({ field, label }) => (
            <label className="communication-check" key={field}>
              <input
                type="checkbox"
                checked={settings[field]}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    [field]: event.target.checked,
                  })
                }
              />

              <span>{label}</span>
            </label>
          ))}
          <label>
            Timezone
            <input
              value={settings.timezone}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
            />
          </label>
          <label>
            Idioma
            <input
              value={settings.language}
              onChange={(e) =>
                setSettings({ ...settings, language: e.target.value })
              }
            />
          </label>
          <label>
            Silêncio a partir de
            <input
              placeholder="22:00"
              value={settings.quietHoursStart ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  quietHoursStart: e.target.value || null,
                })
              }
            />
          </label>
          <label>
            Silêncio até
            <input
              placeholder="07:00"
              value={settings.quietHoursEnd ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  quietHoursEnd: e.target.value || null,
                })
              }
            />
          </label>
          <button className="communication-button">Salvar configurações</button>
        </form>
        <h2>Preferências por evento</h2>
        <div className="preferences-list">
          {preferences.map((preference, index) => (
            <div className="preference-row" key={preference.eventType}>
              <strong>{preference.eventType}</strong>
              {eventChannelFields.map(({ field, label }) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={preference[field]}
                    onChange={(event) =>
                      setPreferences((currentPreferences) =>
                        currentPreferences.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                [field]: event.target.checked,
                              }
                            : item,
                        ),
                      )
                    }
                  />

                  <span>{label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <button
          className="communication-button"
          onClick={() =>
            void request("/communication/preferences", {
              method: "PUT",
              body: JSON.stringify({ preferences }),
            })
          }
        >
          Salvar preferências
        </button>
      </section>
    </AppShell>
  );
}
