"use client";

import type { MembershipRole, MembershipSummary } from "@prumo/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { useAuth } from "@/auth/auth-context";
import { hasTenantPermission } from "@/components/tenant-navigation";
import {
  TenantMobileNavigation,
  TenantSidebar,
  useTenantSidebarState,
} from "@/components/tenant-sidebar";
import { TenantDashboardContent } from "@/components/tenant-dashboard-content";
import { NotificationBell } from "@/communication/notification-bell";

const roleLabels: Record<MembershipRole, string> = {
  TENANT_OWNER: "Proprietário",
  TENANT_ADMIN: "Administrador",
  SECRETARY: "Secretaria",
  FINANCE: "Financeiro",
  INSTRUCTOR: "Instrutor",
  STUDENT: "Aluno",
};

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        P
      </span>
      <span className="brand__word">PRUMO</span>
    </div>
  );
}

function Icon({
  children,
  size = "normal",
}: {
  children: ReactNode;
  size?: "normal" | "small";
}) {
  return <span className={`icon icon--${size}`}>{children}</span>;
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <BrandMark />
      <span className="spinner spinner--light" aria-label="Carregando" />
    </main>
  );
}

function LoginScreen() {
  const { login, error, isSubmitting, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void login({ email, password });
  }

  return (
    <main className="auth-layout">
      <section className="auth-hero">
        <BrandMark />
        <div className="auth-hero__content">
          <span className="eyebrow eyebrow--light">
            Gestão que aponta o caminho
          </span>
          <h1>Sua autoescola no rumo certo.</h1>
          <p>
            Uma operação mais clara, organizada e conectada — todos os dias.
          </p>
        </div>
        <div className="route-line" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="auth-hero__footer">Prumo • Feito para autoescolas</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand">
            <BrandMark compact />
          </div>
          <span className="eyebrow">Área de acesso</span>
          <h2>Que bom ter você de volta.</h2>
          <p className="muted">Entre com os dados da sua conta Prumo.</p>

          <form onSubmit={submit} className="login-form">
            <label>
              <span>E-mail</span>
              <div className="input-shell">
                <Icon size="small">@</Icon>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="voce@autoescola.com.br"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearError();
                  }}
                  required
                />
              </div>
            </label>

            <label>
              <span>Senha</span>
              <div className="input-shell">
                <Icon size="small">••</Icon>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  minLength={8}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearError();
                  }}
                  required
                />
              </div>
            </label>

            <Link className="login-help-link" href="/forgot-password">
              Esqueci minha senha
            </Link>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              className="button button--primary button--wide"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? <span className="spinner" /> : "Entrar no Prumo"}
              {!isSubmitting ? <span aria-hidden="true">→</span> : null}
            </button>
          </form>

          <div className="safe-note">
            <Icon size="small">✓</Icon>
            <span>Seus dados e sua sessão são protegidos.</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function TenantOption({
  membership,
  active,
  onSelect,
}: {
  membership: MembershipSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const initials = membership.tenant.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <button
      className={`tenant-option ${active ? "tenant-option--active" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className="tenant-avatar">{initials}</span>
      <span className="tenant-option__copy">
        <strong>{membership.tenant.name}</strong>
        <small>{roleLabels[membership.role]}</small>
      </span>
      <span className="tenant-option__arrow" aria-hidden="true">
        {active ? "✓" : "→"}
      </span>
    </button>
  );
}

function TenantScreen() {
  const {
    session,
    selectTenant,
    selectPlatform,
    cancelTenantSelection,
    isSubmitting,
    error,
  } = useAuth();

  if (!session) return null;

  return (
    <main className="tenant-page">
      <header className="simple-header">
        <BrandMark compact />
        <span className="user-chip">{session.user.name}</span>
      </header>

      <section className="tenant-card">
        <div className="step-badge">1</div>
        <span className="eyebrow">Ambiente de trabalho</span>
        <h1>Onde vamos trabalhar agora?</h1>
        <p className="muted">
          Você só pode acessar as autoescolas vinculadas à sua conta.
        </p>

        <div className="tenant-list">
          {session.platform ? (
            <button
              className="tenant-option tenant-option--platform"
              onClick={() => void selectPlatform()}
              type="button"
            >
              <span className="tenant-avatar">P</span>
              <span className="tenant-option__copy">
                <strong>Console Prumo</strong>
                <small>{session.platform.role.replaceAll("_", " ")}</small>
              </span>
              <span className="tenant-option__arrow" aria-hidden="true">
                →
              </span>
            </button>
          ) : null}
          {session.memberships.map((membership) => (
            <TenantOption
              key={membership.id}
              membership={membership}
              active={
                membership.id === session.activeMembership?.id &&
                session.memberships.length === 1
              }
              onSelect={() => void selectTenant(membership.tenant.id)}
            />
          ))}
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {isSubmitting ? (
          <p className="tenant-loading">
            <span className="spinner" /> Preparando seu ambiente…
          </p>
        ) : null}

        <button
          className="button button--ghost"
          type="button"
          onClick={cancelTenantSelection}
        >
          Voltar
        </button>
      </section>
    </main>
  );
}

function Dashboard() {
  const { session, requestTenantSelection, logout, isSubmitting } = useAuth();
  const { collapsed, toggleCollapsed } = useTenantSidebarState();

  if (!session?.activeMembership) return <PlatformRedirect />;

  const { user, activeMembership } = session;
  const firstName = user.name.split(" ")[0];
  const canSwitchTenant =
    hasTenantPermission(activeMembership.permissions, ["tenant:select"]) &&
    session.memberships.length > 1;

  return (
    <main
      className={`dashboard ${collapsed ? "dashboard--sidebar-collapsed" : ""}`}
    >
      <TenantSidebar
        pathname="/"
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <section className="dashboard__main" id="inicio">
        <header className="dashboard-header">
          <div className="tenant-switcher">
            <span className="tenant-avatar tenant-avatar--small">
              {activeMembership.tenant.name[0]}
            </span>
            <span>
              <small>Autoescola ativa</small>
              <strong>{activeMembership.tenant.name}</strong>
            </span>
            {canSwitchTenant ? (
              <button
                className="tenant-switcher__action"
                type="button"
                aria-label="Trocar autoescola"
                onClick={requestTenantSelection}
              >
                ⌄
              </button>
            ) : null}
          </div>

          <div className="header-user">
            {hasTenantPermission(activeMembership.permissions, [
                          "notifications.read",
                        ]) ? (
                          <NotificationBell />
                        ) : null}
            <span className="user-avatar">
              {user.name
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
          </div>
        </header>

        <TenantDashboardContent firstName={firstName} />
      </section>
      <TenantMobileNavigation pathname="/" />
    </main>
  );
}

function PlatformRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/platform");
  }, [router]);
  return <LoadingScreen />;
}

function AuthenticatedApp() {
  const { status } = useAuth();

  if (status === "booting") return <LoadingScreen />;
  if (status === "signed-out") return <LoginScreen />;
  if (status === "selecting-tenant") return <TenantScreen />;
  return <Dashboard />;
}

export default function Home() {
  return <AuthenticatedApp />;
}
