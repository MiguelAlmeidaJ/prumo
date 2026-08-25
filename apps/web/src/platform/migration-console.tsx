"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/auth/auth-context";
import { ActionMenu } from "@/components/action-menu";

type EntityType =
  | "UNITS"
  | "INSTRUCTORS"
  | "STUDENTS"
  | "ENROLLMENTS"
  | "FINANCIAL"
  | "LESSONS"
  | "EXAMS"
  | "DOCUMENTS";

type ConflictPolicy = "ERROR" | "SKIP" | "UPDATE" | "LINK";
type CatalogField = { key: string; label: string; required?: boolean };
type CatalogItem = {
  entityType: EntityType;
  executable: boolean;
  blockedReason?: string | null;
  fields: CatalogField[];
};
type Mapping = {
  sourceColumn: string;
  targetField: string;
  conflictPolicy: ConflictPolicy;
};
type ImportFile = {
  id: string;
  entityType: EntityType;
  fileName: string;
  rowCount: number;
  headers: string[];
  sampleRows: Array<Record<string, string>>;
  mappings: Mapping[];
};
type Issue = {
  id: string;
  severity: "WARNING" | "ERROR";
  entityType: EntityType;
  rowNumber?: number;
  field?: string;
  code: string;
  message: string;
};
type ImportJob = {
  id: string;
  tenantId: string;
  sourceSystem: string;
  description?: string | null;
  migrationType: string;
  cutoverDate: string;
  status: string;
  totalRecords: number;
  successfulRecords: number;
  warningRecords: number;
  failedRecords: number;
  validationSummary?: Record<string, number | string> | null;
  preview?: Record<string, number | string | boolean> | null;
  progress?: { phase?: string; processed?: number; total?: number } | null;
  tenant: { id: string; name: string; slug: string };
  createdBy: { id: string; name: string; email: string };
  files?: ImportFile[];
  issues?: Issue[];
  _count?: { files?: number; issues?: number; legacyMaps?: number };
  createdAt: string;
};
type Tenant = { id: string; name: string; slug: string };

