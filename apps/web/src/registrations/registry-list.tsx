"use client";

import type { PaginatedResponse, Permission } from "@prumo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { useAuth } from "@/auth/auth-context";
import { ActionMenu } from "@/components/action-menu";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/auth-api";
import type { BaseRegistryRecord, RegistryConfig } from "./registry-config";

function can(granted: Permission[], required: Permission): boolean {
  return granted.includes("*") || granted.includes(required);
}

export function RegistryList<T extends BaseRegistryRecord>({
  config,
}: {
  config: RegistryConfig<T>;
}) {
  const { request, session } = useAuth();
  const permissions = session?.activeMembership?.permissions ?? [];
  const canRead = can(permissions, config.readPermission);
  const [items, setItems] = useState<T[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) {
      setItems([]);
      setMeta({
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      });
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "10",
    });
    if (search) query.set("search", search);

    try {
      const response = await request<PaginatedResponse<T>>(
        `${config.endpoint}?${query}`,
      );
      setItems(response.data);
      setMeta(response.meta);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : `Não foi possível carregar ${config.plural}.`,
      );
    } finally {
      setLoading(false);
    }
  }, [canRead, config.endpoint, config.plural, page, request, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function toggleStatus(item: T) {
    setChangingId(item.id);
    setError(null);
    try {
      await request(`${config.endpoint}/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
        }),
      });
      await load();
    } catch (statusError) {
      setError(
        statusError instanceof ApiError
          ? statusError.message
          : "Não foi possível alterar o status.",
      );
    } finally {
      setChangingId(null);
    }
  }

  const canCreate = can(permissions, config.createPermission);
  const canUpdate = can(permissions, config.updatePermission);
  const canChangeStatus = can(permissions, config.statusPermission);
  const canReadProcesses = can(permissions, "processes.read");
  const canReadContracts = can(permissions, "contracts.read");

  return (
    <AppShell>
      <div className="registry-content">
        <header className="registry-title-row">
          <div>
            <span className="eyebrow">Cadastros base</span>
            <h1>{config.title}</h1>
            <p>{config.subtitle}</p>
          </div>
          {canCreate ? (
            <Link
              className="button button--primary"
              href={`${config.route}/new`}
            >
              <span aria-hidden="true">＋</span>
              Novo {config.singular}
            </Link>
          ) : null}
        </header>

        <section className="registry-panel">
          <div className="registry-toolbar">
            <form className="registry-search" onSubmit={submitSearch}>
              <span aria-hidden="true">⌕</span>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={config.searchPlaceholder}
                aria-label={config.searchPlaceholder}
              />
              <button type="submit">Buscar</button>
            </form>
            <span className="registry-total">
              {meta.total} {meta.total === 1 ? config.singular : config.plural}
            </span>
          </div>

          {error ? (
            <div className="registry-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void load()}>
                Tentar novamente
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="registry-state">
              <span className="spinner registry-spinner" />
              <p>Carregando {config.plural}…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="registry-state registry-state--empty">
              <span className="registry-empty-icon">
                {config.title.slice(0, 1)}
              </span>
              <h2>Nenhum {config.singular} encontrado.</h2>
              <p>
                {search
                  ? "Ajuste os termos da busca e tente novamente."
                  : `Cadastre o primeiro ${config.singular} deste ambiente.`}
              </p>
            </div>
          ) : (
            <div className="registry-table" role="table">
              <div className="registry-table__head" role="row">
                <span>Cadastro</span>
                <span>Identificação</span>
                <span>Detalhes</span>
                <span>Status</span>
                <span>Ações</span>
              </div>
              {items.map((item) => (
                <div className="registry-table__row" role="row" key={item.id}>
                  <span className="registry-primary">
                    <span className="registry-avatar">
                      {config.primary(item)[0]?.toUpperCase()}
                    </span>
                    <strong>{config.primary(item)}</strong>
                  </span>
                  <span>{config.secondary(item)}</span>
                  <span className="registry-muted">
                    {config.tertiary(item)}
                  </span>
                  <span>
                    <span
                      className={`status-badge status-badge--${item.status.toLowerCase()}`}
                    >
                      {item.status === "ACTIVE" ? "Ativo" : "Inativo"}
                    </span>
                  </span>
                  {canUpdate ||
                  canChangeStatus ||
                  (config.route === "/students" &&
                    (canReadProcesses || canReadContracts)) ? (
                    <ActionMenu label={`Ações de ${config.primary(item)}`}>
                      {config.route === "/students" && canReadProcesses ? (
                        <Link href={`/students/${item.id}/processes`}>
                          Processos
                        </Link>
                      ) : null}
                      {config.route === "/students" && canReadContracts ? (
                        <Link href={`/students/${item.id}/contracts`}>
                          Contratos
                        </Link>
                      ) : null}
                      {canUpdate ? (
                        <Link href={`${config.route}/${item.id}/edit`}>
                          Editar
                        </Link>
                      ) : null}
                      {canChangeStatus ? (
                        <button
                          type="button"
                          disabled={changingId === item.id}
                          onClick={() => void toggleStatus(item)}
                        >
                          {changingId === item.id
                            ? "Salvando…"
                            : item.status === "ACTIVE"
                              ? "Inativar"
                              : "Ativar"}
                        </button>
                      ) : null}
                    </ActionMenu>
                  ) : (
                    <span className="action-menu-cell action-menu-empty">
                      —
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {meta.totalPages > 1 ? (
            <footer className="registry-pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                ← Anterior
              </button>
              <span>
                Página <strong>{meta.page}</strong> de {meta.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Próxima →
              </button>
            </footer>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
