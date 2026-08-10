"use client";

import type { ActionMessage } from "@prumo/contracts";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/auth/auth-context";
import { AppShell } from "@/components/app-shell";

export default function ProfilePage() {
  const { session, request, logout } = useAuth();
  const membership = session?.activeMembership;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    setError(null);
    if (newPassword !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    try {
      await request<ActionMessage>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      form.reset();
      await logout();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível alterar a senha.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="registry-content">
        <header className="registry-title-row">
          <div>
            <span className="eyebrow">Sua conta</span>
            <h1>Meu perfil</h1>
            <p>Dados da conta e do acesso ao ambiente atual.</p>
          </div>
        </header>
        <section className="registry-panel profile-panel">
          <dl className="profile-details">
            <div>
              <dt>Nome</dt>
              <dd>{session?.user.name}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{session?.user.email}</dd>
            </div>
            <div>
              <dt>Autoescola</dt>
              <dd>{membership?.tenant.name}</dd>
            </div>
            <div>
              <dt>Perfil de acesso</dt>
              <dd>{membership?.role.replaceAll("_", " ")}</dd>
            </div>
          </dl>
        </section>
        <section className="registry-panel profile-password">
          <div>
            <h2>Alterar senha</h2>
            <p>
              Ao salvar, as sessões abertas serão revogadas e você entrará
              novamente.
            </p>
          </div>
          <form className="credential-form" onSubmit={changePassword}>
            <label>
              <span>Senha atual</span>
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>
            <label>
              <span>Nova senha</span>
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <label>
              <span>Confirmar nova senha</span>
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="button button--primary" disabled={submitting}>
              {submitting ? "Salvando…" : "Alterar senha"}
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
