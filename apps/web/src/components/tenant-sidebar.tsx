"use client";

import type { MembershipRole } from "@prumo/contracts";
import {
  ChevronDown,
  ChevronRight,
  EllipsisVertical,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useAuth } from "@/auth/auth-context";
import {
  hasTenantPermission,
  isTenantNavigationItemActive,
  visibleTenantNavigation,
  visibleTenantNavigationGroups,
  type TenantNavigationGroupId,
} from "./tenant-navigation";

const SIDEBAR_STORAGE_KEY = "prumo.sidebar.collapsed";
const SIDEBAR_CHANGE_EVENT = "prumo-sidebar-change";
let sidebarMemoryState = false;

const roleLabels: Record<MembershipRole, string> = {
  TENANT_OWNER: "Proprietário",
  TENANT_ADMIN: "Administrador",
  SECRETARY: "Secretaria",
  FINANCE: "Financeiro",
  INSTRUCTOR: "Instrutor",
  STUDENT: "Aluno",
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function subscribeToSidebarState(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange);
  };
}

function readSidebarState() {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? sidebarMemoryState : stored === "true";
  } catch {
    return sidebarMemoryState;
  }
}

export function useTenantSidebarState() {
  const collapsed = useSyncExternalStore(
    subscribeToSidebarState,
    readSidebarState,
    () => false,
  );

  function toggleCollapsed() {
    const next = !collapsed;
    sidebarMemoryState = next;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      // O menu continua funcional mesmo quando o navegador bloqueia storage.
    }
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
  }

  return { collapsed, toggleCollapsed };
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link className="sidebar-brand" href="/" aria-label="Prumo — visão geral">
      <span className="sidebar-brand__mark" aria-hidden="true">
        P
      </span>
      {!collapsed ? <span className="sidebar-brand__word">PRUMO</span> : null}
    </Link>
  );
}

