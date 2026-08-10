"use client";

import type {
  InviteTeamMemberInput,
  MembershipRole,
  TeamMemberInviteResult,
  TeamMemberSummary,
} from "@prumo/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { useAuth } from "@/auth/auth-context";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/auth-api";

const roleLabels: Record<MembershipRole, string> = {
  TENANT_OWNER: "Proprietário",
  TENANT_ADMIN: "Administrador",
  SECRETARY: "Secretaria",
  FINANCE: "Financeiro",
  INSTRUCTOR: "Instrutor",
  STUDENT: "Aluno",
};

const teamRoles: MembershipRole[] = [
  "TENANT_OWNER",
  "TENANT_ADMIN",
  "SECRETARY",
  "FINANCE",
  "INSTRUCTOR",
];

const assignableRoles = teamRoles;

export default function TeamPage() {
  const { request, session } = useAuth();
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState<MembershipRole>("SECRETARY");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await request<TeamMemberSummary[]>("/team/members");

      setMembers(
        result.filter((member) => member.role !== "STUDENT"),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a equipe.",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input: InviteTeamMemberInput = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      role,
    };
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await request<TeamMemberInviteResult>("/team/members", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setMessage(
        result.emailSent
          ? `Acesso liberado e e-mail enviado para ${result.member.user.email}.`
          : "Acesso liberado, mas o e-mail não pôde ser enviado. Use a opção de reenvio.",
      );
      form.reset();
      setRole("SECRETARY");
      await load();
    } catch (inviteError) {
      setError(
        inviteError instanceof ApiError
          ? inviteError.message
          : "Não foi possível adicionar o membro.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function updateMember(
    member: TeamMemberSummary,
    input: { role?: MembershipRole; active?: boolean },
  ) {
    setChangingId(member.id);
    setError(null);
    setMessage(null);
    try {
      await request(`/team/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setMessage("Acesso atualizado.");
      await load();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Não foi possível atualizar o acesso.",
      );
    } finally {
      setChangingId(null);
    }
  }

  async function memberAction(
    member: TeamMemberSummary,
    action: "resend-invitation" | "revoke-sessions",
  ) {
    setChangingId(member.id);
    setError(null);
    setMessage(null);
    try {
      const result = await request<{ emailSent?: boolean; message?: string }>(
        `/team/members/${member.id}/${action}`,
        { method: "POST" },
      );
      setMessage(
        action === "resend-invitation"
          ? result.emailSent
            ? "Convite reenviado."
            : "O link foi renovado, mas o e-mail não pôde ser enviado."
          : (result.message ?? "Sessões revogadas."),
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Não foi possível concluir a ação.",
      );
    } finally {
      setChangingId(null);
    }
  }

  const isOwner = session?.activeMembership?.role === "TENANT_OWNER";

  return (
    <AppShell>
      <div className="registry-content team-page">
        <header className="registry-title-row">
          <div>
            <span className="eyebrow">Sistema</span>
            <h1>Equipe e acessos</h1>
            <p>Convide usuários e controle os papéis no ambiente atual.</p>
          </div>
          <span className="registry-total">{members.length} membros</span>
        </header>

        <form className="registry-panel team-invite" onSubmit={invite}>
          <div>
            <h2>Adicionar membro</h2>
            <p>
              Enviaremos um link de primeiro acesso quando a pessoa ainda não
              possuir uma conta Prumo.
            </p>
          </div>
          <div className="team-invite__fields">
            <label>
              <span>Nome</span>
              <input name="name" required minLength={2} maxLength={120} />
            </label>
            <label>
              <span>E-mail</span>
              <input name="email" type="email" required />
            </label>
            <label>
              <span>Papel</span>
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as MembershipRole)
                }
              >
                {assignableRoles
                  .filter((value) => isOwner || value !== "TENANT_OWNER")
                  .map((value) => (
                    <option value={value} key={value}>
                      {roleLabels[value]}
                    </option>
                  ))}
              </select>
            </label>
            <button className="button button--primary" disabled={submitting}>
              {submitting ? "Adicionando…" : "Adicionar"}
            </button>
          </div>
          {role === "INSTRUCTOR" ? (
            <small className="team-invite__note">
              O instrutor deve estar
              cadastrado neste tenant com o mesmo e-mail.
            </small>
          ) : null}
        </form>

        {error ? <p className="registry-error">{error}</p> : null}
        {message ? <p className="team-feedback">{message}</p> : null}

        <section className="registry-panel team-list">
          {loading ? (
            <div className="registry-state">Carregando equipe…</div>
          ) : members.length === 0 ? (
            <div className="registry-state">Nenhum membro encontrado.</div>
          ) : (
            members.map((member) => {
              const busy = changingId === member.id;
              return (
                <article className="team-member" key={member.id}>
                  <span className="team-member__avatar" aria-hidden="true">
                    {member.user.name
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <div className="team-member__identity">
                    <strong>{member.user.name}</strong>
                    <span>{member.user.email}</span>
                  </div>
                  <select
                    aria-label={`Papel de ${member.user.name}`}
                    value={member.role}
                    disabled={
                      busy || (!isOwner && member.role === "TENANT_OWNER")
                    }
                    onChange={(event) =>
                      void updateMember(member, {
                        role: event.target.value as MembershipRole,
                      })
                    }
                  >
                    {assignableRoles
                      .filter(
                        (value) =>
                          isOwner ||
                          value !== "TENANT_OWNER" ||
                          member.role === "TENANT_OWNER",
                      )
                      .map((value) => (
                        <option value={value} key={value}>
                          {roleLabels[value]}
                        </option>
                      ))}
                  </select>
                  <span
                    className={`team-member__status ${
                      member.active ? "is-active" : ""
                    }`}
                  >
                    {member.invitationPending
                      ? "Convite pendente"
                      : member.active
                        ? "Ativo"
                        : "Inativo"}
                  </span>
                  <div className="team-member__actions">
                    {member.invitationPending && member.active ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void memberAction(member, "resend-invitation")
                        }
                      >
                        Reenviar convite
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void memberAction(member, "revoke-sessions")
                      }
                    >
                      Revogar sessões
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void updateMember(member, { active: !member.active })
                      }
                    >
                      {member.active ? "Desativar" : "Reativar"}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </AppShell>
  );
}
