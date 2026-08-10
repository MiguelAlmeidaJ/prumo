"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type PropsWithChildren } from "react";

import { useAuth } from "@/auth/auth-context";
import { NotificationBell } from "@/communication/notification-bell";
import { canAccessTenantPath, hasTenantPermission } from "./tenant-navigation";
import {
  TenantMobileNavigation,
  TenantSidebar,
  useTenantSidebarState,
} from "./tenant-sidebar";

function Brand() {
  return (
    <Link className="brand brand--compact app-brand-link" href="/">
      <span className="brand__mark" aria-hidden="true">
        P
      </span>
      <span className="brand__word">PRUMO</span>
    </Link>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const { status, session, logout, requestTenantSelection } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleCollapsed } = useTenantSidebarState();
  const permissions = session?.activeMembership?.permissions ?? [];
  const canAccessCurrentPath = canAccessTenantPath(pathname, permissions);
  const canSwitchTenant =
    hasTenantPermission(permissions, ["tenant:select"]) &&
    (session?.memberships.length ?? 0) > 1;

  useEffect(() => {
    if (status === "signed-out") router.replace("/");
    if (status === "selecting-tenant") router.replace("/");
    if (status === "signed-in" && session && !session.activeMembership) {
      router.replace(session.platform ? "/platform" : "/");
    }
    if (
      status === "signed-in" &&
      session?.activeMembership &&
      !canAccessCurrentPath
    ) {
      router.replace("/");
    }
  }, [canAccessCurrentPath, router, session, status]);

  if (
    status !== "signed-in" ||
    !session?.activeMembership ||
    !canAccessCurrentPath
  ) {
    return (
      <main className="loading-screen">
        <Brand />
        <span className="spinner spinner--light" aria-label="Carregando" />
      </main>
    );
  }

  const { user, activeMembership } = session;
  return (
    <main
      className={`dashboard ${collapsed ? "dashboard--sidebar-collapsed" : ""}`}
    >
      <TenantSidebar
        pathname={pathname}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <section className="dashboard__main">
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
                onClick={() => {
                  requestTenantSelection();
                  router.push("/");
                }}
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
        {children}
      </section>
      <TenantMobileNavigation pathname={pathname} />
    </main>
  );
}
