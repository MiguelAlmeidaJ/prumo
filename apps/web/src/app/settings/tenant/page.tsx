"use client";

import type {
  TenantSettingsSummary,
  UpdateTenantSettingsInput,
} from "@prumo/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { useAuth } from "@/auth/auth-context";
import { AppShell } from "@/components/app-shell";

const timezoneOptions = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Rio_Branco",
  "America/Noronha",
];

export default function TenantSettingsPage() {
  const { request } = useAuth();
  const [settings, setSettings] = useState<TenantSettingsSummary | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [locale, setLocale] = useState("pt-BR");
  const [supportAccessEnabled, setSupportAccessEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apply = useCallback((next: TenantSettingsSummary) => {
    setSettings(next);
    setName(next.tenant.name);
    setTimezone(next.timezone);
    setLocale(next.locale);
    setSupportAccessEnabled(next.supportAccessEnabled);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      apply(await request<TenantSettingsSummary>("/tenant/settings"));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar as configurações.",
      );
    } finally {
      setLoading(false);
    }
  }, [apply, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: UpdateTenantSettingsInput = {
      name,
      timezone,
      locale,
      supportAccessEnabled,
    };
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      apply(
        await request<TenantSettingsSummary>("/tenant/settings", {
          method: "PATCH",
          body: JSON.stringify(input),
        }),
      );
      setMessage(
        "Configurações salvas. A nova identificação aparecerá em toda a interface no próximo acesso.",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível salvar as configurações.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="registry-content registry-content--form">
        <header className="registry-form-header">
          <div>
            <span className="eyebrow">Sistema</span>
            <h1>Configurações da autoescola</h1>
            <p>
              Identificação, regionalização e acesso de suporte do tenant atual.
            </p>
          </div>
        </header>

        {loading ? (
          <div className="registry-state">Carregando configurações…</div>
        ) : settings ? (
          <form
            className="registry-form-card tenant-settings-form"
            onSubmit={submit}
          >
            <section className="tenant-settings-section">
              <div>
                <h2>Identificação</h2>
                <p>O código do tenant é estável e não pode ser alterado.</p>
              </div>
              <div className="registry-form-grid">
                <label className="registry-field registry-field--wide">
                  <span>Nome da autoescola</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </label>
                <label className="registry-field registry-field--wide">
                  <span>Código do ambiente</span>
                  <input value={settings.tenant.slug} disabled />
                </label>
              </div>
            </section>

            <section className="tenant-settings-section">
              <div>
                <h2>Regionalização</h2>
                <p>
                  Datas continuam armazenadas em UTC e são exibidas no fuso
                  escolhido.
                </p>
              </div>
              <div className="registry-form-grid">
                <label className="registry-field registry-field--wide">
                  <span>Fuso horário</span>
                  <select
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                  >
                    {timezoneOptions.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="registry-field registry-field--wide">
                  <span>Idioma e formato</span>
                  <select
                    value={locale}
                    onChange={(event) => setLocale(event.target.value)}
                  >
                    <option value="pt-BR">Português (Brasil)</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="tenant-settings-section">
              <div>
                <h2>Segurança e suporte</h2>
                <p>
                  Você mantém o controle sobre acessos assistidos pela equipe
                  Prumo.
                </p>
              </div>
              <label className="tenant-settings-toggle">
                <input
                  type="checkbox"
                  checked={supportAccessEnabled}
                  onChange={(event) =>
                    setSupportAccessEnabled(event.target.checked)
                  }
                />
                <span>
                  <strong>Permitir sessões de suporte autorizadas</strong>
                  <small>
                    Cada sessão exige motivo, expira automaticamente e gera
                    auditoria.
                  </small>
                </span>
              </label>
            </section>

            {error ? <p className="registry-error">{error}</p> : null}
            {message ? <p className="team-feedback">{message}</p> : null}
            <footer className="registry-form-actions">
              <span>
                Última atualização{" "}
                {new Date(settings.updatedAt).toLocaleString("pt-BR")}
              </span>
              <button className="button button--primary" disabled={submitting}>
                {submitting ? "Salvando…" : "Salvar configurações"}
              </button>
            </footer>
          </form>
        ) : (
          <div className="registry-error">
            {error ?? "Configurações indisponíveis."}
          </div>
        )}
      </div>
    </AppShell>
  );
}
