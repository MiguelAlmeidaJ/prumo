"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { CredentialShell } from "@/components/credential-shell";
import { authApi } from "@/lib/auth-api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await authApi.forgotPassword({ email });
      setMessage(response.message);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível solicitar a recuperação.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CredentialShell
      title="Recupere sua senha"
      description="Informe seu e-mail. Se houver uma conta ativa, enviaremos um link temporário."
    >
      {message ? (
        <div className="credential-success" role="status">
          <strong>Solicitação recebida</strong>
          <p>{message}</p>
          <Link href="/">Voltar ao login</Link>
        </div>
      ) : (
        <form className="credential-form" onSubmit={submit}>
          <label>
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button button--primary" disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar link"}
          </button>
          <Link className="credential-back" href="/">
            Voltar ao login
          </Link>
        </form>
      )}
    </CredentialShell>
  );
}
