"use client";

import type { PaginatedResponse } from "@prumo/contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
type Service = {
  id: string;
  code: string;
  name: string;
  category: string;
  defaultPriceCents: number;
  active: boolean;
};
type PlanItem = {
  id: string;
  serviceId: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  service: Service;
};
type Plan = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  totalPriceCents: number;
  items: PlanItem[];
  _count?: { items: number; contracts: number };
};
type Installment = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amountDueCents: number;
  amountPaidCents: number;
  balanceCents: number;
  status: string;
  student?: Lookup;
  contract?: {
    id: string;
    contractNumber: string;
    unit?: Lookup;
  };
};
type Payment = {
  id: string;
  student: Lookup;
  contract?: { id: string; contractNumber: string } | null;
  amountCents: number;
  refundedAmountCents: number;
  paymentMethod: string;
  status: string;
  receivedAt: string;
  allocations: Array<{ installment: Installment; amountCents: number }>;
};
type Contract = {
  id: string;
  studentId: string;
  unitId: string;
  contractNumber: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  surchargeCents: number;
  totalCents: number;
  student: Lookup;
  unit: Lookup;
  plan?: Lookup | null;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  installments: Installment[];
  payments: Payment[];
  adjustments: Array<{
    id: string;
    type: string;
    amountCents: number;
    reason: string;
    createdAt: string;
  }>;
};
type Cash = {
  id: string;
  unit: Lookup;
  status: string;
  openingBalanceCents: number;
  expectedBalanceCents: number;
  countedBalanceCents?: number | null;
  differenceCents?: number | null;
  openedAt: string;
  closedAt?: string | null;
  movements?: Array<{
    id: string;
    type: string;
    amountCents: number;
    description: string;
    createdAt: string;
  }>;
};
type Expense = {
  id: string;
  description: string;
  supplierName?: string | null;
  amountCents: number;
  dueDate: string;
  paidAt?: string | null;
  status: string;
  paymentMethod?: string | null;
  unit: Lookup;
  category: Lookup;
};
type Dashboard = {
  totalReceivableCents: number;
  overdueCents: number;
  receivedCents: number;
  expensesCents: number;
  cashBalanceCents: number;
  defaultRateBasisPoints: number;
  activeContracts: number;
  averageTicketCents: number;
};

const serviceCategories = [
  "ENROLLMENT",
  "THEORETICAL_COURSE",
  "PRACTICAL_LESSON",
  "PRACTICAL_LESSON_PACKAGE",
  "THEORETICAL_EXAM",
  "PRACTICAL_EXAM",
  "MEDICAL_EXAM",
  "PSYCHOLOGICAL_EXAM",
  "RETEST",
  "DOCUMENT_FEE",
  "OTHER",
];
const paymentMethods = [
  "CASH",
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "BANK_TRANSFER",
  "BANK_SLIP",
  "CHECK",
  "OTHER",
];
const labels: Record<string, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  DEFAULTED: "Inadimplente",
  PENDING: "Pendente",
  PARTIALLY_PAID: "Parcial",
  PAID: "Pago",
  OVERDUE: "Vencido",
  NEGOTIATED: "Negociado",
  REFUNDED: "Estornado",
  PARTIALLY_REFUNDED: "Estorno parcial",
  CONFIRMED: "Confirmado",
  CASH: "Dinheiro",
  PIX: "PIX",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  BANK_TRANSFER: "Transferência",
  BANK_SLIP: "Boleto",
  CHECK: "Cheque",
  ENROLLMENT: "Matrícula",
  THEORETICAL_COURSE: "Curso teórico",
  PRACTICAL_LESSON: "Aula prática",
  PRACTICAL_LESSON_PACKAGE: "Pacote de aulas práticas",
  THEORETICAL_EXAM: "Exame teórico",
  PRACTICAL_EXAM: "Exame prático",
  MEDICAL_EXAM: "Exame médico",
  PSYCHOLOGICAL_EXAM: "Exame psicológico",
  RETEST: "Reteste",
  DOCUMENT_FEE: "Taxa documental",
  OTHER: "Outros",
};

function label(value: string) {
  return labels[value] ?? value.replaceAll("_", " ").toLowerCase();
}

function money(cents?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents ?? 0) / 100);
}

function date(value?: string | null, time = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: time ? "short" : undefined,
  }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Não foi possível concluir a operação.";
}

function Badge({ value }: { value: string }) {
  const active = ["ACTIVE", "PAID", "CONFIRMED", "OPEN"].includes(value);
  return (
    <span
      className={`status-badge status-badge--${active ? "active" : "inactive"}`}
    >
      {label(value)}
    </span>
  );
}

function Header({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="registry-title-row">
      <div>
        <span className="eyebrow">Financeiro</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="schedule-create">{actions}</div> : null}
    </header>
  );
}