function useUnreadCount(enabled: boolean) {
  const { request } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    const load = async () => {
      try {
        const result = await request<{ count: number }>(
          "/notifications/unread-count",
        );
        if (active) setCount(result.count);
      } catch {
        // O contador não deve impedir a navegação quando estiver indisponível.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, request]);

  return count;
}

interface TenantSidebarProps {
  pathname: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function TenantSidebar({
  pathname,
  collapsed,
  onToggleCollapsed,
}: TenantSidebarProps) {
  const { session, logout, requestTenantSelection } = useAuth();
  const router = useRouter();
  const profileMenuRef = useRef<HTMLDetailsElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<
    Partial<Record<TenantNavigationGroupId, boolean>>
  >({});
  const canReadNotifications = hasTenantPermission(
    session?.activeMembership?.permissions ?? [],
    ["notifications.read"],
  );
  const unreadCount = useUnreadCount(canReadNotifications);

  if (!session?.activeMembership) return null;

  const { activeMembership, user } = session;
  const groups = visibleTenantNavigationGroups(activeMembership.permissions);
  const canSwitchTenant =
    hasTenantPermission(activeMembership.permissions, ["tenant:select"]) &&
    session.memberships.length > 1;

  function selectAnotherTenant() {
    profileMenuRef.current?.removeAttribute("open");
    requestTenantSelection();
    router.push("/");
  }

  return (
    <aside
      className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}
      aria-label="Navegação da autoescola"
    >
      <header className="sidebar__header">
        <div className="sidebar__brand-row">
          <SidebarBrand collapsed={collapsed} />
          <button
            className="sidebar-collapse-button"
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>

        <button
          className="sidebar-tenant"
          type="button"
          onClick={canSwitchTenant ? selectAnotherTenant : undefined}
          disabled={!canSwitchTenant}
          title={collapsed ? activeMembership.tenant.name : undefined}
          data-tooltip={collapsed ? activeMembership.tenant.name : undefined}
        >
          <span className="sidebar-tenant__avatar" aria-hidden="true">
            {activeMembership.tenant.name[0]?.toUpperCase()}
          </span>
          {!collapsed ? (
            <span className="sidebar-tenant__copy">
              <small>Autoescola atual</small>
              <strong>{activeMembership.tenant.name}</strong>
            </span>
          ) : null}
          {!collapsed && canSwitchTenant ? (
            <ChevronDown className="sidebar-tenant__chevron" />
          ) : null}
        </button>
      </header>

      <nav className="sidebar-scroll" aria-label="Menu principal">
        {groups.map((group) => {
          const groupHasActiveItem = group.items.some((item) =>
            isTenantNavigationItemActive(pathname, item.href),
          );
          const groupIsCollapsed =
            Boolean(collapsedGroups[group.id]) && !groupHasActiveItem;

          return (
            <section className="nav-group" key={group.id}>
              {!collapsed ? (
                group.collapsible ? (
                  <button
                    className="nav-label nav-label--button"
                    type="button"
                    aria-expanded={!groupIsCollapsed}
                    onClick={() =>
                      setCollapsedGroups((current) => ({
                        ...current,
                        [group.id]: !current[group.id],
                      }))
                    }
                  >
                    <span>{group.label}</span>
                    <ChevronRight
                      className={groupIsCollapsed ? "" : "is-expanded"}
                    />
                  </button>
                ) : (
                  <span className="nav-label">{group.label}</span>
                )
              ) : null}

              {!groupIsCollapsed || collapsed ? (
                <div className="nav-group__items">
                  {group.items.map((item) => {
                    const active = isTenantNavigationItemActive(
                      pathname,
                      item.href,
                    );
                    const Icon = item.icon;
                    const showCount =
                      item.href === "/notifications" && unreadCount > 0;

                    return (
                      <Link
                        className={`nav-item ${
                          active ? "nav-item--active" : ""
                        }`}
                        href={item.href}
                        key={item.href}
                        aria-current={active ? "page" : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        title={collapsed ? item.label : undefined}
                        data-tooltip={collapsed ? item.label : undefined}
                      >
                        <Icon className="nav-item__icon" aria-hidden="true" />
                        {!collapsed ? (
                          <span className="nav-item__label">{item.label}</span>
                        ) : null}
                        {showCount ? (
                          <span className="nav-item__badge">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </nav>

      <footer className="sidebar__footer">
        <details
          className="sidebar-profile"
          ref={profileMenuRef}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              profileMenuRef.current?.removeAttribute("open");
            }
          }}
        >
          <summary
            aria-label={`Abrir menu de ${user.name}`}
            title={collapsed ? user.name : undefined}
            data-tooltip={collapsed ? user.name : undefined}
          >
            <span className="sidebar-profile__avatar">
              {initials(user.name)}
            </span>
            {!collapsed ? (
              <span className="sidebar-profile__copy">
                <strong>{user.name}</strong>
                <small>
                  <span className="status-dot" aria-hidden="true" />
                  {roleLabels[activeMembership.role]}
                </small>
              </span>
            ) : null}
            {!collapsed ? <EllipsisVertical aria-hidden="true" /> : null}
          </summary>
          <div className="sidebar-profile__menu">
            <Link
              href="/profile"
              onClick={() => profileMenuRef.current?.removeAttribute("open")}
            >
              <UserRound />
              Meu perfil
            </Link>
            {canSwitchTenant ? (
              <button type="button" onClick={selectAnotherTenant}>
                <UsersRound />
                Trocar autoescola
              </button>
            ) : null}
            {canReadNotifications ? (
              <Link
                href="/settings/notifications"
                onClick={() => profileMenuRef.current?.removeAttribute("open")}
              >
                <Settings />
                Preferências
              </Link>
            ) : null}
            <button type="button" onClick={() => void logout()}>
              <LogOut />
              Sair
            </button>
          </div>
        </details>
      </footer>
    </aside>
  );
}

export function TenantMobileNavigation({ pathname }: { pathname: string }) {
  const { session } = useAuth();
  if (!session?.activeMembership) return null;

  const navigation = visibleTenantNavigation(
    session.activeMembership.permissions,
  );

  return (
    <nav className="mobile-nav" aria-label="Menu móvel">
      {navigation.map((item) => {
        const active = isTenantNavigationItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            className={active ? "mobile-nav--active" : ""}
            href={item.href}
            key={item.href}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
