"use client";

import type { PaginatedResponse } from "@prumo/contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/auth-context";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/auth-api";

type Unit = {
  id: string;
  name: string;
  document?: string | null;
  phone: string;
  email: string;
  address: string;
  openingTime: string;
  closingTime: string;
  active: boolean;
};

type Classroom = {
  id: string;
  unitId: string;
  name: string;
  capacity: number;
  active: boolean;
  unit: { id: string; name: string };
};

type Kind = "units" | "classrooms";

const copy = {
  units: {
    title: "Unidades",
    singular: "unidade",
    description: "Locais de atendimento e seus horários de funcionamento.",
  },
  classrooms: {
    title: "Salas",
    singular: "sala",
    description: "Salas teóricas vinculadas às unidades da autoescola.",
  },
};

export function OperationalList({ kind }: { kind: Kind }) {
  const { request } = useAuth();
  const [items, setItems] = useState<Array<Unit | Classroom>>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "10",
    });
    if (search) query.set("search", search);
    try {
      const response = await request<PaginatedResponse<Unit | Classroom>>(
        `/${kind}?${query}`,
      );
      setItems(response.data);
      setMeta(response.meta);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "Não foi possível carregar os cadastros.",
      );
    } finally {
      setLoading(false);
    }
  }, [kind, page, request, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function toggle(item: Unit | Classroom) {
    try {
      await request(`/${kind}/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      await load();
    } catch (toggleError) {
      setError(
        toggleError instanceof ApiError
          ? toggleError.message
          : "Não foi possível alterar o status.",
      );
    }
  }

  return (
    <AppShell>
      <div className="registry-content">
        <header className="registry-title-row">
          <div>
            <span className="eyebrow">Estrutura operacional</span>
            <h1>{copy[kind].title}</h1>
            <p>{copy[kind].description}</p>
          </div>
          <Link className="button button--primary" href={`/${kind}/new`}>
            + Nova {copy[kind].singular}
          </Link>
        </header>
        <section className="registry-panel">
          <div className="registry-toolbar">
            <form
              className="registry-search"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setSearch(searchInput.trim());
              }}
            >
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar por nome"
                aria-label="Buscar por nome"
              />
              <button type="submit">Buscar</button>
            </form>
            <span className="registry-total">{meta.total} registros</span>
          </div>
          {error ? <div className="registry-error">{error}</div> : null}
          {loading ? (
            <div className="registry-state">
              <span className="spinner registry-spinner" />
              <p>Carregando…</p>
            </div>
          ) : (
            <div className="registry-table operational-table" role="table">
              <div className="registry-table__head">
                <span>Nome</span>
                <span>Vínculo</span>
                <span>Detalhes</span>
                <span>Status</span>
                <span>Ações</span>
              </div>
              {items.map((item) => (
                <div className="registry-table__row" key={item.id}>
                  <span className="registry-primary">
                    <span className="registry-avatar">{item.name[0]}</span>
                    <strong>{item.name}</strong>
                  </span>
                  <span>{"unit" in item ? item.unit.name : item.email}</span>
                  <span className="registry-muted">
                    {"capacity" in item
                      ? `${item.capacity} lugares`
                      : `${item.openingTime}–${item.closingTime}`}
                  </span>
                  <span>
                    <span
                      className={`status-badge status-badge--${
                        item.active ? "active" : "inactive"
                      }`}
                    >
                      {item.active ? "Ativa" : "Inativa"}
                    </span>
                  </span>
                  <span className="registry-actions">
                    <Link href={`/${kind}/${item.id}/edit`}>Editar</Link>
                    <button type="button" onClick={() => void toggle(item)}>
                      {item.active ? "Inativar" : "Ativar"}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {meta.totalPages > 1 ? (
            <footer className="registry-pagination">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                ← Anterior
              </button>
              <span>Página {page}</span>
              <button
                type="button"
                disabled={page === meta.totalPages}
                onClick={() => setPage((value) => value + 1)}
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

export function OperationalForm({
  kind,
  id: explicitId,
}: {
  kind: Kind;
  id?: string;
}) {
  const params = useParams<{ id?: string }>();
  const id = explicitId ?? params.id;
  const editing = Boolean(id);
  const { request } = useAuth();
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [values, setValues] = useState<Record<string, string>>({
    name: "",
    document: "",
    phone: "",
    email: "",
    address: "",
    openingTime: "07:00",
    closingTime: "22:00",
    unitId: "",
    capacity: "30",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        if (kind === "classrooms") {
          const response = await request<PaginatedResponse<Unit>>(
            "/units?pageSize=100&active=true",
          );
          setUnits(response.data);
          setValues((current) => ({
            ...current,
            unitId: current.unitId || response.data[0]?.id || "",
          }));
        }
        if (id) {
          const record = await request<Unit | Classroom>(`/${kind}/${id}`);
          setValues((current) => ({
            ...current,
            name: record.name,
            ...("capacity" in record
              ? {
                  unitId: record.unitId,
                  capacity: String(record.capacity),
                }
              : {
                  document: record.document ?? "",
                  phone: record.phone,
                  email: record.email,
                  address: record.address,
                  openingTime: record.openingTime,
                  closingTime: record.closingTime,
                }),
          }));
        }
      } catch (loadError) {
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : "Não foi possível carregar o formulário.",
        );
      }
    }
    void load();
  }, [id, kind, request]);

  function field(name: string, label: string, type = "text") {
    return (
      <label key={name}>
        <span>{label}</span>
        <input
          type={type}
          required={name !== "document"}
          value={values[name] ?? ""}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              [name]: event.target.value,
            }))
          }
        />
      </label>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload =
      kind === "units"
        ? {
            name: values.name,
            document: values.document || undefined,
            phone: values.phone,
            email: values.email,
            address: values.address,
            openingTime: values.openingTime,
            closingTime: values.closingTime,
          }
        : {
            name: values.name,
            unitId: values.unitId,
            capacity: Number(values.capacity),
          };
    try {
      await request(id ? `/${kind}/${id}` : `/${kind}`, {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/${kind}`);
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="registry-content registry-content--form">
        <header className="registry-form-header">
          <button type="button" onClick={() => router.push(`/${kind}`)}>
            ←
          </button>
          <div>
            <span className="eyebrow">Estrutura operacional</span>
            <h1>
              {editing ? "Editar" : "Nova"} {copy[kind].singular}
            </h1>
            <p>O tenant é definido pela sessão ativa.</p>
          </div>
        </header>
        <form className="registry-form-card" onSubmit={submit}>
          {error ? <div className="registry-error">{error}</div> : null}
          <fieldset className="registry-fieldset">
            <legend>Dados principais</legend>
            <div className="registry-form-grid">
              {kind === "units" ? (
                <>
                  {field("name", "Nome")}
                  {field("document", "CNPJ")}
                  {field("phone", "Telefone", "tel")}
                  {field("email", "E-mail", "email")}
                  {field("address", "Endereço")}
                  {field("openingTime", "Abertura", "time")}
                  {field("closingTime", "Fechamento", "time")}
                </>
              ) : (
                <>
                  <label>
                    <span>Unidade</span>
                    <select
                      required
                      value={values.unitId}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          unitId: event.target.value,
                        }))
                      }
                    >
                      {units.map((unit) => (
                        <option value={unit.id} key={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {field("name", "Nome")}
                  {field("capacity", "Capacidade", "number")}
                </>
              )}
            </div>
          </fieldset>
          <footer className="registry-form-actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => router.push(`/${kind}`)}
            >
              Cancelar
            </button>
            <button
              className="button button--primary"
              disabled={saving}
              type="submit"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </footer>
        </form>
      </div>
    </AppShell>
  );
}