function FinancialNav() {
  const links = [
    ["/financial", "Dashboard"],
    ["/financial/services", "Serviços"],
    ["/financial/plans", "Planos"],
    ["/financial/receivables", "Contas a receber"],
    ["/financial/payments", "Pagamentos"],
    ["/financial/cash-registers", "Caixa"],
    ["/financial/expenses", "Despesas"],
    ["/financial/reports", "Relatórios"],
  ];
  return (
    <nav className="process-tabs">
      {links.map(([href, text]) => (
        <Link href={href} key={href}>
          {text}
        </Link>
      ))}
    </nav>
  );
}

function FinancialPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <div className="registry-content">
        <Header title={title} description={description} actions={actions} />
        <FinancialNav />
        {children}
      </div>
    </AppShell>
  );
}

export function FinancialDashboard() {
  const { request } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void request<Dashboard>("/financial/dashboard")
      .then(setData)
      .catch((cause) => setError(errorMessage(cause)));
  }, [request]);
  const cards = data
    ? [
        ["Total a receber", money(data.totalReceivableCents)],
        ["Total vencido", money(data.overdueCents)],
        ["Recebido no período", money(data.receivedCents)],
        ["Despesas no período", money(data.expensesCents)],
        ["Saldo de caixa", money(data.cashBalanceCents)],
        ["Inadimplência", `${(data.defaultRateBasisPoints / 100).toFixed(2)}%`],
        ["Contratos ativos", String(data.activeContracts)],
        ["Ticket médio", money(data.averageTicketCents)],
      ]
    : [];
  return (
    <FinancialPage
      title="Visão financeira"
      description="Recebíveis, caixa, despesas e indicadores do tenant ativo."
      actions={
        <Link className="button button--primary" href="/financial/payments/new">
          Registrar pagamento
        </Link>
      }
    >
      {error ? <div className="registry-error">{error}</div> : null}
      <section className="financial-kpis">
        {cards.map(([title, value]) => (
          <article className="process-card" key={title}>
            <span>{title}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
    </FinancialPage>
  );
}

export function ServicesList() {
  const { request } = useAuth();
  const [items, setItems] = useState<Service[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const query = new URLSearchParams({ pageSize: "100" });
    if (search) query.set("search", search);
    try {
      setItems(
        (await request<PaginatedResponse<Service>>(`/services?${query}`)).data,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [request, search]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <FinancialPage
      title="Serviços"
      description="Catálogo e preços-base preservados no histórico."
      actions={
        <Link className="button button--primary" href="/financial/services/new">
          Novo serviço
        </Link>
      }
    >
      <section className="registry-panel">
        <div className="registry-toolbar">
          <div className="registry-search">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código ou nome"
            />
          </div>
        </div>
        {error ? <div className="registry-error">{error}</div> : null}
        <div className="financial-table">
          {items.map((item) => (
            <div className="financial-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.code}</span>
              </div>
              <span>{label(item.category)}</span>
              <strong>{money(item.defaultPriceCents)}</strong>
              <Badge value={item.active ? "ACTIVE" : "INACTIVE"} />
              <div className="registry-actions">
                <Link href={`/financial/services/${item.id}/edit`}>Editar</Link>
                <button
                  onClick={async () => {
                    await request(`/services/${item.id}/status`, {
                      method: "PATCH",
                      body: JSON.stringify({ active: !item.active }),
                    });
                    await load();
                  }}
                >
                  {item.active ? "Inativar" : "Ativar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </FinancialPage>
  );
}

export function ServiceForm({ editing = false }: { editing?: boolean }) {
  const params = useParams<{ id: string }>();
  const { request } = useAuth();
  const router = useRouter();
  const [values, setValues] = useState({
    code: "",
    name: "",
    category: "ENROLLMENT",
    defaultPrice: "",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) return;
    void request<Service>(`/services/${params.id}`).then((item) =>
      setValues({
        code: item.code,
        name: item.name,
        category: item.category,
        defaultPrice: String(item.defaultPriceCents / 100),
        description: "",
      }),
    );
  }, [editing, params.id, request]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await request(editing ? `/services/${params.id}` : "/services", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          code: values.code,
          name: values.name,
          category: values.category,
          defaultPriceCents: Math.round(Number(values.defaultPrice) * 100),
          description: values.description || undefined,
        }),
      });
      router.push("/financial/services");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <FinancialPage
      title={editing ? "Editar serviço" : "Novo serviço"}
      description="Valores são enviados e armazenados em centavos."
    >
      <form className="registry-form-card" onSubmit={submit}>
        {error ? <div className="registry-error">{error}</div> : null}
        <div className="registry-form-grid">
          {[
            ["code", "Código"],
            ["name", "Nome"],
            ["defaultPrice", "Preço padrão (R$)"],
          ].map(([key, text]) => (
            <label key={key}>
              <span>{text}</span>
              <input
                required
                type={key === "defaultPrice" ? "number" : "text"}
                step={key === "defaultPrice" ? "0.01" : undefined}
                min={key === "defaultPrice" ? "0" : undefined}
                value={values[key as keyof typeof values]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <label>
            <span>Categoria</span>
            <select
              value={values.category}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
            >
              {serviceCategories.map((category) => (
                <option value={category} key={category}>
                  {label(category)}
                </option>
              ))}
            </select>
          </label>
          <label className="registry-field--wide">
            <span>Descrição</span>
            <textarea
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="registry-form-actions">
          <Link className="button button--ghost" href="/financial/services">
            Cancelar
          </Link>
          <button className="button button--primary">Salvar</button>
        </div>
      </form>
    </FinancialPage>
  );
}

export function PlansList() {
  const { request } = useAuth();
  const [items, setItems] = useState<Plan[]>([]);
  useEffect(() => {
    void request<PaginatedResponse<Plan>>("/service-plans?pageSize=100").then(
      (response) => setItems(response.data),
    );
  }, [request]);
  return (
    <FinancialPage
      title="Planos comerciais"
      description="Composição versionável de serviços e preços."
      actions={
        <Link className="button button--primary" href="/financial/plans/new">
          Novo plano
        </Link>
      }
    >
      <section className="registry-panel financial-table">
        {items.map((item) => (
          <Link
            className="financial-row"
            href={`/financial/plans/${item.id}`}
            key={item.id}
          >
            <div>
              <strong>{item.name}</strong>
              <span>{item._count?.items ?? 0} itens</span>
            </div>
            <strong>{money(item.totalPriceCents)}</strong>
            <Badge value={item.status} />
            <span>{item._count?.contracts ?? 0} contratos</span>
            <span>Detalhar →</span>
          </Link>
        ))}
      </section>
    </FinancialPage>
  );
}

export function PlanForm() {
  const { request } = useAuth();
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void request<PaginatedResponse<Service>>(
      "/services?pageSize=100&active=true",
    ).then((response) => setServices(response.data));
  }, [request]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const plan = await request<Plan>("/service-plans", {
        method: "POST",
        body: JSON.stringify({
          name,
          items: Object.entries(selected)
            .filter(([, quantity]) => quantity > 0)
            .map(([serviceId, quantity]) => ({ serviceId, quantity })),
        }),
      });
      router.push(`/financial/plans/${plan.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <FinancialPage
      title="Novo plano"
      description="Selecione os serviços; todos os totais serão recalculados pela API."
    >
      <form className="registry-form-card" onSubmit={submit}>
        {error ? <div className="registry-error">{error}</div> : null}
        <div className="registry-form-grid">
          <label className="registry-field--wide">
            <span>Nome do plano</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>
        <div className="plan-service-picker">
          {services.map((service) => (
            <label key={service.id}>
              <span>
                <strong>{service.name}</strong>
                <small>{money(service.defaultPriceCents)}</small>
              </span>
              <input
                type="number"
                min="0"
                value={selected[service.id] ?? 0}
                onChange={(event) =>
                  setSelected((current) => ({
                    ...current,
                    [service.id]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <div className="registry-form-actions">
          <Link className="button button--ghost" href="/financial/plans">
            Cancelar
          </Link>
          <button className="button button--primary">Criar plano</button>
        </div>
      </form>
    </FinancialPage>
  );
}

export function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const { request } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () => request<Plan>(`/service-plans/${id}`).then(setPlan),
    [id, request],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (!plan)
    return (
      <FinancialPage title="Plano" description="Carregando…">
        <span />
      </FinancialPage>
    );
  async function action(name: string) {
    try {
      await request(`/service-plans/${id}/${name}`, { method: "POST" });
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <FinancialPage
      title={plan.name}
      description={`${money(plan.totalPriceCents)} · ${label(plan.status)}`}
      actions={
        <>
          {["DRAFT", "INACTIVE"].includes(plan.status) ? (
            <button
              className="button button--primary"
              onClick={() => {
                if (confirm("Ativar este contrato?")) {
                  void action("activate");
                }
              }}
            >
              Ativar
            </button>
          ) : null}
          {plan.status === "ACTIVE" ? (
            <button
              className="button button--ghost"
              onClick={() => void action("deactivate")}
            >
              Desativar
            </button>
          ) : null}
          {["DRAFT", "INACTIVE"].includes(plan.status) ? (
            <button
              className="button button--danger"
              onClick={() => void action("archive")}
            >
              Arquivar
            </button>
          ) : null}
        </>
      }
    >
      {error ? <div className="registry-error">{error}</div> : null}
      <section className="process-card">
        <div className="process-card__header">
          <div>
            <span>Composição</span>
            <h2>Itens do plano</h2>
          </div>
          <Badge value={plan.status} />
        </div>
        <div className="financial-table">
          {plan.items.map((item) => (
            <div className="financial-row" key={item.id}>
              <strong>{item.service.name}</strong>
              <span>
                {item.quantity} × {money(item.unitPriceCents)}
              </span>
              <span>Desconto {money(item.discountCents)}</span>
              <strong>{money(item.totalCents)}</strong>
            </div>
          ))}
        </div>
      </section>
    </FinancialPage>
  );
}

export function StudentContracts() {
  const { id: studentId } = useParams<{ id: string }>();
  const { request } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [units, setUnits] = useState<Lookup[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [values, setValues] = useState({
    unitId: "",
    planId: "",
    contractNumber: "",
  });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await request<PaginatedResponse<Contract>>(
      `/students/${studentId}/contracts?pageSize=100`,
    );
    setContracts(response.data);
  }, [request, studentId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([
        load(),
        request<PaginatedResponse<Lookup>>("/units?pageSize=100&active=true"),
        request<PaginatedResponse<Plan>>(
          "/service-plans?pageSize=100&status=ACTIVE",
        ),
      ]).then(([, unitResponse, planResponse]) => {
        setUnits(unitResponse.data);
        setPlans(planResponse.data);
        setValues((current) => ({
          ...current,
          unitId: unitResponse.data[0]?.id ?? "",
        }));
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [load, request]);
  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await request(`/students/${studentId}/contracts`, {
        method: "POST",
        body: JSON.stringify({ ...values, items: [] }),
      });
      setValues((current) => ({ ...current, contractNumber: "" }));
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <FinancialPage
      title="Contratos do aluno"
      description="Planos, itens, parcelas e pagamentos preservados."
    >
      <form
        className="registry-form-card financial-inline-form"
        onSubmit={create}
      >
        {error ? <div className="registry-error">{error}</div> : null}
        <select
          required
          value={values.unitId}
          onChange={(event) =>
            setValues((current) => ({ ...current, unitId: event.target.value }))
          }
        >
          <option value="">Unidade</option>
          {units.map((unit) => (
            <option value={unit.id} key={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
        <select
          required
          value={values.planId}
          onChange={(event) =>
            setValues((current) => ({ ...current, planId: event.target.value }))
          }
        >
          <option value="">Plano ativo</option>
          {plans.map((plan) => (
            <option value={plan.id} key={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
        <input
          required
          placeholder="Número do contrato"
          value={values.contractNumber}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              contractNumber: event.target.value,
            }))
          }
        />
        <button className="button button--primary">Criar contrato</button>
      </form>
      <section className="registry-panel financial-table">
        {contracts.map((contract) => (
          <Link
            className="financial-row"
            href={`/contracts/${contract.id}`}
            key={contract.id}
          >
            <strong>{contract.contractNumber}</strong>
            <span>{contract.plan?.name ?? "Contrato manual"}</span>
            <strong>{money(contract.totalCents)}</strong>
            <Badge value={contract.status} />
            <span>Detalhar →</span>
          </Link>
        ))}
      </section>
    </FinancialPage>
  );
}

export function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const { request } = useAuth();
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () => request<Contract>(`/contracts/${id}`).then(setContract),
    [id, request],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function action(name: string, body?: object) {
    try {
      await request(`/contracts/${id}/${name}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  if (!contract)
    return (
      <FinancialPage title="Contrato" description="Carregando…">
        <span />
      </FinancialPage>
    );
  return (
    <FinancialPage
      title={`Contrato ${contract.contractNumber}`}
      description={`${contract.student.name} · ${contract.unit.name}`}
      actions={
        <>
          {contract.status === "DRAFT" ? (
            <button
              className="button button--primary"
              onClick={() => void action("activate")}
            >
              Ativar
            </button>
          ) : null}
          {contract.status === "ACTIVE" ? (
            <>
              <button
                className="button button--ghost"
                onClick={() => {
                  const quantity = Number(
                    prompt("Quantidade de parcelas:", "3"),
                  );
                  const firstDueDate = prompt(
                    "Primeiro vencimento (ISO):",
                    new Date(Date.now() + 86400000 * 30).toISOString(),
                  );
                  if (
                    quantity &&
                    firstDueDate &&
                    confirm("Gerar as parcelas deste contrato?")
                  )
                    void action("installments", { quantity, firstDueDate });
                }}
              >
                Gerar parcelas
              </button>
              <button
                className="button button--ghost"
                onClick={() => void action("complete")}
              >
                Concluir
              </button>
              <button
                className="button button--danger"
                onClick={() => {
                  const reason = prompt("Motivo do cancelamento:");
                  if (reason) void action("cancel", { reason });
                }}
              >
                Cancelar
              </button>
            </>
          ) : null}
        </>
      }
    >
      {error ? <div className="registry-error">{error}</div> : null}
      <section className="process-summary-grid">
        {[
          ["Status", label(contract.status)],
          ["Subtotal", money(contract.subtotalCents)],
          ["Descontos", money(contract.discountCents)],
          ["Total", money(contract.totalCents)],
        ].map(([title, value]) => (
          <article className="process-card" key={title}>
            <span>{title}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <div className="process-columns">
        <section className="process-card">
          <div className="process-card__header">
            <div>
              <span>Composição</span>
              <h2>Itens</h2>
            </div>
          </div>
          <div className="financial-table">
            {contract.items.map((item) => (
              <div className="financial-row" key={item.id}>
                <strong>{item.description}</strong>
                <span>
                  {item.quantity} × {money(item.unitPriceCents)}
                </span>
                <strong>{money(item.totalCents)}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="process-card">
          <div className="process-card__header">
            <div>
              <span>Recebíveis</span>
              <h2>Parcelas</h2>
            </div>
          </div>
          <div className="financial-table">
            {contract.installments.map((item) => (
              <div className="financial-row" key={item.id}>
                <strong>#{item.installmentNumber}</strong>
                <span>{date(item.dueDate)}</span>
                <strong>{money(item.balanceCents)}</strong>
                <Badge value={item.status} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </FinancialPage>
  );
}

export function ReceivablesList() {
  const { request } = useAuth();
  const [items, setItems] = useState<Installment[]>([]);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    const query = new URLSearchParams({ pageSize: "100" });
    if (status) query.set("status", status);
    setItems(
      (await request<PaginatedResponse<Installment>>(`/receivables?${query}`))
        .data,
    );
  }, [request, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <FinancialPage
      title="Contas a receber"
      description="Parcelas, vencimentos, pagamentos parciais e saldos."
    >
      <section className="schedule-filters exam-filters">
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todos</option>
            {["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"].map(
              (value) => (
                <option value={value} key={value}>
                  {label(value)}
                </option>
              ),
            )}
          </select>
        </label>
      </section>
      <section className="registry-panel financial-table">
        {items.map((item) => (
          <div className="financial-row" key={item.id}>
            <div>
              <strong>{item.student?.name}</strong>
              <span>
                {item.contract?.contractNumber} · #{item.installmentNumber}
              </span>
            </div>
            <span>{date(item.dueDate)}</span>
            <strong>{money(item.balanceCents)}</strong>
            <Badge value={item.status} />
            <button
              onClick={async () => {
                const amount = Number(prompt("Desconto em reais:"));
                const reason = prompt("Motivo:");
                if (
                  amount &&
                  reason &&
                  confirm("Aplicar este desconto à parcela?")
                ) {
                  await request(`/receivables/${item.id}/discount`, {
                    method: "POST",
                    body: JSON.stringify({
                      amountCents: Math.round(amount * 100),
                      reason,
                    }),
                  });
                  await load();
                }
              }}
            >
              Desconto
            </button>
          </div>
        ))}
      </section>
    </FinancialPage>
  );
}

export function PaymentsList() {
  const { request } = useAuth();
  const [items, setItems] = useState<Payment[]>([]);
  const load = useCallback(async () => {
    setItems(
      (await request<PaginatedResponse<Payment>>("/payments?pageSize=100"))
        .data,
    );
  }, [request]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <FinancialPage
      title="Pagamentos"
      description="Recebimentos, alocações e estornos."
      actions={
        <Link className="button button--primary" href="/financial/payments/new">
          Novo pagamento
        </Link>
      }
    >
      <section className="registry-panel financial-table">
        {items.map((item) => (
          <div className="financial-row" key={item.id}>
            <div>
              <strong>{item.student.name}</strong>
              <span>{date(item.receivedAt, true)}</span>
            </div>
            <span>{label(item.paymentMethod)}</span>
            <strong>
              {money(item.amountCents - item.refundedAmountCents)}
            </strong>
            <Badge value={item.status} />
            <div className="registry-actions">
              {item.status === "PENDING" ? (
                <button
                  onClick={async () => {
                    if (confirm("Confirmar este pagamento?")) {
                      await request(`/payments/${item.id}/confirm`, {
                        method: "POST",
                      });
                      await load();
                    }
                  }}
                >
                  Confirmar
                </button>
              ) : null}
              {["CONFIRMED", "PARTIALLY_REFUNDED"].includes(item.status) ? (
                <button
                  onClick={async () => {
                    const amount = Number(prompt("Valor do estorno (R$):"));
                    const reason = prompt("Motivo:");
                    if (amount && reason && confirm("Confirmar estorno?")) {
                      await request(`/payments/${item.id}/refunds`, {
                        method: "POST",
                        body: JSON.stringify({
                          amountCents: Math.round(amount * 100),
                          reason,
                        }),
                      });
                      await load();
                    }
                  }}
                >
                  Estornar
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </FinancialPage>
  );
}

export function PaymentForm() {
  const { request } = useAuth();
  const router = useRouter();
  const [students, setStudents] = useState<Lookup[]>([]);
  const [studentId, setStudentId] = useState("");
  const [receivables, setReceivables] = useState<Installment[]>([]);
  const [cashRegisters, setCashRegisters] = useState<Cash[]>([]);
  const [values, setValues] = useState({
    paymentMethod: "PIX",
    cashRegisterId: "",
    receivedAt: new Date().toISOString().slice(0, 16),
  });
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([
      request<PaginatedResponse<Lookup>>(
        "/students?pageSize=100&status=ACTIVE",
      ),
      request<PaginatedResponse<Cash>>("/cash-registers?pageSize=100"),
    ]).then(([studentResponse, cashResponse]) => {
      setStudents(studentResponse.data);
      setCashRegisters(
        cashResponse.data.filter((cash) => cash.status === "OPEN"),
      );
    });
  }, [request]);
  useEffect(() => {
    if (studentId)
      void request<PaginatedResponse<Installment>>(
        `/receivables?pageSize=100&studentId=${studentId}`,
      ).then((response) =>
        setReceivables(response.data.filter((item) => item.balanceCents > 0)),
      );
  }, [request, studentId]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const selected = Object.entries(allocations)
      .filter(([, amount]) => amount > 0)
      .map(([installmentId, amount]) => ({
        installmentId,
        amountCents: Math.round(amount * 100),
      }));
    if (!confirm("Registrar este pagamento?")) return;
    try {
      const payment = await request<Payment>("/payments", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          contractId: receivables.find(
            (item) => item.id === selected[0]?.installmentId,
          )?.contract?.id,
          amountCents: selected.reduce(
            (sum, item) => sum + item.amountCents,
            0,
          ),
          paymentMethod: values.paymentMethod,
          cashRegisterId:
            values.paymentMethod === "CASH" ? values.cashRegisterId : undefined,
          receivedAt: new Date(values.receivedAt).toISOString(),
          allocations: selected,
        }),
      });
      router.push("/financial/payments");
      void payment;
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <FinancialPage
      title="Registrar pagamento"
      description="Distribua o valor entre uma ou várias parcelas."
    >
      <form className="registry-form-card" onSubmit={submit}>
        {error ? <div className="registry-error">{error}</div> : null}
        <div className="registry-form-grid">
          <label>
            <span>Aluno</span>
            <select
              required
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
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
            <span>Forma de pagamento</span>
            <select
              value={values.paymentMethod}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  paymentMethod: event.target.value,
                }))
              }
            >
              {paymentMethods.map((method) => (
                <option value={method} key={method}>
                  {label(method)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Recebido em</span>
            <input
              type="datetime-local"
              value={values.receivedAt}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  receivedAt: event.target.value,
                }))
              }
            />
          </label>
          {values.paymentMethod === "CASH" ? (
            <label>
              <span>Caixa aberto</span>
              <select
                required
                value={values.cashRegisterId}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    cashRegisterId: event.target.value,
                  }))
                }
              >
                <option value="">Selecione</option>
                {cashRegisters.map((cash) => (
                  <option value={cash.id} key={cash.id}>
                    {cash.unit.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="plan-service-picker">
          {receivables.map((item) => (
            <label key={item.id}>
              <span>
                <strong>
                  {item.contract?.contractNumber} · #{item.installmentNumber}
                </strong>
                <small>Saldo {money(item.balanceCents)}</small>
              </span>
              <input
                type="number"
                min="0"
                max={item.balanceCents / 100}
                step="0.01"
                value={allocations[item.id] ?? 0}
                onChange={(event) =>
                  setAllocations((current) => ({
                    ...current,
                    [item.id]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <div className="registry-form-actions">
          <Link className="button button--ghost" href="/financial/payments">
            Cancelar
          </Link>
          <button className="button button--primary">Registrar</button>
        </div>
      </form>
    </FinancialPage>
  );
}

export function CashRegistersList() {
  const { request } = useAuth();
  const [items, setItems] = useState<Cash[]>([]);
  const [units, setUnits] = useState<Lookup[]>([]);
  const [unitId, setUnitId] = useState("");
  const load = useCallback(
    () =>
      request<PaginatedResponse<Cash>>("/cash-registers?pageSize=100").then(
        (response) => setItems(response.data),
      ),
    [request],
  );
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void Promise.all([
          load(),
          request<PaginatedResponse<Lookup>>("/units?pageSize=100&active=true"),
        ]).then(([, response]) => {
          setUnits(response.data);
          setUnitId(response.data[0]?.id ?? "");
        }),
      0,
    );
    return () => clearTimeout(timer);
  }, [load, request]);
  return (
    <FinancialPage
      title="Caixas"
      description="Abertura, movimentos, conferência e fechamento."
    >
      <form
        className="registry-form-card financial-inline-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const opening = Number(prompt("Saldo inicial (R$):", "0"));
          if (confirm("Abrir caixa nesta unidade?")) {
            await request("/cash-registers/open", {
              method: "POST",
              body: JSON.stringify({
                unitId,
                openingBalanceCents: Math.round(opening * 100),
              }),
            });
            await load();
          }
        }}
      >
        <select
          required
          value={unitId}
          onChange={(event) => setUnitId(event.target.value)}
        >
          {units.map((unit) => (
            <option value={unit.id} key={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
        <button className="button button--primary">Abrir caixa</button>
      </form>
      <section className="registry-panel financial-table">
        {items.map((item) => (
          <Link
            className="financial-row"
            href={`/financial/cash-registers/${item.id}`}
            key={item.id}
          >
            <strong>{item.unit.name}</strong>
            <span>{date(item.openedAt, true)}</span>
            <strong>{money(item.expectedBalanceCents)}</strong>
            <Badge value={item.status} />
            <span>Detalhar →</span>
          </Link>
        ))}
      </section>
    </FinancialPage>
  );
}

export function CashRegisterDetail() {
  const { id } = useParams<{ id: string }>();
  const { request } = useAuth();
  const [cash, setCash] = useState<Cash | null>(null);
  const load = useCallback(
    () => request<Cash>(`/cash-registers/${id}`).then(setCash),
    [id, request],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (!cash)
    return (
      <FinancialPage title="Caixa" description="Carregando…">
        <span />
      </FinancialPage>
    );
  async function movement(action: string) {
    const amount = Number(prompt("Valor (R$):"));
    const reason = prompt("Motivo:");
    if (amount && reason && confirm("Confirmar movimento?")) {
      await request(`/cash-registers/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ amountCents: Math.round(amount * 100), reason }),
      });
      await load();
    }
  }
  return (
    <FinancialPage
      title={`Caixa · ${cash.unit.name}`}
      description={`Aberto em ${date(cash.openedAt, true)}`}
      actions={
        cash.status === "OPEN" ? (
          <>
            <button
              className="button button--ghost"
              onClick={() => void movement("supply")}
            >
              Suprir
            </button>
            <button
              className="button button--ghost"
              onClick={() => void movement("withdrawal")}
            >
              Retirar
            </button>
            <button
              className="button button--primary"
              onClick={async () => {
                const counted = Number(
                  prompt(
                    "Saldo contado (R$):",
                    String(cash.expectedBalanceCents / 100),
                  ),
                );
                if (Number.isFinite(counted) && confirm("Fechar caixa?")) {
                  await request(`/cash-registers/${id}/close`, {
                    method: "POST",
                    body: JSON.stringify({
                      countedBalanceCents: Math.round(counted * 100),
                    }),
                  });
                  await load();
                }
              }}
            >
              Fechar
            </button>
          </>
        ) : undefined
      }
    >
      <section className="process-summary-grid">
        {[
          ["Inicial", cash.openingBalanceCents],
          ["Esperado", cash.expectedBalanceCents],
          ["Contado", cash.countedBalanceCents],
          ["Diferença", cash.differenceCents],
        ].map(([title, value]) => (
          <article className="process-card" key={String(title)}>
            <span>{title}</span>
            <strong>{money(value as number | null)}</strong>
          </article>
        ))}
      </section>
      <section className="process-card">
        <div className="process-card__header">
          <div>
            <span>Livro caixa</span>
            <h2>Movimentos</h2>
          </div>
          <Badge value={cash.status} />
        </div>
        <div className="financial-table">
          {cash.movements?.map((item) => (
            <div className="financial-row" key={item.id}>
              <strong>{label(item.type)}</strong>
              <span>{item.description}</span>
              <strong>{money(item.amountCents)}</strong>
              <span>{date(item.createdAt, true)}</span>
            </div>
          ))}
        </div>
      </section>
    </FinancialPage>
  );
}

export function ExpensesList() {
  const { request } = useAuth();
  const [items, setItems] = useState<Expense[]>([]);
  const [cash, setCash] = useState<Cash | null>(null);
  const load = useCallback(
    () =>
      request<PaginatedResponse<Expense>>("/expenses?pageSize=100").then(
        (response) => setItems(response.data),
      ),
    [request],
  );
  useEffect(() => {
    void load();
    void request<Cash | null>("/cash-registers/current").then(setCash);
  }, [load, request]);
  return (
    <FinancialPage
      title="Despesas"
      description="Contas a pagar, categorias e movimentos de caixa."
      actions={
        <Link className="button button--primary" href="/financial/expenses/new">
          Nova despesa
        </Link>
      }
    >
      <section className="registry-panel financial-table">
        {items.map((item) => (
          <div className="financial-row" key={item.id}>
            <div>
              <strong>{item.description}</strong>
              <span>
                {item.category.name} · {item.unit.name}
              </span>
            </div>
            <span>{date(item.dueDate)}</span>
            <strong>{money(item.amountCents)}</strong>
            <Badge value={item.status} />
            <div className="registry-actions">
              {["PENDING", "OVERDUE"].includes(item.status) ? (
                <>
                  <button
                    onClick={async () => {
                      const method = prompt(
                        "Forma: PIX, CASH, TRANSFER…",
                        "PIX",
                      )?.toUpperCase();
                      if (
                        method &&
                        confirm("Confirmar pagamento da despesa?")
                      ) {
                        await request(`/expenses/${item.id}/pay`, {
                          method: "POST",
                          body: JSON.stringify({
                            paymentMethod: method,
                            cashRegisterId:
                              method === "CASH" ? cash?.id : undefined,
                          }),
                        });
                        await load();
                      }
                    }}
                  >
                    Pagar
                  </button>
                  <button
                    onClick={async () => {
                      const reason = prompt("Motivo do cancelamento:");
                      if (reason && confirm("Cancelar despesa?")) {
                        await request(`/expenses/${item.id}/cancel`, {
                          method: "POST",
                          body: JSON.stringify({ reason }),
                        });
                        await load();
                      }
                    }}
                  >
                    Cancelar
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </FinancialPage>
  );
}

export function ExpenseForm() {
  const { request } = useAuth();
  const router = useRouter();
  const [units, setUnits] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [values, setValues] = useState({
    unitId: "",
    categoryId: "",
    supplierName: "",
    description: "",
    amount: "",
    dueDate: "",
  });
  const [newCategory, setNewCategory] = useState("");
  useEffect(() => {
    void Promise.all([
      request<PaginatedResponse<Lookup>>("/units?pageSize=100&active=true"),
      request<Lookup[]>("/expense-categories"),
    ]).then(([unitResponse, categoryResponse]) => {
      setUnits(unitResponse.data);
      setCategories(categoryResponse);
      setValues((current) => ({
        ...current,
        unitId: unitResponse.data[0]?.id ?? "",
        categoryId: categoryResponse[0]?.id ?? "",
      }));
    });
  }, [request]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await request("/expenses", {
      method: "POST",
      body: JSON.stringify({
        unitId: values.unitId,
        categoryId: values.categoryId,
        supplierName: values.supplierName || undefined,
        description: values.description,
        amountCents: Math.round(Number(values.amount) * 100),
        dueDate: new Date(values.dueDate).toISOString(),
      }),
    });
    router.push("/financial/expenses");
  }
  return (
    <FinancialPage
      title="Nova despesa"
      description="Cadastre a obrigação antes de efetuar o pagamento."
    >
      <form className="registry-form-card" onSubmit={submit}>
        <div className="registry-form-grid">
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
          <label>
            <span>Categoria</span>
            <select
              required
              value={values.categoryId}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  categoryId: event.target.value,
                }))
              }
            >
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Fornecedor</span>
            <input
              value={values.supplierName}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  supplierName: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Valor (R$)</span>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={values.amount}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Vencimento</span>
            <input
              required
              type="date"
              value={values.dueDate}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  dueDate: event.target.value,
                }))
              }
            />
          </label>
          <label className="registry-field--wide">
            <span>Descrição</span>
            <input
              required
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="financial-inline-form">
          <input
            placeholder="Nova categoria"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
          />
          <button
            type="button"
            onClick={async () => {
              if (!newCategory) return;
              const category = await request<Lookup>("/expense-categories", {
                method: "POST",
                body: JSON.stringify({ name: newCategory }),
              });
              setCategories((current) => [...current, category]);
              setValues((current) => ({ ...current, categoryId: category.id }));
              setNewCategory("");
            }}
          >
            Adicionar categoria
          </button>
        </div>
        <div className="registry-form-actions">
          <Link className="button button--ghost" href="/financial/expenses">
            Cancelar
          </Link>
          <button className="button button--primary">Salvar</button>
        </div>
      </form>
    </FinancialPage>
  );
}

export function FinancialReports() {
  const { request } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reports, setReports] = useState<Record<string, unknown[]>>({});
  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (from) query.set("from", new Date(from).toISOString());
    if (to) query.set("to", new Date(to).toISOString());
    const names = [
      "receivables",
      "overdue",
      "payments",
      "cash-flow",
      "expenses",
      "revenue-by-service",
      "revenue-by-unit",
    ];
    const values = await Promise.all(
      names.map((name) =>
        request<unknown[]>(`/financial/reports/${name}?${query}`),
      ),
    );
    setReports(
      Object.fromEntries(names.map((name, index) => [name, values[index]])),
    );
  }, [from, request, to]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <FinancialPage
      title="Relatórios financeiros"
      description="Dados filtrados por período no tenant ativo."
    >
      <section className="schedule-filters exam-filters">
        <label>
          <span>De</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          <span>Até</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button onClick={() => void load()}>Aplicar filtros</button>
      </section>
      <section className="financial-report-grid">
        {Object.entries(reports).map(([name, rows]) => (
          <article className="process-card" key={name}>
            <span>Relatório</span>
            <strong>{label(name.toUpperCase())}</strong>
            <small>{rows.length} registros no período</small>
          </article>
        ))}
      </section>
    </FinancialPage>
  );
}
