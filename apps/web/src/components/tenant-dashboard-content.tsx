"use client";

import type {
  TenantDashboardMetric,
  TenantDashboardResponse,
} from "@prumo/contracts";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  Route,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/auth/auth-context";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function metricIcon(key: string) {
  if (key === "students") return UsersRound;
  if (key === "processes") return Route;
  if (key === "overdue") return WalletCards;
  if (key === "completed") return ClipboardCheck;
  return CalendarClock;
}

function metricValue(metric: TenantDashboardMetric): string {
  return metric.format === "CURRENCY"
    ? currencyFormatter.format(metric.value / 100)
    : new Intl.NumberFormat("pt-BR").format(metric.value);
}

export function TenantDashboardContent({ firstName }: { firstName: string }) {
  const { request } = useAuth();
  const [dashboard, setDashboard] = useState<TenantDashboardResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await request<TenantDashboardResponse>("/dashboard"));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a visão geral.",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="dashboard-content operations-dashboard">
      <div className="welcome">
        <div>
          <span className="eyebrow">Visão geral</span>
          <h1>Olá, {firstName}.</h1>
          <p>Prioridades e compromissos do seu ambiente, em um só lugar.</p>
        </div>
        <div className="date-pill">
          <span aria-hidden="true">●</span> Atualizado agora
        </div>
      </div>

      {error ? (
        <div className="dashboard-load-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="dashboard-skeleton" aria-label="Carregando painel">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      ) : dashboard ? (
        <>
          <section className="operations-metrics" aria-label="Indicadores">
            {dashboard.metrics.map((metric) => {
              const Icon = metricIcon(metric.key);
              const content = (
                <>
                  <span className="operations-metric__icon">
                    <Icon size={19} />
                  </span>
                  <small>{metric.label}</small>
                  <strong>{metricValue(metric)}</strong>
                  {metric.href ? <ArrowRight size={16} /> : null}
                </>
              );
              return metric.href ? (
                <Link
                  className="operations-metric"
                  href={metric.href}
                  key={metric.key}
                >
                  {content}
                </Link>
              ) : (
                <article className="operations-metric" key={metric.key}>
                  {content}
                </article>
              );
            })}
          </section>

          <div className="operations-grid">
            <section className="registry-panel operations-section">
              <header className="operations-section__header">
                <div>
                  <span className="eyebrow">Fila de trabalho</span>
                  <h2>O que precisa de atenção</h2>
                </div>
              </header>
              {dashboard.tasks.length ? (
                <div className="operations-task-list">
                  {dashboard.tasks.map((task) => (
                    <Link
                      className={`operations-task operations-task--${task.tone.toLowerCase()}`}
                      href={task.href}
                      key={task.key}
                    >
                      <span className="operations-task__count">
                        {task.count}
                      </span>
                      <span>
                        <strong>{task.title}</strong>
                        <small>{task.description}</small>
                      </span>
                      <ArrowRight size={16} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="operations-empty">
                  Nenhuma pendência para tratar agora.
                </div>
              )}
            </section>

            <section className="registry-panel operations-section">
              <header className="operations-section__header">
                <div>
                  <span className="eyebrow">Próximos 7 dias</span>
                  <h2>Agenda em seguida</h2>
                </div>
                {dashboard.scope === "MANAGEMENT" ? (
                  <Link href="/schedule">Ver agenda</Link>
                ) : null}
              </header>
              {dashboard.upcoming.length ? (
                <div className="operations-event-list">
                  {dashboard.upcoming.map((event) => {
                    const eventContent = (
                      <>
                        <span className="operations-event__date">
                          {dateFormatter.format(new Date(event.startsAt))}
                        </span>
                        <span className="operations-event__copy">
                          <strong>{event.title}</strong>
                          <small>{event.context}</small>
                        </span>
                        <span className="operations-event__status">
                          {event.status.replaceAll("_", " ")}
                        </span>
                      </>
                    );
                    return event.href === "/" ? (
                      <article
                        className="operations-event"
                        key={`${event.kind}-${event.id}`}
                      >
                        {eventContent}
                      </article>
                    ) : (
                      <Link
                        className="operations-event"
                        href={event.href}
                        key={`${event.kind}-${event.id}`}
                      >
                        {eventContent}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="operations-empty">
                  Nenhum compromisso agendado para os próximos dias.
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
