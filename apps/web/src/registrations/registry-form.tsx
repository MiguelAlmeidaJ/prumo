"use client";

import type { Permission } from "@prumo/contracts";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { useAuth } from "@/auth/auth-context";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/auth-api";
import type {
  BaseRegistryRecord,
  RegistryConfig,
  RegistryField,
} from "./registry-config";

function can(granted: Permission[], required: Permission): boolean {
  return granted.includes("*") || granted.includes(required);
}

export function RegistryForm<T extends BaseRegistryRecord>({
  config,
  id,
}: {
  config: RegistryConfig<T>;
  id?: string;
}) {
  const editing = Boolean(id);
  const { request, session } = useAuth();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    config.emptyValues,
  );
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;

    async function load() {
      try {
        const record = await request<T>(`${config.endpoint}/${id}`);
        if (active) setValues(config.fromRecord(record));
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : `Não foi possível carregar o ${config.singular}.`,
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [config, id, request]);

  const sections = useMemo(() => {
    const groups: Array<{ title: string; fields: RegistryField[] }> = [];
    let current = "";
    for (const field of config.fields) {
      if (field.section) current = field.section;
      const title = current || "Dados do cadastro";
      let group = groups.find((item) => item.title === title);
      if (!group) {
        group = { title, fields: [] };
        groups.push(group);
      }
      group.fields.push(field);
    }
    return groups;
  }, [config.fields]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await request(id ? `${config.endpoint}/${id}` : config.endpoint, {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(config.toPayload(values)),
      });
      router.push(config.route);
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : `Não foi possível salvar o ${config.singular}.`,
      );
    } finally {
      setSaving(false);
    }
  }

  const permissions = session?.activeMembership?.permissions ?? [];
  const allowed = can(
    permissions,
    editing ? config.updatePermission : config.createPermission,
  );

  return (
    <AppShell>
      <div className="registry-content registry-content--form">
        <header className="registry-form-header">
          <button
            className="registry-back"
            type="button"
            onClick={() => router.push(config.route)}
          >
            ←
          </button>
          <div>
            <span className="eyebrow">
              {editing ? "Edição de cadastro" : "Novo cadastro"}
            </span>
            <h1>
              {editing ? `Editar ${config.singular}` : `Novo ${config.singular}`}
            </h1>
            <p>
              Os dados serão vinculados somente à autoescola ativa da sessão.
            </p>
          </div>
        </header>

        {!allowed ? (
          <section className="registry-form-card registry-state">
            <h2>Permissão insuficiente</h2>
            <p>Seu perfil não pode alterar este tipo de cadastro.</p>
          </section>
        ) : loading ? (
          <section className="registry-form-card registry-state">
            <span className="spinner registry-spinner" />
            <p>Carregando cadastro…</p>
          </section>
        ) : (
          <form className="registry-form-card" onSubmit={submit}>
            {error ? (
              <div className="registry-error" role="alert">
                {error}
              </div>
            ) : null}

            {sections.map((section) => (
              <fieldset className="registry-fieldset" key={section.title}>
                <legend>{section.title}</legend>
                <div className="registry-form-grid">
                  {section.fields.map((field) => (
                    <label
                      className={
                        field.span === 2 ? "registry-field--wide" : undefined
                      }
                      key={field.name}
                    >
                      <span>
                        {field.label}
                        {field.required ? <em>*</em> : null}
                      </span>
                      <input
                        name={field.name}
                        type={field.type ?? "text"}
                        placeholder={field.placeholder}
                        required={field.required}
                        maxLength={field.maxLength}
                        value={values[field.name] ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            <footer className="registry-form-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => router.push(config.route)}
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={saving}
              >
                {saving ? <span className="spinner" /> : null}
                {saving ? "Salvando…" : "Salvar cadastro"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </AppShell>
  );
}