const ENTITY_LABELS: Record<EntityType, string> = {
  UNITS: "Unidades",
  INSTRUCTORS: "Instrutores",
  STUDENTS: "Alunos",
  ENROLLMENTS: "Matrículas",
  FINANCIAL: "Financeiro",
  LESSONS: "Aulas",
  EXAMS: "Exames",
  DOCUMENTS: "Documentos",
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: "Criada",
  UPLOADED: "Arquivos enviados",
  MAPPING: "Mapeamento",
  VALIDATING: "Validando",
  READY: "Pronta",
  IMPORTING: "Importando",
  COMPLETED: "Concluída",
  COMPLETED_WITH_ERRORS: "Concluída com erros",
  FAILED: "Falhou",
  ROLLED_BACK: "Rollback concluído",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function downloadBase64(payload: {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}) {
  const bytes = Uint8Array.from(atob(payload.contentBase64), (char) =>
    char.charCodeAt(0),
  );
  const url = URL.createObjectURL(
    new Blob([bytes], { type: payload.mimeType }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeColumn(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function suggestTarget(header: string, fields: CatalogField[]): string {
  const normalized = normalizeColumn(header);
  const aliases: Record<string, string> = {
    id: "legacyId",
    codigo: "legacyId",
    codigoaluno: "legacyId",
    idaluno: "legacyId",
    nomealuno: "name",
    nomeinstrutor: "name",
    dtnasc: "birthDate",
    datanascimento: "birthDate",
    celular: "phone",
    telefone2: "secondaryPhone",
    cnpj: "document",
  };
  const alias = aliases[normalized];
  if (alias && fields.some((field) => field.key === alias)) return alias;
  return (
    fields.find((field) => normalizeColumn(field.key) === normalized)?.key ?? ""
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`migration-status migration-status--${status.toLowerCase()}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function MigrationList() {
  const { request, session } = useAuth();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const allowed = session?.platform?.permissions.includes(
    "system.migrations.read",
  );

  useEffect(() => {
    if (!allowed) return;
    void request<ImportJob[]>("/platform/migrations")
      .then(setJobs)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao carregar migrações.",
        ),
      );
  }, [allowed, request]);

  if (!allowed)
    return (
      <section className="platform-page">
        <div className="platform-error">Acesso exclusivo de System Admin.</div>
      </section>
    );
  return (
    <section className="platform-page">
      <header className="platform-page-title">
        <div>
          <span>Onboarding seguro</span>
          <h1>Central de Migração</h1>
          <p>
            Importações rastreáveis, idempotentes e isoladas por autoescola.
          </p>
        </div>
        {session?.platform?.permissions.includes("system.migrations.create") ? (
          <Link className="platform-primary" href="/platform/migrations/new">
            Nova migração
          </Link>
        ) : null}
      </header>
      {error ? <div className="platform-error">{error}</div> : null}
      <div className="platform-table-wrap">
        <table className="platform-table">
          <thead>
            <tr>
              <th>Autoescola</th>
              <th>Sistema de origem</th>
              <th>Status</th>
              <th>Registros</th>
              <th>Criado por</th>
              <th>Data</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.tenant.name}</td>
                <td>{job.sourceSystem}</td>
                <td>
                  <StatusBadge status={job.status} />
                </td>
                <td>
                  {job.successfulRecords} / {job.totalRecords}
                </td>
                <td>{job.createdBy.name}</td>
                <td>{new Date(job.createdAt).toLocaleString("pt-BR")}</td>
                <td>
                  <ActionMenu label={`Ações da migração de ${job.tenant.name}`}>
                    <Link href={`/platform/migrations/${job.id}`}>
                      Abrir detalhes
                    </Link>
                  </ActionMenu>
                </td>
              </tr>
            ))}
            {!jobs.length && !error ? (
              <tr>
                <td colSpan={7}>Nenhuma migração criada.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function MigrationCreate() {
  const { request, session } = useAuth();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const allowed = session?.platform?.permissions.includes(
    "system.migrations.create",
  );

  useEffect(() => {
    if (!allowed) return;
    void request<{ data: Tenant[] }>("/platform/tenants?pageSize=100")
      .then((result) => setTenants(result.data))
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao listar autoescolas.",
        ),
      );
  }, [allowed, request]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const job = await request<ImportJob>("/platform/migrations", {
        method: "POST",
        body: JSON.stringify({
          tenantId: data.get("tenantId"),
          sourceSystem: data.get("sourceSystem"),
          description: data.get("description") || undefined,
          migrationType: data.get("migrationType"),
          cutoverDate: new Date(String(data.get("cutoverDate"))).toISOString(),
        }),
      });
      router.push(`/platform/migrations/${job.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Falha ao criar migração.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!allowed)
    return (
      <section className="platform-page">
        <div className="platform-error">
          Permissão para criar migração não concedida.
        </div>
      </section>
    );
  return (
    <section className="platform-page">
      <header className="platform-page-title">
        <div>
          <span>Etapa 1 de 8</span>
          <h1>Nova migração</h1>
          <p>
            Confirme cuidadosamente a autoescola de destino e a data de corte.
          </p>
        </div>
      </header>
      <form className="platform-form platform-card" onSubmit={submit}>
        <label>
          Autoescola de destino
          <select name="tenantId" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} · {tenant.slug}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sistema de origem
          <input
            name="sourceSystem"
            required
            maxLength={120}
            placeholder="Sistema XPTO"
          />
        </label>
        <label>
          Tipo de migração
          <select name="migrationType" defaultValue="FULL">
            <option value="FULL">Completa</option>
            <option value="PARTIAL">Parcial</option>
            <option value="OPENING_BALANCE">Posição de abertura</option>
          </select>
        </label>
        <label>
          Data de corte
          <input name="cutoverDate" type="datetime-local" required />
        </label>
        <label className="migration-wide">
          Descrição
          <textarea
            name="description"
            maxLength={1000}
            placeholder="Sistema XPTO → Prumo, posição até..."
          />
        </label>
        <button className="platform-primary" disabled={saving}>
          {saving ? "Criando…" : "Criar e enviar arquivos"}
        </button>
        {error ? (
          <p className="platform-error migration-wide">{error}</p>
        ) : null}
      </form>
    </section>
  );
}

function FileMappingEditor({
  jobId,
  file,
  catalog,
  onSaved,
}: {
  jobId: string;
  file: ImportFile;
  catalog: CatalogItem;
  onSaved: () => Promise<void>;
}) {
  const { request } = useAuth();
  const [policy, setPolicy] = useState<ConflictPolicy>(
    file.mappings[0]?.conflictPolicy ?? "ERROR",
  );
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      file.headers.map((header) => [
        header,
        file.mappings.find((mapping) => mapping.sourceColumn === header)
          ?.targetField ?? suggestTarget(header, catalog.fields),
      ]),
    ),
  );
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setMessage(null);
    try {
      await request(`/platform/migrations/${jobId}/files/${file.id}/mapping`, {
        method: "PUT",
        body: JSON.stringify({
          conflictPolicy: policy,
          mappings: Object.entries(targets)
            .filter(([, targetField]) => targetField)
            .map(([sourceColumn, targetField]) => ({
              sourceColumn,
              targetField,
            })),
        }),
      });
      setMessage("Mapeamento salvo.");
      await onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Falha ao salvar.");
    }
  }

  return (
    <article className="platform-card migration-file-card">
      <header>
        <div>
          <strong>{file.fileName}</strong>
          <small>
            {ENTITY_LABELS[file.entityType]} ·{" "}
            {file.rowCount.toLocaleString("pt-BR")} registros
          </small>
        </div>
        <StatusBadge status={file.mappings.length ? "READY" : "MAPPING"} />
      </header>
      <label>
        Política de conflito
        <select
          value={policy}
          onChange={(event) => setPolicy(event.target.value as ConflictPolicy)}
        >
          <option value="ERROR">Bloquear e exigir decisão</option>
          <option value="SKIP">Ignorar existente</option>
          <option value="UPDATE">Atualizar existente</option>
          <option value="LINK">Associar sem alterar</option>
        </select>
      </label>
      <div className="migration-mapping-grid">
        {file.headers.map((header) => (
          <label key={header}>
            <span>{header}</span>
            <select
              value={targets[header] ?? ""}
              onChange={(event) =>
                setTargets((current) => ({
                  ...current,
                  [header]: event.target.value,
                }))
              }
            >
              <option value="">Não importar</option>
              {catalog.fields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                  {field.required ? " *" : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        className="platform-primary"
        type="button"
        onClick={() => void save()}
      >
        Salvar mapeamento
      </button>
      {message ? <p>{message}</p> : null}
    </article>
  );
}

export function MigrationDetail({ id }: { id: string }) {
  const { request, session } = useAuth();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [entityType, setEntityType] = useState<EntityType>("STUDENTS");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = session?.platform?.permissions.includes(
    "system.migrations.read",
  );
  const load = useCallback(async () => {
    const [jobResult, catalogResult] = await Promise.all([
      request<ImportJob>(`/platform/migrations/${id}`),
      request<CatalogItem[]>("/platform/migrations/catalog"),
    ]);
    setJob(jobResult);
    setCatalog(catalogResult);
    setError(null);
  }, [id, request]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void Promise.all([
      request<ImportJob>(`/platform/migrations/${id}`),
      request<CatalogItem[]>("/platform/migrations/catalog"),
    ])
      .then(([jobResult, catalogResult]) => {
        if (!active) return;
        setJob(jobResult);
        setCatalog(catalogResult);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Falha ao carregar migração.",
          );
      });
    return () => {
      active = false;
    };
  }, [allowed, id, request]);
  useEffect(() => {
    if (job?.status !== "IMPORTING" && job?.status !== "VALIDATING") return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [job?.status, load]);

  const step = useMemo(() => {
    if (!job) return 1;
    if (
      ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "ROLLED_BACK"].includes(
        job.status,
      )
    )
      return 8;
    if (job.status === "IMPORTING") return 7;
    if (job.status === "READY") return 6;
    if (job.validationSummary) return 5;
    if (job.files?.some((file) => file.mappings.length)) return 4;
    if (job.files?.length) return 3;
    return 2;
  }, [job]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem(
      "file",
    ) as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/platform/migrations/${id}/files`, {
        method: "POST",
        body: JSON.stringify({
          entityType,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: await fileToBase64(file),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha no upload.");
    } finally {
      setBusy(false);
    }
  }

  async function action(name: "validate" | "execute") {
    setBusy(true);
    setError(null);
    try {
      await request(`/platform/migrations/${id}/${name}`, { method: "POST" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }
  async function rollback() {
    const reason = window.prompt("Motivo obrigatório do rollback:");
    if (!reason) return;
    const confirmation = window.prompt("Digite ROLLBACK para confirmar:");
    if (confirmation !== "ROLLBACK") return;
    setBusy(true);
    try {
      await request(`/platform/migrations/${id}/rollback`, {
        method: "POST",
        body: JSON.stringify({ reason, confirmation }),
      });
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Rollback bloqueado.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download(path: string) {
    const payload = await request<{
      fileName: string;
      mimeType: string;
      contentBase64: string;
    }>(path);
    downloadBase64(payload);
  }

  if (!allowed)
    return (
      <section className="platform-page">
        <div className="platform-error">Acesso exclusivo de System Admin.</div>
      </section>
    );
  if (!job)
    return (
      <section className="platform-page">
        {error ? (
          <div className="platform-error">{error}</div>
        ) : (
          <div className="platform-card">Carregando…</div>
        )}
      </section>
    );
  return (
    <section className="platform-page">
      <header className="platform-page-title">
        <div>
          <span>{job.tenant.name}</span>
          <h1>{job.sourceSystem} → Prumo</h1>
          <p>
            Corte em {new Date(job.cutoverDate).toLocaleString("pt-BR")} ·{" "}
            {job.migrationType}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </header>
      <ol className="migration-steps">
        {[
          "Autoescola",
          "Origem",
          "Arquivos",
          "Mapeamento",
          "Validação",
          "Prévia",
          "Importação",
          "Relatório",
        ].map((label, index) => (
          <li className={index + 1 <= step ? "active" : ""} key={label}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {error ? <div className="platform-error">{error}</div> : null}
      <section className="migration-summary platform-card">
        <div>
          <small>Destino</small>
          <strong>{job.tenant.name}</strong>
          <span>{job.tenant.id}</span>
        </div>
        <div>
          <small>Status</small>
          <strong>{STATUS_LABELS[job.status] ?? job.status}</strong>
          <span>{job.progress?.phase ?? "Aguardando"}</span>
        </div>
        <div>
          <small>Registros</small>
          <strong>{job.totalRecords.toLocaleString("pt-BR")}</strong>
          <span>
            {job.successfulRecords} processados · {job.failedRecords} falhas
          </span>
        </div>
        <div>
          <small>Isolamento</small>
          <strong>Tenant exclusivo</strong>
          <span>0 impacto em outros tenants</span>
        </div>
      </section>
      {![
        "IMPORTING",
        "COMPLETED",
        "COMPLETED_WITH_ERRORS",
        "ROLLED_BACK",
      ].includes(job.status) ? (
        <form className="platform-card migration-upload" onSubmit={upload}>
          <h2>Enviar arquivo</h2>
          <select
            value={entityType}
            onChange={(event) =>
              setEntityType(event.target.value as EntityType)
            }
          >
            {catalog.map((item) => (
              <option key={item.entityType} value={item.entityType}>
                {ENTITY_LABELS[item.entityType]}
                {item.executable ? "" : " (validação apenas)"}
              </option>
            ))}
          </select>
          <input
            name="file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
          />
          <button className="platform-primary" disabled={busy}>
            {busy ? "Enviando…" : "Enviar"}
          </button>
          <button
            type="button"
            onClick={() =>
              void download(`/platform/migrations/templates/${entityType}`)
            }
          >
            Baixar modelo Prumo
          </button>
          {catalog.find((item) => item.entityType === entityType)
            ?.blockedReason ? (
            <p>
              {
                catalog.find((item) => item.entityType === entityType)
                  ?.blockedReason
              }
            </p>
          ) : null}
        </form>
      ) : null}
      <div className="migration-files">
        {job.files?.map((file) => {
          const definition = catalog.find(
            (item) => item.entityType === file.entityType,
          );
          return definition ? (
            <FileMappingEditor
              key={file.id}
              jobId={job.id}
              file={file}
              catalog={definition}
              onSaved={load}
            />
          ) : null;
        })}
      </div>
      <div className="platform-actions migration-actions">
        {session?.platform?.permissions.includes(
          "system.migrations.validate",
        ) &&
        ![
          "IMPORTING",
          "COMPLETED",
          "COMPLETED_WITH_ERRORS",
          "ROLLED_BACK",
        ].includes(job.status) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void action("validate")}
          >
            Executar dry-run
          </button>
        ) : null}
        {session?.platform?.permissions.includes("system.migrations.execute") &&
        job.status === "READY" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void action("execute")}
          >
            Confirmar e importar
          </button>
        ) : null}
        {(job._count?.issues ?? 0) > 0 ? (
          <button
            type="button"
            onClick={() =>
              void download(`/platform/migrations/${id}/errors.csv`)
            }
          >
            Baixar CSV de erros
          </button>
        ) : null}
        {session?.platform?.permissions.includes(
          "system.migrations.rollback",
        ) && ["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(job.status) ? (
          <button
            className="migration-danger"
            type="button"
            onClick={() => void rollback()}
          >
            Rollback controlado
          </button>
        ) : null}
      </div>
      {job.preview ? (
        <article className="platform-card">
          <h2>Prévia antes da importação</h2>
          <div className="migration-preview">
            {Object.entries(job.preview).map(([key, value]) => (
              <div key={key}>
                <small>{key}</small>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </div>
        </article>
      ) : null}
      {job.issues?.length ? (
        <article className="platform-card">
          <h2>Validação e rejeições</h2>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Entidade</th>
                  <th>Linha</th>
                  <th>Campo</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {job.issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>{issue.severity}</td>
                    <td>{ENTITY_LABELS[issue.entityType]}</td>
                    <td>{issue.rowNumber ?? "—"}</td>
                    <td>{issue.field ?? "—"}</td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
