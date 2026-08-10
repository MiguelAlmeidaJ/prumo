"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import type { CredentialTokenInfo } from "@prumo/contracts";
import { CredentialShell } from "@/components/credential-shell";
import { authApi } from "@/lib/auth-api";

function SetupPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [info, setInfo] = useState<CredentialTokenInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) return;
    void authApi
      .inspectCredentialToken(token)
      .then((result) => {
        if (active) setInfo(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "O link é inválido ou expirou.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await authApi.setPassword({ token, password });
      setMessage(response.message);
      setInfo(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível definir a senha.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="credential-state">Validando seu link…</div>;
  }
  if (message) {
    return (
      <div className="credential-success" role="status">
        <strong>Senha atualizada</strong>
        <p>{message}</p>
        <Link href="/">Entrar no Prumo</Link>
      </div>
    );
  }
  if (!info) {
    return (
      <div className="credential-state credential-state--error">
        <p>{error ?? "O link é inválido ou expirou."}</p>
        <Link href="/forgot-password">Solicitar outro link</Link>
      </div>
    );
  }

  return (
    <form className="credential-form" onSubmit={submit}>
      <div className="credential-context">
        <strong>{info.name}</strong>
        <span>{info.email}</span>
        {info.tenant ? <small>{info.tenant.name}</small> : null}
      </div>
      <label>
        <span>Nova senha</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoFocus
        />
        <small>Use pelo menos 12 caracteres.</small>
      </label>
      <label>
        <span>Confirmar nova senha</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button button--primary" disabled={submitting}>
        {submitting ? "Salvando…" : "Definir senha"}
      </button>
    </form>
  );
}

export default function SetupPasswordPage() {
  return (
    <CredentialShell
      title="Defina sua senha"
      description="Este link é pessoal, temporário e pode ser utilizado uma única vez."
    >
      <Suspense fallback={<div className="credential-state">Carregando…</div>}>
        <SetupPasswordForm />
      </Suspense>
    </CredentialShell>
  );
}
