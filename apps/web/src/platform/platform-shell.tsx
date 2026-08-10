"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type PropsWithChildren } from "react";
import { useAuth } from "@/auth/auth-context";
import { visiblePlatformNavigation } from "./platform-navigation";

type StoredSupport = {
  id: string;
  reason: string;
  expiresAt: string;
  tenant?: { name?: string };
};

function readSupport(): StoredSupport | null {
  try {
    const raw = window.sessionStorage.getItem("prumo.support.session");
    return raw ? (JSON.parse(raw) as StoredSupport) : null;
  } catch {
    return null;
  }
}

export function PlatformShell({ children }: PropsWithChildren) {
  const { status, session, logout, selectPlatform, requestTenantSelection } =
    useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [support, setSupport] = useState<StoredSupport | null>(() =>
    typeof window === "undefined" ? null : readSupport(),
  );

  useEffect(() => {
    const update = () => setSupport(readSupport());
    window.addEventListener("prumo-support-change", update);
    return () => window.removeEventListener("prumo-support-change", update);
  }, []);

  useEffect(() => {
    if (status === "signed-out") router.replace("/");
    if (status === "selecting-tenant") router.replace("/");
    if (status === "signed-in" && session && !session.platform) {
      router.replace("/");
    }
    if (
      status === "signed-in" &&
      session?.platform &&
      session.activeMembership
    ) {
      void selectPlatform();
    }
  }, [router, selectPlatform, session, status]);

  if (
    status !== "signed-in" ||
    !session?.platform ||
    session.activeMembership
  ) {
    return (
      <main className="platform-loading">
        <span className="platform-logo">P</span>
        <span>Preparando o console seguro…</span>
      </main>
    );
  }

  const permissions = session.platform.permissions;
  return (
    <main className="platform-layout">
      <aside className="platform-sidebar">
        <Link href="/platform" className="platform-brand">
          <span>P</span>
          <strong>PRUMO</strong>
          <small>Console Anoar</small>
        </Link>
        <div className="platform-environment">
          <small>Ambiente</small>
          <strong>Administração global</strong>
          <span>Todas as autoescolas</span>
        </div>
        <nav className="platform-sidebar__nav">
          {visiblePlatformNavigation(permissions).map(([href, label]) => {
            const active =
              href === "/platform"
                ? pathname === href
                : pathname.startsWith(href);
            return (
              <Link href={href} key={href} className={active ? "active" : ""}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="platform-sidebar__footer">
          <div className="platform-sidebar__profile">
            <span>
              {session.user.name
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
            <div>
              <strong>{session.user.name}</strong>
              <small>{session.platform.role.replaceAll("_", " ")}</small>
            </div>
          </div>
          {session.memberships.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                requestTenantSelection();
                router.push("/");
              }}
            >
              Acessar autoescola
            </button>
          ) : null}
          <button type="button" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </aside>
      <section className="platform-main">
        {support ? (
          <div className="support-banner">
            <strong>Modo suporte identificado</strong>
            <span>
              {support.tenant?.name ?? "Tenant"} · {support.reason}
            </span>
            <Link href={`/platform/support/${support.id}`}>Ver sessão</Link>
          </div>
        ) : null}
        <header className="platform-header">
          <div>
            <small>Console administrativo</small>
            <strong>{session.user.name}</strong>
          </div>
          <span className="platform-role">
            {session.platform.role.replaceAll("_", " ")}
          </span>
        </header>
        {session.platform.mfaEnabled ? null : (
          <div className="mfa-notice">
            MFA ainda não está ativo nesta conta global. A estrutura está
            preparada; habilite-o antes do uso em produção.
          </div>
        )}
        {children}
      </section>
    </main>
  );
}
