"use client";

import type { PaginatedResponse } from "@prumo/contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/auth/auth-context";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/auth-api";

type Lookup = { id: string; name: string };
type Vehicle = { id: string; plate: string; model: string };
type Classroom = Lookup & { unitId: string; capacity: number };
type ScheduleEvent = {
  id: string;
  type: "PRACTICAL_LESSON" | "THEORETICAL_CLASS" | "SCHEDULE_BLOCK" | "EXAM";
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  result?: string;
  examType?: string;
  unit?: Lookup | null;
  instructor?: Lookup | null;
  vehicle?: Vehicle | null;
  classroom?: Lookup | null;
};
type Practical = ScheduleEvent & {
  unit: Lookup;
  student: Lookup;
  instructor: Lookup;
  vehicle: Vehicle;
  notes?: string | null;
  cancellationReason?: string | null;
};
type Enrollment = {
  studentId: string;
  attendanceStatus: string;
  student: Lookup;
};
type Theoretical = ScheduleEvent & {
  unit: Lookup;
  classroom: Classroom;
  instructor: Lookup;
  capacity: number;
  description?: string | null;
  cancellationReason?: string | null;
  students: Enrollment[];
};

function toInput(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function mondayOf(date: Date) {
  const result = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const weekday = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - weekday + 1);
  return result;
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function hourLabel(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Não foi possível concluir a operação.";
}

function useLookups() {
  const { request } = useAuth();
  const [data, setData] = useState<{
    units: Lookup[];
    instructors: Lookup[];
    vehicles: Vehicle[];
    classrooms: Classroom[];
    students: Lookup[];
  }>({
    units: [],
    instructors: [],
    vehicles: [],
    classrooms: [],
    students: [],
  });
  useEffect(() => {
    async function load() {
      const [units, instructors, vehicles, classrooms, students] =
        await Promise.all([
          request<PaginatedResponse<Lookup>>("/units?pageSize=100&active=true"),
          request<PaginatedResponse<Lookup>>(
            "/instructors?pageSize=100&status=ACTIVE",
          ),
          request<PaginatedResponse<Vehicle>>(
            "/vehicles?pageSize=100&status=ACTIVE",
          ),
          request<PaginatedResponse<Classroom>>(
            "/classrooms?pageSize=100&active=true",
          ),
          request<PaginatedResponse<Lookup>>(
            "/students?pageSize=100&status=ACTIVE",
          ),
        ]);
      setData({
        units: units.data,
        instructors: instructors.data,
        vehicles: vehicles.data,
        classrooms: classrooms.data,
        students: students.data,
      });
    }
    void load().catch(() => undefined);
  }, [request]);
  return data;
}

export function ScheduleBoard() {
  const { request } = useAuth();
  const lookups = useLookups();
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [filters, setFilters] = useState<Record<string, string>>({
    type: "",
    status: "",
    unitId: "",
    instructorId: "",
    vehicleId: "",
    classroomId: "",
    studentId: "",
    examType: "",
    result: "",
  });
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(week);
        date.setUTCDate(date.getUTCDate() + index);
        return date;
      }),
    [week],
  );

  const load = useCallback(async () => {
    const to = new Date(week);
    to.setUTCDate(to.getUTCDate() + 7);
    const query = new URLSearchParams({
      from: week.toISOString(),
      to: to.toISOString(),
    });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    try {
      const response = await request<{ events: ScheduleEvent[] }>(
        `/schedule?${query}`,
      );
      setEvents(response.events);
      setError(null);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, [filters, request, week]);

  useEffect(() => {
    void load();
  }, [load]);

  function select(
    key: string,
    label: string,
    options: Array<Lookup | Vehicle>,
  ) {
    return (
      <label>
        <span>{label}</span>
        <select
          value={filters[key]}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              [key]: event.target.value,
            }))
          }
        >
          <option value="">Todos</option>
          {options.map((option) => (
            <option value={option.id} key={option.id}>
              {"plate" in option
                ? `${option.plate} — ${option.model}`
                : option.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <AppShell>
      <div className="registry-content schedule-content">
        <header className="registry-title-row">
          <div>
            <span className="eyebrow">Operação</span>
            <h1>Agenda semanal</h1>
            <p>
              Aulas práticas, turmas teóricas, exames e bloqueios em uma visão.
            </p>
          </div>
          <div className="schedule-create">
            <Link
              className="button button--ghost"
              href="/theoretical-classes/new"
            >
              Nova turma
            </Link>
            <Link
              className="button button--primary"
              href="/practical-lessons/new"
            >
              Nova aula
            </Link>
            <Link className="button button--primary" href="/exams/new">
              Novo exame
            </Link>
          </div>
        </header>
        <section className="schedule-controls">
          <button
            type="button"
            onClick={() =>
              setWeek((current) => {
                const date = new Date(current);
                date.setUTCDate(date.getUTCDate() - 7);
                return date;
              })
            }
          >
            ←
          </button>
          <strong>
            {dateLabel(days[0])} – {dateLabel(days[6])}
          </strong>
          <button
            type="button"
            onClick={() =>
              setWeek((current) => {
                const date = new Date(current);
                date.setUTCDate(date.getUTCDate() + 7);
                return date;
              })
            }
          >
            →
          </button>
          <button type="button" onClick={() => setWeek(mondayOf(new Date()))}>
            Hoje
          </button>
        </section>
        <section className="schedule-filters">
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
              <option value="PRACTICAL_LESSON">Prática</option>
              <option value="THEORETICAL_CLASS">Teórica</option>
              <option value="EXAM">Exame</option>
              <option value="SCHEDULE_BLOCK">Bloqueio</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              <option value="">Todos</option>
              {[
                "PENDING",
                "CONFIRMED",
                "IN_PROGRESS",
                "COMPLETED",
                "CANCELLED",
                "NO_SHOW",
              ].map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          {select("unitId", "Unidade", lookups.units)}
          {select("instructorId", "Instrutor", lookups.instructors)}
          {select("vehicleId", "Veículo", lookups.vehicles)}
          {select("classroomId", "Sala", lookups.classrooms)}
          {select("studentId", "Aluno", lookups.students)}
          <label>
            <span>Tipo de exame</span>
            <select
              value={filters.examType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  examType: event.target.value,
                }))
              }
            >
              <option value="">Todos</option>
              {["MEDICAL", "PSYCHOLOGICAL", "THEORETICAL", "PRACTICAL"].map(
                (type) => (
                  <option value={type} key={type}>
                    {type}
                  </option>
                ),
              )}
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
                    {result}
                  </option>
                ),
              )}
            </select>
          </label>
        </section>
        {error ? <div className="registry-error">{error}</div> : null}
        <section className="week-grid">
          {days.map((day) => {
            const dayEvents = events.filter((event) => {
              const date = new Date(event.startsAt);
              return (
                date.getUTCFullYear() === day.getUTCFullYear() &&
                date.getUTCMonth() === day.getUTCMonth() &&
                date.getUTCDate() === day.getUTCDate()
              );
            });
            return (
              <article className="week-day" key={day.toISOString()}>
                <header>{dateLabel(day)}</header>
                <div>
                  {dayEvents.length ? (
                    dayEvents.map((event) => {
                      const href =
                        event.type === "PRACTICAL_LESSON"
                          ? `/practical-lessons/${event.id}`
                          : event.type === "THEORETICAL_CLASS"
                            ? `/theoretical-classes/${event.id}`
                            : event.type === "EXAM"
                              ? `/exams/${event.id}`
                              : undefined;
                      const content = (
                        <>
                          <small>
                            {hourLabel(event.startsAt)}–
                            {hourLabel(event.endsAt)}
                          </small>
                          <strong>{event.title}</strong>
                          <span>{event.unit?.name ?? event.status}</span>
                        </>
                      );
                      return href ? (
                        <Link
                          className={`schedule-event schedule-event--${event.type.toLowerCase()}`}
                          href={href}
                          key={`${event.type}-${event.id}`}
                        >
                          {content}
                        </Link>
                      ) : (
                        <div
                          className="schedule-event schedule-event--schedule_block"
                          key={`${event.type}-${event.id}`}
                        >
                          {content}
                        </div>
                      );
                    })
                  ) : (
                    <span className="week-empty">Sem eventos</span>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}

function ResourceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<Lookup | Vehicle>;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option value={option.id} key={option.id}>
            {"plate" in option
              ? `${option.plate} — ${option.model}`
              : option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LessonForm({ kind }: { kind: "practical" | "theoretical" }) {
  const { request } = useAuth();
  const router = useRouter();
  const lookups = useLookups();
  const [values, setValues] = useState<Record<string, string>>({
    unitId: "",
    studentId: "",
    instructorId: "",
    vehicleId: "",
    classroomId: "",
    title: "",
    description: "",
    notes: "",
    startsAt: "",
    endsAt: "",
    capacity: "20",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const common = {
      unitId: values.unitId,
      instructorId: values.instructorId,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
    };
    const payload =
      kind === "practical"
        ? {
            ...common,
            studentId: values.studentId,
            vehicleId: values.vehicleId,
            notes: values.notes || undefined,
          }
        : {
            ...common,
            classroomId: values.classroomId,
            title: values.title,
            description: values.description || undefined,
            capacity: Number(values.capacity),
            studentIds: values.studentId ? [values.studentId] : undefined,
          };
    try {
      const created = await request<{ id: string }>(
        kind === "practical" ? "/practical-lessons" : "/theoretical-classes",
        { method: "POST", body: JSON.stringify(payload) },
      );
      router.push(
        kind === "practical"
          ? `/practical-lessons/${created.id}`
          : `/theoretical-classes/${created.id}`,
      );
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  const classrooms = lookups.classrooms.filter(
    (room) => !values.unitId || room.unitId === values.unitId,
  );

  return (
    <AppShell>
      <div className="registry-content registry-content--form">
        <header className="registry-form-header">
          <button type="button" onClick={() => router.push("/schedule")}>
            ←
          </button>
          <div>
            <span className="eyebrow">Agenda</span>
            <h1>
              {kind === "practical"
                ? "Nova aula prática"
                : "Nova turma teórica"}
            </h1>
            <p>Conflitos e vínculos com o tenant são validados ao salvar.</p>
          </div>
        </header>
        <form className="registry-form-card" onSubmit={submit}>
          {error ? <div className="registry-error">{error}</div> : null}
          <fieldset className="registry-fieldset">
            <legend>Recursos e horário</legend>
            <div className="registry-form-grid">
              <ResourceSelect
                label="Unidade"
                value={values.unitId}
                options={lookups.units}
                onChange={(value) => set("unitId", value)}
              />
              <ResourceSelect
                label="Instrutor"
                value={values.instructorId}
                options={lookups.instructors}
                onChange={(value) => set("instructorId", value)}
              />
              {kind === "practical" ? (
                <ResourceSelect
                  label="Veículo"
                  value={values.vehicleId}
                  options={lookups.vehicles}
                  onChange={(value) => set("vehicleId", value)}
                />
              ) : (
                <ResourceSelect
                  label="Sala"
                  value={values.classroomId}
                  options={classrooms}
                  onChange={(value) => set("classroomId", value)}
                />
              )}
              <ResourceSelect
                label={
                  kind === "practical" ? "Aluno" : "Aluno inicial (opcional)"
                }
                value={values.studentId}
                options={lookups.students}
                onChange={(value) => set("studentId", value)}
              />
              <label>
                <span>Início</span>
                <input
                  required
                  type="datetime-local"
                  value={values.startsAt}
                  onChange={(event) => set("startsAt", event.target.value)}
                />
              </label>
              <label>
                <span>Término</span>
                <input
                  required
                  type="datetime-local"
                  value={values.endsAt}
                  onChange={(event) => set("endsAt", event.target.value)}
                />
              </label>
              {kind === "theoretical" ? (
                <>
                  <label>
                    <span>Título</span>
                    <input
                      required
                      value={values.title}
                      onChange={(event) => set("title", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Capacidade</span>
                    <input
                      required
                      min="1"
                      type="number"
                      value={values.capacity}
                      onChange={(event) => set("capacity", event.target.value)}
                    />
                  </label>
                  <label className="registry-field--wide">
                    <span>Descrição</span>
                    <textarea
                      value={values.description}
                      onChange={(event) =>
                        set("description", event.target.value)
                      }
                    />
                  </label>
                </>
              ) : (
                <label className="registry-field--wide">
                  <span>Observações</span>
                  <textarea
                    value={values.notes}
                    onChange={(event) => set("notes", event.target.value)}
                  />
                </label>
              )}
            </div>
          </fieldset>
          <footer className="registry-form-actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => router.push("/schedule")}
            >
              Cancelar
            </button>
            <button
              className="button button--primary"
              disabled={saving}
              type="submit"
            >
              {saving ? "Agendando…" : "Agendar"}
            </button>
          </footer>
        </form>
      </div>
    </AppShell>
  );
}

export function LessonDetail({ kind }: { kind: "practical" | "theoretical" }) {
  const { id } = useParams<{ id: string }>();
  const { request } = useAuth();
  const lookups = useLookups();
  const [lesson, setLesson] = useState<Practical | Theoretical | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [studentId, setStudentId] = useState("");
  const endpoint =
    kind === "practical" ? "practical-lessons" : "theoretical-classes";

  const load = useCallback(async () => {
    try {
      setLesson(await request<Practical | Theoretical>(`/${endpoint}/${id}`));
      setError(null);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, [endpoint, id, request]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function action(name: string, body?: unknown) {
    try {
      await request(`/${endpoint}/${id}/${name}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    }
  }

  if (!lesson) {
    return (
      <AppShell>
        <div className="registry-content">
          {error ? (
            <div className="registry-error">{error}</div>
          ) : (
            <div className="registry-state">Carregando…</div>
          )}
        </div>
      </AppShell>
    );
  }
  const theoreticalLesson =
    kind === "theoretical" ? (lesson as Theoretical) : null;
  const practicalLesson = kind === "practical" ? (lesson as Practical) : null;

  return (
    <AppShell>
      <div className="registry-content lesson-detail">
        <header className="registry-title-row">
          <div>
            <span className="eyebrow">Agenda · {lesson.status}</span>
            <h1>{lesson.title}</h1>
            <p>
              {new Date(lesson.startsAt).toLocaleString("pt-BR")} –{" "}
              {hourLabel(lesson.endsAt)}
            </p>
          </div>
          <Link className="button button--ghost" href="/schedule">
            Voltar à agenda
          </Link>
        </header>
        {error ? <div className="registry-error">{error}</div> : null}
        <div className="lesson-grid">
          <section className="registry-form-card">
            <h2>Recursos</h2>
            <dl className="lesson-facts">
              <div>
                <dt>Unidade</dt>
                <dd>{lesson.unit.name}</dd>
              </div>
              <div>
                <dt>Instrutor</dt>
                <dd>{lesson.instructor.name}</dd>
              </div>
              {practicalLesson ? (
                <div>
                  <dt>Aluno</dt>
                  <dd>{practicalLesson.student.name}</dd>
                </div>
              ) : null}
              {practicalLesson ? (
                <div>
                  <dt>Veículo</dt>
                  <dd>
                    {practicalLesson.vehicle.plate} ·{" "}
                    {practicalLesson.vehicle.model}
                  </dd>
                </div>
              ) : null}
              {theoreticalLesson ? (
                <div>
                  <dt>Sala</dt>
                  <dd>{theoreticalLesson.classroom.name}</dd>
                </div>
              ) : null}
            </dl>
          </section>
          <section className="registry-form-card lesson-actions">
            <h2>Ações seguras</h2>
            <div className="action-buttons">
              <button type="button" onClick={() => void action("confirm")}>
                Confirmar
              </button>
              <button type="button" onClick={() => void action("start")}>
                Iniciar
              </button>
              <button type="button" onClick={() => void action("complete")}>
                Concluir
              </button>
              {kind === "practical" ? (
                <button type="button" onClick={() => void action("no-show")}>
                  Falta
                </button>
              ) : null}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void action("cancel", { reason });
              }}
            >
              <label>
                <span>Motivo do cancelamento</span>
                <input
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button type="submit">Cancelar evento</button>
            </form>
            {kind === "practical" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void action("reschedule", {
                    startsAt: new Date(newStart).toISOString(),
                    endsAt: new Date(newEnd).toISOString(),
                  });
                }}
              >
                <label>
                  <span>Novo início</span>
                  <input
                    required
                    type="datetime-local"
                    value={newStart}
                    onChange={(event) => setNewStart(event.target.value)}
                  />
                </label>
                <label>
                  <span>Novo término</span>
                  <input
                    required
                    type="datetime-local"
                    value={newEnd}
                    onChange={(event) => setNewEnd(event.target.value)}
                  />
                </label>
                <button type="submit">Reagendar</button>
              </form>
            ) : null}
          </section>
          {theoreticalLesson ? (
            <section className="registry-form-card lesson-participants">
              <h2>
                Alunos ({theoreticalLesson.students.length}/
                {theoreticalLesson.capacity})
              </h2>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await request(`/${endpoint}/${id}/students`, {
                      method: "POST",
                      body: JSON.stringify({ studentId }),
                    });
                    setStudentId("");
                    await load();
                  } catch (addError) {
                    setError(errorMessage(addError));
                  }
                }}
              >
                <ResourceSelect
                  label="Adicionar aluno"
                  value={studentId}
                  options={lookups.students}
                  onChange={setStudentId}
                />
                <button type="submit">Adicionar</button>
              </form>
              <ul>
                {theoreticalLesson.students.map((entry) => (
                  <li key={entry.studentId}>
                    <span>{entry.student.name}</span>
                    <select
                      value={entry.attendanceStatus}
                      onChange={async (event) => {
                        try {
                          await request(
                            `/${endpoint}/${id}/students/${entry.studentId}/attendance`,
                            {
                              method: "PATCH",
                              body: JSON.stringify({
                                attendanceStatus: event.target.value,
                              }),
                            },
                          );
                          await load();
                        } catch (attendanceError) {
                          setError(errorMessage(attendanceError));
                        }
                      }}
                    >
                      {["ENROLLED", "PRESENT", "ABSENT", "EXCUSED"].map(
                        (status) => (
                          <option value={status} key={status}>
                            {status}
                          </option>
                        ),
                      )}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

export { toInput };
