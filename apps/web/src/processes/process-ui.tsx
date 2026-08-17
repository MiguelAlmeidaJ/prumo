"use client";

import type { PaginatedResponse } from "@prumo/contracts";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useAuth } from "@/auth/auth-context";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/auth-api";

type Lookup = { id: string; name: string };
type Category = Lookup & { code: string; description?: string | null };
type Stage = {
  id: string;
  type: string;
  status: string;
  order: number;
  required: boolean;
  blockedReason?: string | null;
  dependencies: Array<{ dependsOn: Pick<Stage, "id" | "type" | "status"> }>;
};
type DocumentRequirement = {
  id: string;
  documentType: string;
  required: boolean;
  status: string;
  studentDocumentId?: string | null;
  rejectionReason?: string | null;
  studentDocument?: {
    id: string;
    type: string;
    number?: string | null;
    fileName?: string | null;
    fileMimeType?: string | null;
  } | null;
};
type Exam = {
  id: string;
  processId: string;
  type: string;
  status: string;
  result: string;
  scheduledAt: string;
  attemptNumber: number;
  score?: number | null;
  location?: string | null;
  externalProtocol?: string | null;
  cancellationReason?: string | null;
  student: Lookup & { cpf?: string };
  unit: Lookup;
  process: {
    id: string;
    processType: string;
    status: string;
    categories?: Array<{ category: Category }>;
  };
};
type Process = {
  id: string;
  studentId: string;
  unitId: string;
  processType: string;
  status: string;
  protocolNumber?: string | null;
  openedAt: string;
  expiresAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  student: Lookup & { cpf: string };
  unit: Lookup;
  categories: Array<{ category: Category }>;
  stages: Stage[];
  documents: DocumentRequirement[];
  exams: Exam[];
  practicalLessons: Array<{
    id: string;
    status: string;
    startsAt: string;
    endsAt: string;
  }>;
  theoreticalClasses: Array<{
    id: string;
    attendanceStatus: string;
    theoreticalClass: {
      id: string;
      title: string;
      status: string;
      startsAt: string;
      endsAt: string;
    };
  }>;
  _count?: { stages: number; exams: number; documents: number };
};
type Progress = {
  theoretical: {
    completedLessons: number;
    minutes: number;
    hours: number;
    requiredMinutes: number;
    remainingLessons: number;
  };
  practical: {
    completedLessons: number;
    minutes: number;
    hours: number;
    requiredMinutes: number;
    remainingLessons: number;
  };
  absences: number;
  cancellations: number;
  documents: { total: number; approved: number; pending: number };
};
type Audit = {
  id: string;
  entityType: string;
  action: string;
  createdAt: string;
  actor: Lookup;
};
type StudentDocument = {
  id: string;
  type: string;
  number?: string | null;
};

const processTypes = [
  "FIRST_LICENSE",
  "CATEGORY_ADDITION",
  "CATEGORY_CHANGE",
  "RENEWAL",
  "REHABILITATION",
  "REFRESHER",
] as const;
const examTypes = [
  "MEDICAL",
  "PSYCHOLOGICAL",
  "THEORETICAL",
  "PRACTICAL",
] as const;

const labels: Record<string, string> = {
  FIRST_LICENSE: "Primeira habilitação",
  CATEGORY_ADDITION: "Adição de categoria",
  CATEGORY_CHANGE: "Mudança de categoria",
  RENEWAL: "Renovação",
  REHABILITATION: "Reabilitação",
  REFRESHER: "Reciclagem",
  DRAFT: "Rascunho",
  PENDING_DOCUMENTS: "Documentos pendentes",
  IN_PROGRESS: "Em andamento",
  SUSPENDED: "Suspenso",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  EXPIRED: "Expirado",
  REGISTRATION: "Cadastro",
  DOCUMENT_REVIEW: "Análise documental",
  MEDICAL_EXAM: "Exame médico",
  PSYCHOLOGICAL_EXAM: "Exame psicológico",
  THEORETICAL_COURSE: "Curso teórico",
  THEORETICAL_EXAM: "Exame teórico",
  PRACTICAL_CLASSES: "Aulas práticas",
  PRACTICAL_EXAM: "Exame prático",
  LICENSE_ISSUANCE: "Emissão da habilitação",
  PENDING: "Pendente",
  AVAILABLE: "Disponível",
  FAILED: "Reprovado",
  BLOCKED: "Bloqueado",
  WAIVED: "Dispensado",
  APPROVED: "Aprovado",
  ABSENT: "Ausente",
  INCONCLUSIVE: "Inconclusivo",
  REQUESTED: "Solicitado",
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  NO_SHOW: "Ausência",
  RESCHEDULED: "Reagendado",
  UNDER_REVIEW: "Em análise",
  SUBMITTED: "Enviado",
  REJECTED: "Rejeitado",
  MEDICAL: "Médico",
  PSYCHOLOGICAL: "Psicológico",
  THEORETICAL: "Teórico",
  PRACTICAL: "Prático",
};

function label(value: string) {
  return labels[value] ?? value.replaceAll("_", " ").toLowerCase();
}

function message(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Não foi possível concluir a operação.";
}

function date(value?: string | null, time = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: time ? "short" : undefined,
  }).format(new Date(value));
}

function localInput(value?: string | null) {
  if (!value) return "";
  const current = new Date(value);
  return new Date(current.getTime() - current.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function Badge({ value }: { value: string }) {
  const positive = ["ACTIVE", "APPROVED", "COMPLETED", "CONFIRMED"].includes(
    value,
  );
  return (
    <span
      className={`status-badge status-badge--${positive ? "active" : "inactive"}`}
    >
      {label(value)}
    </span>
  );
}

function Header({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="registry-title-row">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="schedule-create">{actions}</div> : null}
    </header>
  );
}

export function StudentProcessList() {
  const { id: studentId } = useParams<{ id: string }>();
  const { request } = useAuth();
  const [items, setItems] = useState<Process[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await request<Process[]>(`/students/${studentId}/processes`));
      setError(null);
    } catch (loadError) {
      setError(message(loadError));
    }
  }, [request, studentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <AppShell>
      <div className="registry-content">
        <Header
          eyebrow="Jornada do aluno"
          title="Processos de habilitação"
          description="Etapas, documentos, aulas e exames vinculados ao aluno."
          actions={
            <>
              <Link className="button button--ghost" href="/students">
                Voltar
              </Link>
              <Link
                className="button button--primary"
                href={`/students/${studentId}/processes/new`}
              >
                Abrir processo
              </Link>
            </>
          }
        />
        {error ? <div className="registry-error">{error}</div> : null}
        <section className="registry-panel">
          {items.length ? (
            <div className="process-list">
              {items.map((item) => (
                <Link
                  className="process-list__item"
                  href={`/processes/${item.id}`}
                  key={item.id}
                >
                  <div>
                    <strong>{label(item.processType)}</strong>
                    <span>
                      {item.categories
                        .map(({ category }) => category.code)
                        .join(" + ")}{" "}
                      · {item.unit.name}
                    </span>
                  </div>
                  <span>
                    {item.protocolNumber || `Aberto em ${date(item.openedAt)}`}
                  </span>
                  <Badge value={item.status} />
                  <span>
                    {item._count?.stages ?? 0} etapas ·{" "}
                    {item._count?.exams ?? 0} exames
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="registry-state">
              <span className="registry-empty-icon">P</span>
              <h2>Nenhum processo aberto</h2>
              <p>Abra a jornada de habilitação deste aluno.</p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

export function ProcessForm() {
  const { id: studentId } = useParams<{ id: string }>();
  const { request } = useAuth();
  const router = useRouter();
  const [units, setUnits] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [values, setValues] = useState({
    unitId: "",
    processType: "FIRST_LICENSE",
    categoryCodes: ["B"],
    protocolNumber: "",
    openedAt: localInput(new Date().toISOString()),
    expiresAt: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      request<PaginatedResponse<Lookup>>("/units?pageSize=100&active=true"),
      request<Category[]>("/license-categories"),
    ])
      .then(([unitResponse, categoryResponse]) => {
        setUnits(unitResponse.data);
        setCategories(categoryResponse);
        setValues((current) => ({
          ...current,
          unitId: current.unitId || unitResponse.data[0]?.id || "",
        }));
      })
      .catch((loadError) => setError(message(loadError)));
  }, [request]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await request<Process>(
        `/students/${studentId}/processes`,
        {
          method: "POST",
          body: JSON.stringify({
            ...values,
            protocolNumber: values.protocolNumber || undefined,
            openedAt: values.openedAt
              ? new Date(values.openedAt).toISOString()
              : undefined,
            expiresAt: values.expiresAt
              ? new Date(values.expiresAt).toISOString()
              : undefined,
            notes: values.notes || undefined,
          }),
        },
      );
      router.push(`/processes/${created.id}`);
    } catch (submitError) {
      setError(message(submitError));
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="registry-content registry-content--form">
        <Header
          eyebrow="Nova jornada"
          title="Abrir processo"
          description="A estrutura de etapas será criada automaticamente."
        />
        <form className="registry-form-card" onSubmit={submit}>
          {error ? <div className="registry-error">{error}</div> : null}
          <fieldset className="registry-fieldset">
            <legend>Configuração do processo</legend>
            <div className="registry-form-grid">
              <label>
                <span>Tipo</span>
                <select
                  value={values.processType}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      processType: event.target.value,
                    }))
                  }
                >
                  {processTypes.map((type) => (
                    <option value={type} key={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </label>
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
                  <option value="">Selecione</option>
                  {units.map((unit) => (
                    <option value={unit.id} key={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="registry-field--wide">
                <span>Categorias</span>
                <div className="category-picker">
                  {categories.map((category) => (
                    <label key={category.id}>
                      <input
                        type="checkbox"
                        checked={values.categoryCodes.includes(category.code)}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            categoryCodes: event.target.checked
                              ? [...current.categoryCodes, category.code]
                              : current.categoryCodes.filter(
                                  (code) => code !== category.code,
                                ),
                          }))
                        }
                      />
                      <strong>{category.code}</strong>
                      <span>{category.name}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label>
                <span>Protocolo</span>
                <input
                  value={values.protocolNumber}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      protocolNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Abertura</span>
                <input
                  type="datetime-local"
                  value={values.openedAt}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      openedAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Validade</span>
                <input
                  type="datetime-local"
                  value={values.expiresAt}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      expiresAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="registry-field--wide">
                <span>Observações</span>
                <textarea
                  value={values.notes}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </fieldset>
          <div className="registry-form-actions">
            <Link
              className="button button--ghost"
              href={`/students/${studentId}/processes`}
            >
              Cancelar
            </Link>
            <button
              className="button button--primary"
              disabled={saving || !values.categoryCodes.length}
              type="submit"
            >
              {saving ? "Abrindo…" : "Abrir processo"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

function ProcessTabs({ process }: { process: Process }) {
  return (
    <nav className="process-tabs">
      <Link href={`/processes/${process.id}`}>Visão geral</Link>
      <Link href={`/processes/${process.id}/documents`}>Documentos</Link>
      <Link href={`/processes/${process.id}/exams`}>Exames</Link>
      <Link href={`/students/${process.studentId}/processes`}>
        Outros processos
      </Link>
    </nav>
  );
}

function useProcess(id: string) {
  const { request } = useAuth();
  const [process, setProcess] = useState<Process | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setProcess(await request<Process>(`/processes/${id}`));
      setError(null);
    } catch (loadError) {
      setError(message(loadError));
    }
  }, [id, request]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return { process, error, load, request };
}

export function ProcessDetail() {
  const { id } = useParams<{ id: string }>();
  const { process, error, load, request } = useProcess(id);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [timeline, setTimeline] = useState<Audit[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      request<Progress>(`/processes/${id}/progress`),
      request<Audit[]>(`/processes/${id}/timeline`),
    ])
      .then(([nextProgress, nextTimeline]) => {
        setProgress(nextProgress);
        setTimeline(nextTimeline);
      })
      .catch(() => undefined);
  }, [id, request, process]);

  async function action(name: string, needsReason = false) {
    const reason = needsReason
      ? window.prompt("Informe o motivo desta ação:")
      : undefined;
    if (needsReason && !reason) return;
    setBusy(true);
    try {
      await request(`/processes/${id}/${name}`, {
        method: "POST",
        body: needsReason ? JSON.stringify({ reason }) : undefined,
      });
      await load();
      setActionError(null);
    } catch (requestError) {
      setActionError(message(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (!process) {
    return (
      <AppShell>
        <div className="registry-content">
          {error ? (
            <div className="registry-error">{error}</div>
          ) : (
            <div className="registry-state">Carregando processo…</div>
          )}
        </div>
      </AppShell>
    );
  }

  const pendingStages = process.stages.filter(
    (stage) =>
      stage.required && !["COMPLETED", "WAIVED"].includes(stage.status),
  );
  const pendingDocuments = process.documents.filter(
    (document) =>
      document.required && !["APPROVED", "WAIVED"].includes(document.status),
  );

  return (
    <AppShell>
      <div className="registry-content">
        <Header
          eyebrow={process.student.name}
          title={label(process.processType)}
          description={`${process.protocolNumber || "Sem protocolo"} · ${process.unit.name}`}
          actions={
            <>
              {process.status === "DRAFT" ? (
                <button
                  className="button button--primary"
                  disabled={busy}
                  onClick={() => void action("start")}
                >
                  Iniciar
                </button>
              ) : null}
              {["PENDING_DOCUMENTS", "IN_PROGRESS"].includes(process.status) ? (
                <button
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() => void action("suspend", true)}
                >
                  Suspender
                </button>
              ) : null}
              {process.status === "SUSPENDED" ? (
                <button
                  className="button button--primary"
                  disabled={busy}
                  onClick={() => void action("resume")}
                >
                  Retomar
                </button>
              ) : null}
              {["PENDING_DOCUMENTS", "IN_PROGRESS"].includes(process.status) ? (
                <>
                  <button
                    className="button button--primary"
                    disabled={busy}
                    onClick={() => void action("complete")}
                  >
                    Concluir
                  </button>
                  <button
                    className="button button--danger"
                    disabled={busy}
                    onClick={() => void action("cancel", true)}
                  >
                    Cancelar
                  </button>
                </>
              ) : null}
            </>
          }
        />
        <ProcessTabs process={process} />
        {actionError ? (
          <div className="registry-error">{actionError}</div>
        ) : null}
        <section className="process-summary-grid">
          <article className="process-card process-card--hero">
            <span>Status</span>
            <Badge value={process.status} />
            <strong>
              {process.categories
                .map(({ category }) => category.code)
                .join(" + ")}
            </strong>
            <small>
              Abertura {date(process.openedAt)} · validade{" "}
              {date(process.expiresAt)}
            </small>
          </article>
          <article className="process-card">
            <span>Teórico</span>
            <strong>{progress?.theoretical.hours.toFixed(1) ?? "0"}h</strong>
            <small>
              {progress?.theoretical.completedLessons ?? 0} aulas ·{" "}
              {progress?.theoretical.remainingLessons ?? 0} restantes
            </small>
          </article>
          <article className="process-card">
            <span>Prático</span>
            <strong>{progress?.practical.hours.toFixed(1) ?? "0"}h</strong>
            <small>
              {progress?.practical.completedLessons ?? 0} aulas ·{" "}
              {progress?.practical.remainingLessons ?? 0} restantes
            </small>
          </article>
          <article className="process-card">
            <span>Documentos</span>
            <strong>
              {progress?.documents.approved ?? 0}/
              {progress?.documents.total ?? 0}
            </strong>
            <small>
              {progress?.documents.pending ?? 0} pendentes ·{" "}
              {progress?.absences ?? 0} faltas
            </small>
          </article>
        </section>
        <div className="process-columns">
          <section className="process-card">
            <div className="process-card__header">
              <div>
                <span>Fluxo</span>
                <h2>Etapas</h2>
              </div>
              <span>{process.stages.length}</span>
            </div>
            <ol className="stage-list">
              {process.stages.map((stage) => (
                <li key={stage.id}>
                  <span className="stage-order">{stage.order}</span>
                  <div>
                    <strong>{label(stage.type)}</strong>
                    <small>
                      {stage.blockedReason ||
                        (stage.dependencies.length
                          ? `Depende de ${stage.dependencies
                              .map(({ dependsOn }) => label(dependsOn.type))
                              .join(", ")}`
                          : stage.required
                            ? "Obrigatória"
                            : "Opcional")}
                    </small>
                  </div>
                  <Badge value={stage.status} />
                </li>
              ))}
            </ol>
          </section>
          <section className="process-card">
            <div className="process-card__header">
              <div>
                <span>Atenção</span>
                <h2>Pendências</h2>
              </div>
            </div>
            <div className="pending-list">
              {pendingDocuments.map((document) => (
                <Link href={`/processes/${id}/documents`} key={document.id}>
                  Documento · {label(document.documentType)}
                </Link>
              ))}
              {pendingStages.map((stage) => (
                <span key={stage.id}>Etapa · {label(stage.type)}</span>
              ))}
              {!pendingDocuments.length && !pendingStages.length ? (
                <span>Nenhuma pendência obrigatória.</span>
              ) : null}
            </div>
          </section>
        </div>
        <section className="process-card">
          <div className="process-card__header">
            <div>
              <span>Histórico acadêmico</span>
              <h2>Aulas vinculadas</h2>
            </div>
          </div>
          <div className="lesson-history">
            {process.theoreticalClasses.map((entry) => (
              <Link
                href={`/theoretical-classes/${entry.theoreticalClass.id}`}
                key={entry.id}
              >
                <strong>{entry.theoreticalClass.title}</strong>
                <span>{date(entry.theoreticalClass.startsAt, true)}</span>
                <Badge value={entry.attendanceStatus} />
              </Link>
            ))}
            {process.practicalLessons.map((lesson) => (
              <Link href={`/practical-lessons/${lesson.id}`} key={lesson.id}>
                <strong>Aula prática</strong>
                <span>{date(lesson.startsAt, true)}</span>
                <Badge value={lesson.status} />
              </Link>
            ))}
            {!process.theoreticalClasses.length &&
            !process.practicalLessons.length ? (
              <span>Nenhuma aula vinculada ao processo.</span>
            ) : null}
          </div>
        </section>
        <section className="process-card">
          <div className="process-card__header">
            <div>
              <span>Auditoria</span>
              <h2>Timeline</h2>
            </div>
          </div>
          <ol className="timeline">
            {timeline.map((entry) => (
              <li key={entry.id}>
                <span />
                <div>
                  <strong>{label(entry.action)}</strong>
                  <small>
                    {entry.actor.name} · {entry.entityType} ·{" "}
                    {date(entry.createdAt, true)}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}

export function ProcessDocuments() {
  const { id } = useParams<{ id: string }>();
  const { process, error, load, request } = useProcess(id);
  const { session } = useAuth();
  const [studentDocuments, setStudentDocuments] = useState<StudentDocument[]>(
    [],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!process) return;
    request<{ documents?: StudentDocument[] }>(`/students/${process.studentId}`)
      .then((student) => setStudentDocuments(student.documents ?? []))
      .catch(() => undefined);
  }, [process, request]);

  async function action(
    requirement: DocumentRequirement,
    name: string,
    body?: object,
  ) {
    try {
      await request(`/processes/${id}/documents/${requirement.id}/${name}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
      setActionError(null);
    } catch (requestError) {
      setActionError(message(requestError));
    }
  }

  async function upload(requirement: DocumentRequirement, file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setActionError("O arquivo deve ter no máximo 10 MB.");
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setActionError("Use um arquivo PDF, JPEG ou PNG.");
      return;
    }
    setUploadingId(requirement.id);
    setActionError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Não foi possível ler o arquivo."));
        reader.readAsDataURL(file);
      });
      await request(`/processes/${id}/documents/${requirement.id}/upload`, {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          contentBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
        }),
      });
      await load();
    } catch (uploadError) {
      setActionError(message(uploadError));
    } finally {
      setUploadingId(null);
    }
  }

  async function openFile(requirement: DocumentRequirement) {
    setOpeningId(requirement.id);
    setActionError(null);
    try {
      const file = await request<{
        fileName: string;
        mimeType: string;
        url: string;
        expiresAt: string;
      }>(`/processes/${id}/documents/${requirement.id}/file`);
      const anchor = document.createElement("a");
      anchor.href = file.url;
      anchor.download = file.fileName;
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch (fileError) {
      setActionError(message(fileError));
    } finally {
      setOpeningId(null);
    }
  }

  if (!process) {
    return (
      <AppShell>
        <div className="registry-content">
          <div className="registry-state">{error || "Carregando…"}</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="registry-content">
        <Header
          eyebrow={process.student.name}
          title="Documentos do processo"
          description="Vincule, envie e revise cada requisito documental."
        />
        <ProcessTabs process={process} />
        {actionError ? (
          <div className="registry-error">{actionError}</div>
        ) : null}
        <section className="document-grid">
          {process.documents.map((requirement) => {
            const compatible = studentDocuments.filter(
              (document) => document.type === requirement.documentType,
            );
            const canUpload =
              session?.activeMembership?.permissions.includes(
                "documents.review",
              ) ?? false;
            return (
              <article className="process-card" key={requirement.id}>
                <div className="process-card__header">
                  <div>
                    <span>
                      {requirement.required ? "Obrigatório" : "Opcional"}
                    </span>
                    <h2>{label(requirement.documentType)}</h2>
                  </div>
                  <Badge value={requirement.status} />
                </div>
                <p>
                  {requirement.studentDocument
                    ? `Documento ${requirement.studentDocument.number || "sem número"}`
                    : "Nenhum documento vinculado."}
                </p>
                {requirement.rejectionReason ? (
                  <p className="process-warning">
                    Motivo: {requirement.rejectionReason}
                  </p>
                ) : null}
                <div className="document-actions">
                  {canUpload &&
                  !["APPROVED", "WAIVED"].includes(requirement.status) ? (
                    <label className="document-upload-button">
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        disabled={uploadingId === requirement.id}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void upload(requirement, file);
                          event.target.value = "";
                        }}
                      />
                      {uploadingId === requirement.id
                        ? "Enviando…"
                        : requirement.studentDocument
                          ? "Substituir arquivo"
                          : "Enviar arquivo"}
                    </label>
                  ) : null}
                  {requirement.studentDocument?.fileName ? (
                    <button
                      type="button"
                      disabled={openingId === requirement.id}
                      onClick={() => void openFile(requirement)}
                    >
                      {openingId === requirement.id
                        ? "Preparando…"
                        : "Baixar arquivo"}
                    </button>
                  ) : null}
                  {!["APPROVED", "WAIVED"].includes(requirement.status) &&
                  compatible.length ? (
                    <select
                      aria-label={`Documento para ${requirement.documentType}`}
                      defaultValue=""
                      onChange={(event) => {
                        if (event.target.value) {
                          void action(requirement, "link", {
                            studentDocumentId: event.target.value,
                          });
                        }
                      }}
                    >
                      <option value="">Vincular documento…</option>
                      {compatible.map((document) => (
                        <option value={document.id} key={document.id}>
                          {document.number || document.type}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {requirement.status === "SUBMITTED" ? (
                    <button onClick={() => void action(requirement, "submit")}>
                      Enviar para análise
                    </button>
                  ) : null}
                  {requirement.status === "UNDER_REVIEW" ? (
                    <>
                      <button
                        className="button--success"
                        onClick={() => void action(requirement, "approve")}
                      >
                        Aprovar
                      </button>
                      <button
                        className="button--danger"
                        onClick={() => {
                          const reason = window.prompt("Motivo da rejeição:");
                          if (reason)
                            void action(requirement, "reject", { reason });
                        }}
                      >
                        Rejeitar
                      </button>
                    </>
                  ) : null}
                  {!requirement.required &&
                  !["APPROVED", "WAIVED"].includes(requirement.status) ? (
                    <button
                      onClick={() => {
                        const reason = window.prompt("Motivo da dispensa:");
                        if (reason)
                          void action(requirement, "waive", { reason });
                      }}
                    >
                      Dispensar
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}

export function ExamList({ processOnly = false }: { processOnly?: boolean }) {
  const params = useParams<{ id?: string }>();
  const processId = processOnly ? params.id : undefined;
  const { request } = useAuth();
  const [items, setItems] = useState<Exam[]>([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ type: "", result: "" });
  const [process, setProcess] = useState<Process | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "20",
    });
    if (processId) query.set("processId", processId);
    if (filters.type) query.set("type", filters.type);
    if (filters.result) query.set("result", filters.result);
    try {
      const response = await request<PaginatedResponse<Exam>>(
        `/exams?${query}`,
      );
      setItems(response.data);
      setMeta(response.meta);
      setError(null);
    } catch (loadError) {
      setError(message(loadError));
    }
  }, [filters, page, processId, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (processId) {
      void request<Process>(`/processes/${processId}`).then(setProcess);
    }
  }, [processId, request]);

  return (
    <AppShell>
      <div className="registry-content">
        <Header
          eyebrow={process ? process.student.name : "Avaliações"}
          title={processOnly ? "Exames do processo" : "Exames"}
          description="Tentativas preservadas com agenda, resultado e histórico."
          actions={
            <Link
              className="button button--primary"
              href={
                processId ? `/exams/new?processId=${processId}` : "/exams/new"
              }
            >
              Agendar exame
            </Link>
          }
        />
        {process ? <ProcessTabs process={process} /> : null}
        <section className="schedule-filters exam-filters">
          <label>
            <span>Tipo</span>
            <select
              value={filters.type}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
            >
              <option value="">Todos</option>
              {examTypes.map((type) => (
                <option value={type} key={type}>
                  {label(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Resultado</span>
            <select
              value={filters.result}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  result: event.target.value,
                }))
              }
            >
              <option value="">Todos</option>
              {["PENDING", "APPROVED", "FAILED", "ABSENT", "INCONCLUSIVE"].map(
                (result) => (
                  <option value={result} key={result}>
                    {label(result)}
                  </option>
                ),
              )}
            </select>
          </label>
        </section>
        {error ? <div className="registry-error">{error}</div> : null}
        <section className="registry-panel">
          <div className="exam-table">
            {items.map((exam) => (
              <Link href={`/exams/${exam.id}`} key={exam.id}>
                <div>
                  <strong>{label(exam.type)}</strong>
                  <span>Tentativa {exam.attemptNumber}</span>
                </div>
                <div>
                  <strong>{exam.student.name}</strong>
                  <span>{exam.unit.name}</span>
                </div>
                <span>{date(exam.scheduledAt, true)}</span>
                <Badge value={exam.status} />
                <Badge value={exam.result} />
              </Link>
            ))}
            {!items.length ? (
              <div className="registry-state">Nenhum exame encontrado.</div>
            ) : null}
          </div>
          {meta.totalPages > 1 ? (
            <div className="registry-pagination">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>
                Página {page} de {meta.totalPages}
              </span>
              <button
                disabled={page === meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

export function ExamForm() {
  const { request } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const initialProcessId = search.get("processId") ?? "";
  const [students, setStudents] = useState<Lookup[]>([]);
  const [units, setUnits] = useState<Lookup[]>([]);
  const [studentId, setStudentId] = useState("");
  const [processes, setProcesses] = useState<Process[]>([]);
  const [values, setValues] = useState({
    processId: initialProcessId,
    unitId: "",
    type: "MEDICAL",
    scheduledAt: "",
    location: "",
    externalProtocol: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      request<PaginatedResponse<Lookup>>(
        "/students?pageSize=100&status=ACTIVE",
      ),
      request<PaginatedResponse<Lookup>>("/units?pageSize=100&active=true"),
    ])
      .then(([studentResponse, unitResponse]) => {
        setStudents(studentResponse.data);
        setUnits(unitResponse.data);
        setValues((current) => ({
          ...current,
          unitId: current.unitId || unitResponse.data[0]?.id || "",
        }));
      })
      .catch((loadError) => setError(message(loadError)));
  }, [request]);

  useEffect(() => {
    if (initialProcessId) {
      void request<Process>(`/processes/${initialProcessId}`).then(
        (process) => {
          setStudentId(process.studentId);
          setProcesses([process]);
          setValues((current) => ({
            ...current,
            processId: process.id,
            unitId: process.unitId,
          }));
        },
      );
    }
  }, [initialProcessId, request]);

  useEffect(() => {
    if (!studentId || initialProcessId) return;
    void request<Process[]>(`/students/${studentId}/processes`).then((items) =>
      setProcesses(
        items.filter((item) =>
          ["PENDING_DOCUMENTS", "IN_PROGRESS"].includes(item.status),
        ),
      ),
    );
  }, [initialProcessId, request, studentId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const exam = await request<Exam>("/exams", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          scheduledAt: new Date(values.scheduledAt).toISOString(),
          location: values.location || undefined,
          externalProtocol: values.externalProtocol || undefined,
          notes: values.notes || undefined,
        }),
      });
      router.push(`/exams/${exam.id}`);
    } catch (submitError) {
      setError(message(submitError));
    }
  }

  return (
    <AppShell>
      <div className="registry-content registry-content--form">
        <Header
          eyebrow="Nova tentativa"
          title="Agendar exame"
          description="A elegibilidade e os conflitos serão validados pela API."
        />
        <form className="registry-form-card" onSubmit={submit}>
          {error ? <div className="registry-error">{error}</div> : null}
          <div className="registry-form-grid">
            <label>
              <span>Aluno</span>
              <select
                required
                disabled={Boolean(initialProcessId)}
                value={studentId}
                onChange={(event) => {
                  setStudentId(event.target.value);
                  setValues((current) => ({ ...current, processId: "" }));
                }}
              >
                <option value="">Selecione</option>
                {students.map((student) => (
                  <option value={student.id} key={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Processo</span>
              <select
                required
                value={values.processId}
                onChange={(event) => {
                  const selected = processes.find(
                    (process) => process.id === event.target.value,
                  );
                  setValues((current) => ({
                    ...current,
                    processId: event.target.value,
                    unitId: selected?.unitId ?? current.unitId,
                  }));
                }}
              >
                <option value="">Selecione</option>
                {processes.map((process) => (
                  <option value={process.id} key={process.id}>
                    {label(process.processType)} ·{" "}
                    {process.categories
                      .map(({ category }) => category.code)
                      .join("+")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tipo</span>
              <select
                value={values.type}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
              >
                {examTypes.map((type) => (
                  <option value={type} key={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
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
                <option value="">Selecione</option>
                {units.map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Data e horário</span>
              <input
                required
                type="datetime-local"
                value={values.scheduledAt}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    scheduledAt: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Local</span>
              <input
                value={values.location}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    location: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Protocolo externo</span>
              <input
                value={values.externalProtocol}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    externalProtocol: event.target.value,
                  }))
                }
              />
            </label>
            <label className="registry-field--wide">
              <span>Observações</span>
              <textarea
                value={values.notes}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="registry-form-actions">
            <Link className="button button--ghost" href="/exams">
              Cancelar
            </Link>
            <button className="button button--primary" type="submit">
              Agendar
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

export function ExamDetail() {
  const { id } = useParams<{ id: string }>();
  const { request } = useAuth();
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setExam(await request<Exam>(`/exams/${id}`));
      setError(null);
    } catch (loadError) {
      setError(message(loadError));
    }
  }, [id, request]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function action(name: string, body?: object) {
    try {
      await request(`/exams/${id}/${name}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (requestError) {
      setError(message(requestError));
    }
  }

  if (!exam) {
    return (
      <AppShell>
        <div className="registry-content">
          <div className="registry-state">{error || "Carregando exame…"}</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="registry-content">
        <Header
          eyebrow={`Tentativa ${exam.attemptNumber}`}
          title={`Exame ${label(exam.type).toLowerCase()}`}
          description={`${exam.student.name} · ${exam.unit.name}`}
          actions={
            <>
              {["REQUESTED", "SCHEDULED"].includes(exam.status) ? (
                <button
                  className="button button--primary"
                  onClick={() => void action("confirm")}
                >
                  Confirmar
                </button>
              ) : null}
              {exam.status === "CONFIRMED" ? (
                <button
                  className="button button--primary"
                  onClick={() => {
                    const result = window.prompt(
                      "Resultado: APPROVED, FAILED ou INCONCLUSIVE",
                      "APPROVED",
                    );
                    if (result)
                      void action("complete", { result: result.toUpperCase() });
                  }}
                >
                  Lançar resultado
                </button>
              ) : null}
              {["SCHEDULED", "CONFIRMED"].includes(exam.status) ? (
                <>
                  <button
                    className="button button--ghost"
                    onClick={() => {
                      const scheduledAt = window.prompt(
                        "Nova data e hora (ISO):",
                        new Date(Date.now() + 86_400_000).toISOString(),
                      );
                      const reason = window.prompt("Motivo do reagendamento:");
                      if (scheduledAt && reason)
                        void action("reschedule", { scheduledAt, reason });
                    }}
                  >
                    Reagendar
                  </button>
                  <button
                    className="button button--ghost"
                    onClick={() => void action("no-show")}
                  >
                    Marcar ausência
                  </button>
                  <button
                    className="button button--danger"
                    onClick={() => {
                      const reason = window.prompt("Motivo do cancelamento:");
                      if (reason) void action("cancel", { reason });
                    }}
                  >
                    Cancelar
                  </button>
                </>
              ) : null}
            </>
          }
        />
        {error ? <div className="registry-error">{error}</div> : null}
        <div className="process-tabs">
          <Link href={`/processes/${exam.processId}/exams`}>
            Voltar ao processo
          </Link>
          <Link href="/exams">Todos os exames</Link>
        </div>
        <section className="process-summary-grid">
          <article className="process-card">
            <span>Status</span>
            <Badge value={exam.status} />
          </article>
          <article className="process-card">
            <span>Resultado</span>
            <Badge value={exam.result} />
          </article>
          <article className="process-card">
            <span>Agendamento</span>
            <strong>{date(exam.scheduledAt, true)}</strong>
            <small>{exam.location || "Local não informado"}</small>
          </article>
          <article className="process-card">
            <span>Protocolo / nota</span>
            <strong>{exam.externalProtocol || "—"}</strong>
            <small>
              {exam.score == null ? "Sem nota" : `Nota ${exam.score}`}
            </small>
          </article>
        </section>
        <section className="process-card">
          <div className="process-card__header">
            <div>
              <span>Histórico</span>
              <h2>Tentativas deste exame</h2>
            </div>
          </div>
          <ExamAttempts
            processId={exam.processId}
            type={exam.type}
            request={request}
          />
        </section>
      </div>
    </AppShell>
  );
}

function ExamAttempts({
  processId,
  type,
  request,
}: {
  processId: string;
  type: string;
  request: ReturnType<typeof useAuth>["request"];
}) {
  const [items, setItems] = useState<Exam[]>([]);
  useEffect(() => {
    const query = new URLSearchParams({ processId, type, pageSize: "100" });
    void request<PaginatedResponse<Exam>>(`/exams?${query}`).then((response) =>
      setItems(response.data.sort((a, b) => b.attemptNumber - a.attemptNumber)),
    );
  }, [processId, request, type]);
  return (
    <div className="attempt-list">
      {items.map((attempt) => (
        <Link href={`/exams/${attempt.id}`} key={attempt.id}>
          <strong>Tentativa {attempt.attemptNumber}</strong>
          <span>{date(attempt.scheduledAt, true)}</span>
          <Badge value={attempt.status} />
          <Badge value={attempt.result} />
        </Link>
      ))}
    </div>
  );
}
