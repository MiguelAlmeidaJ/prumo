import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  FinancialServiceCategory,
  MembershipRole,
  PaymentMethod,
  RegistryStatus,
  TenantStatus,
} from "@prisma/client";
import type { AuthResponse } from "@prumo/contracts";
import { hash } from "bcrypt";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";
import { AutomaticChargeService } from "../src/financial/reports-eligibility.service";

const EMAIL = "financial-e2e@prumo.local";
const PASSWORD = "FinancialE2E@123";
const SLUGS = ["financial-e2e-primary", "financial-e2e-secondary"];

describe("Financeiro multi-tenant (e2e)", () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let automaticCharge: AutomaticChargeService;
  let tenantId: string;
  let otherTenantId: string;
  let token: string;
  let otherToken: string;
  let userId: string;
  let studentId: string;
  let otherStudentId: string;
  let unitId: string;
  let otherUnitId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    automaticCharge = app.get(AutomaticChargeService);
    await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    const [tenant, other] = await Promise.all(
      SLUGS.map((slug, index) =>
        prisma.tenant.create({
          data: {
            slug,
            name: `Financeiro ${index + 1}`,
            status: TenantStatus.ACTIVE,
          },
        }),
      ),
    );
    tenantId = tenant.id;
    otherTenantId = other.id;
    const user = await prisma.user.create({
      data: {
        name: "Financeiro E2E",
        email: EMAIL,
        passwordHash: await hash(PASSWORD, 10),
        memberships: {
          create: [
            {
              tenantId,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2025-01-01T00:00:00.000Z"),
            },
            {
              tenantId: otherTenantId,
              role: MembershipRole.TENANT_OWNER,
              createdAt: new Date("2025-01-02T00:00:00.000Z"),
            },
          ],
        },
      },
    });
    userId = user.id;
  }, 30_000);

  beforeEach(async () => {
    const where = { tenantId: { in: [tenantId, otherTenantId] } };
    await prisma.cashMovement.deleteMany({ where });
    await prisma.paymentRefund.deleteMany({ where });
    await prisma.paymentAllocation.deleteMany({ where });
    await prisma.payment.deleteMany({ where });
    await prisma.receivableInstallment.deleteMany({ where });
    await prisma.contractAdjustment.deleteMany({ where });
    await prisma.studentContractItem.deleteMany({ where });
    await prisma.studentContract.deleteMany({ where });
    await prisma.servicePlanItem.deleteMany({ where });
    await prisma.servicePlan.deleteMany({ where });
    await prisma.service.deleteMany({ where });
    await prisma.expense.deleteMany({ where });
    await prisma.expenseCategory.deleteMany({ where });
    await prisma.cashRegister.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.tenantFinancialSettings.deleteMany({ where });
    await prisma.schoolUnit.deleteMany({ where });
    await prisma.student.deleteMany({ where });

    const [unit, otherUnit] = await Promise.all([
      prisma.schoolUnit.create({
        data: {
          tenantId,
          name: "Unidade Financeira",
          phone: "1133330000",
          email: "financeiro@e2e.local",
          address: "Rua Financeira, 1",
          openingTime: "07:00",
          closingTime: "22:00",
        },
      }),
      prisma.schoolUnit.create({
        data: {
          tenantId: otherTenantId,
          name: "Unidade Externa",
          phone: "1133339999",
          email: "externa-fin@e2e.local",
          address: "Rua Externa, 2",
          openingTime: "07:00",
          closingTime: "22:00",
        },
      }),
    ]);
    unitId = unit.id;
    otherUnitId = otherUnit.id;
    const [student, otherStudent] = await Promise.all([
      prisma.student.create({
        data: {
          tenantId,
          name: "Aluno Financeiro",
          cpf: "40000000001",
          status: RegistryStatus.ACTIVE,
        },
      }),
      prisma.student.create({
        data: {
          tenantId: otherTenantId,
          name: "Aluno Externo",
          cpf: "40000000002",
          status: RegistryStatus.ACTIVE,
        },
      }),
    ]);
    studentId = student.id;
    otherStudentId = otherStudent.id;
    await Promise.all([
      prisma.tenantFinancialSettings.create({ data: { tenantId } }),
      prisma.tenantFinancialSettings.create({
        data: { tenantId: otherTenantId },
      }),
    ]);
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(HttpStatus.OK);
    const session = login.body as AuthResponse;
    token = session.accessToken;
    const selected = await request(app.getHttpServer())
      .post("/api/auth/select-tenant")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        tenantId: otherTenantId,
        refreshToken: session.refreshToken,
      })
      .expect(HttpStatus.OK);
    otherToken = (selected.body as AuthResponse).accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
      await prisma.user.deleteMany({ where: { email: EMAIL } });
    }
    if (app) await app.close();
  });

  const auth = (accessToken = token) => ({
    Authorization: `Bearer ${accessToken}`,
  });

  async function createService(
    code: string,
    price = 10_000,
    category: FinancialServiceCategory = FinancialServiceCategory.ENROLLMENT,
  ) {
    const response = await request(app.getHttpServer())
      .post("/api/services")
      .set(auth())
      .send({
        code,
        name: `Serviço ${code}`,
        category,
        defaultPriceCents: price,
      })
      .expect(HttpStatus.CREATED);
    return response.body as { id: string; active: boolean };
  }

  async function createActivePlan(serviceId: string) {
    const created = await request(app.getHttpServer())
      .post("/api/service-plans")
      .set(auth())
      .send({
        name: "Plano completo",
        items: [
          {
            serviceId,
            quantity: 3,
            unitPriceCents: 10_000,
            discountCents: 1_000,
          },
        ],
      })
      .expect(HttpStatus.CREATED);
    const plan = created.body as { id: string; totalPriceCents: number };
    expect(plan.totalPriceCents).toBe(29_000);
    await request(app.getHttpServer())
      .post(`/api/service-plans/${plan.id}/activate`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    return plan.id;
  }

  async function createContract(planId: string) {
    const response = await request(app.getHttpServer())
      .post(`/api/students/${studentId}/contracts`)
      .set(auth())
      .send({
        unitId,
        planId,
        contractNumber: `FIN-${Date.now()}`,
        discountCents: 1_000,
        surchargeCents: 500,
        items: [],
      })
      .expect(HttpStatus.CREATED);
    const contract = response.body as { id: string; totalCents: number };
    expect(contract.totalCents).toBe(28_500);
    await request(app.getHttpServer())
      .post(`/api/contracts/${contract.id}/activate`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    return contract;
  }

  async function createPendingPayment(code: string) {
    const service = await createService(code);
    const contract = await createContract(await createActivePlan(service.id));
    const generated = await request(app.getHttpServer())
      .post(`/api/contracts/${contract.id}/installments`)
      .set(auth())
      .send({
        quantity: 1,
        firstDueDate: "2099-02-10T00:00:00.000Z",
      })
      .expect(HttpStatus.CREATED);
    const installment = (
      generated.body as Array<{ id: string; balanceCents: number }>
    )[0];
    const created = await request(app.getHttpServer())
      .post("/api/payments")
      .set(auth())
      .send({
        studentId,
        contractId: contract.id,
        amountCents: installment.balanceCents,
        paymentMethod: PaymentMethod.PIX,
        receivedAt: new Date().toISOString(),
        allocations: [
          {
            installmentId: installment.id,
            amountCents: installment.balanceCents,
          },
        ],
      })
      .expect(HttpStatus.CREATED);
    return {
      paymentId: (created.body as { id: string }).id,
      contractId: contract.id,
      installmentId: installment.id,
      amountCents: installment.balanceCents,
    };
  }

  it("valida serviço inativo, plano sem itens e cálculo do plano", async () => {
    const service = await createService("MAT");
    await request(app.getHttpServer())
      .patch(`/api/services/${service.id}/status`)
      .set(auth())
      .send({ active: false })
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .post("/api/service-plans")
      .set(auth())
      .send({
        name: "Inválido",
        items: [{ serviceId: service.id, quantity: 1 }],
      })
      .expect(HttpStatus.NOT_FOUND);
    const empty = await request(app.getHttpServer())
      .post("/api/service-plans")
      .set(auth())
      .send({ name: "Sem itens", items: [] })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/service-plans/${(empty.body as { id: string }).id}/activate`)
      .set(auth())
      .expect(HttpStatus.CONFLICT);

    const active = await createService("CURSO");
    await createActivePlan(active.id);
  });

  it("isola tenants, valida vínculos e gera parcelas com arredondamento", async () => {
    const service = await createService("PACOTE");
    const planId = await createActivePlan(service.id);
    await request(app.getHttpServer())
      .post(`/api/students/${studentId}/contracts`)
      .set(auth())
      .send({
        unitId: otherUnitId,
        planId,
        contractNumber: "CROSS",
        items: [],
      })
      .expect(HttpStatus.NOT_FOUND);
    const contract = await createContract(planId);
    const installments = await request(app.getHttpServer())
      .post(`/api/contracts/${contract.id}/installments`)
      .set(auth())
      .send({
        quantity: 4,
        firstDueDate: "2099-01-10T00:00:00.000Z",
      })
      .expect(HttpStatus.CREATED);
    const amounts = (
      installments.body as Array<{ originalAmountCents: number }>
    ).map((item) => item.originalAmountCents);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(28_500);
    expect(amounts.at(-1)).toBe(7_125);
    await request(app.getHttpServer())
      .get(`/api/contracts/${contract.id}`)
      .set(auth(otherToken))
      .expect(HttpStatus.NOT_FOUND);
    await request(app.getHttpServer())
      .get(`/api/students/${otherStudentId}/contracts`)
      .set(auth())
      .expect(HttpStatus.NOT_FOUND);
  });

  it("processa pagamentos parciais e múltiplos, caixa, estorno e fechamento", async () => {
    const service = await createService("RECEB");
    const contract = await createContract(await createActivePlan(service.id));
    const generated = await request(app.getHttpServer())
      .post(`/api/contracts/${contract.id}/installments`)
      .set(auth())
      .send({
        quantity: 3,
        firstDueDate: "2099-02-10T00:00:00.000Z",
      })
      .expect(HttpStatus.CREATED);
    const installments = generated.body as Array<{
      id: string;
      balanceCents: number;
    }>;
    await request(app.getHttpServer())
      .post("/api/payments")
      .set(auth())
      .send({
        studentId,
        contractId: contract.id,
        amountCents: installments[0].balanceCents + 1,
        paymentMethod: "PIX",
        receivedAt: new Date().toISOString(),
        allocations: [
          {
            installmentId: installments[0].id,
            amountCents: installments[0].balanceCents + 1,
          },
        ],
      })
      .expect(HttpStatus.CONFLICT);
    await request(app.getHttpServer())
      .post("/api/payments")
      .set(auth())
      .send({
        studentId,
        contractId: contract.id,
        amountCents: 1_000,
        paymentMethod: "CASH",
        receivedAt: new Date().toISOString(),
        allocations: [
          { installmentId: installments[0].id, amountCents: 1_000 },
        ],
      })
      .expect(HttpStatus.CONFLICT);
    const opened = await request(app.getHttpServer())
      .post("/api/cash-registers/open")
      .set(auth())
      .send({ unitId, openingBalanceCents: 5_000 })
      .expect(HttpStatus.CREATED);
    const cashId = (opened.body as { id: string }).id;
    const amount = installments[0].balanceCents + 2_000;
    const paymentResponse = await request(app.getHttpServer())
      .post("/api/payments")
      .set(auth())
      .send({
        studentId,
        contractId: contract.id,
        amountCents: amount,
        paymentMethod: PaymentMethod.CASH,
        cashRegisterId: cashId,
        receivedAt: new Date().toISOString(),
        allocations: [
          {
            installmentId: installments[0].id,
            amountCents: installments[0].balanceCents,
          },
          { installmentId: installments[1].id, amountCents: 2_000 },
        ],
      })
      .expect(HttpStatus.CREATED);
    const paymentId = (paymentResponse.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/api/payments/${paymentId}/confirm`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/payments/${paymentId}/confirm`)
      .set(auth())
      .expect(HttpStatus.CONFLICT);
    const second = await request(app.getHttpServer())
      .get(`/api/receivables/${installments[1].id}`)
      .set(auth())
      .expect(HttpStatus.OK);
    expect((second.body as { status: string }).status).toBe("PARTIALLY_PAID");
    await request(app.getHttpServer())
      .post(`/api/payments/${paymentId}/refunds`)
      .set(auth())
      .send({ amountCents: 1_000, reason: "Correção parcial" })
      .expect(HttpStatus.CREATED);
    const current = await request(app.getHttpServer())
      .get(`/api/cash-registers/${cashId}`)
      .set(auth())
      .expect(HttpStatus.OK);
    const expected = (current.body as { expectedBalanceCents: number })
      .expectedBalanceCents;
    const closed = await request(app.getHttpServer())
      .post(`/api/cash-registers/${cashId}/close`)
      .set(auth())
      .send({ countedBalanceCents: expected - 200 })
      .expect(HttpStatus.CREATED);
    expect((closed.body as { differenceCents: number }).differenceCents).toBe(
      -200,
    );
    await request(app.getHttpServer())
      .post(`/api/cash-registers/${cashId}/supply`)
      .set(auth())
      .send({ amountCents: 100, reason: "Depois do fechamento" })
      .expect(HttpStatus.CONFLICT);
  });

  it("aceita somente uma abertura concorrente de caixa por unidade e usuário", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post("/api/cash-registers/open")
          .set(auth())
          .send({ unitId, openingBalanceCents: 5_000 }),
      ),
    );

    expect(attempts.map((response) => response.status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    expect(
      await prisma.cashRegister.count({
        where: { tenantId, unitId, status: "OPEN" },
      }),
    ).toBe(1);
  });

  it("serializa confirmação e cancelamento concorrentes do mesmo pagamento", async () => {
    const competing = await createPendingPayment("RACEPAY");

    const attempts = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/payments/${competing.paymentId}/confirm`)
        .set(auth()),
      request(app.getHttpServer())
        .post(`/api/payments/${competing.paymentId}/cancel`)
        .set(auth())
        .send({ reason: "Cancelamento concorrente" }),
    ]);

    expect(attempts.map((response) => response.status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    const competingPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: competing.paymentId },
    });
    const competingInstallment =
      await prisma.receivableInstallment.findUniqueOrThrow({
        where: { id: competing.installmentId },
      });
    expect(["CONFIRMED", "CANCELLED"]).toContain(competingPayment.status);
    expect(competingInstallment.amountPaidCents).toBe(
      competingPayment.status === "CONFIRMED" ? competing.amountCents : 0,
    );
    expect(
      await prisma.auditLog.count({
        where: {
          tenantId,
          entityType: "Payment",
          entityId: competing.paymentId,
          action: { in: ["CONFIRMED", "CANCELLED"] },
        },
      }),
    ).toBe(1);

    const confirming = await createPendingPayment("RACECONFIRM");
    const confirmations = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post(`/api/payments/${confirming.paymentId}/confirm`)
          .set(auth()),
      ),
    );
    expect(confirmations.map((response) => response.status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    const confirmedInstallment =
      await prisma.receivableInstallment.findUniqueOrThrow({
        where: { id: confirming.installmentId },
      });
    expect(confirmedInstallment.amountPaidCents).toBe(confirming.amountCents);

    const cancelling = await createPendingPayment("RACECANCEL");
    const cancellations = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post(`/api/payments/${cancelling.paymentId}/cancel`)
          .set(auth())
          .send({ reason: "Cancelamento concorrente" }),
      ),
    );
    expect(cancellations.map((response) => response.status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    const cancelledPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: cancelling.paymentId },
    });
    const cancelledInstallment =
      await prisma.receivableInstallment.findUniqueOrThrow({
        where: { id: cancelling.installmentId },
      });
    expect(cancelledPayment.status).toBe("CANCELLED");
    expect(cancelledInstallment.amountPaidCents).toBe(0);

    const contractRace = await createPendingPayment("RACECONTRACT");
    const contractAttempts = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/payments/${contractRace.paymentId}/confirm`)
        .set(auth()),
      request(app.getHttpServer())
        .post(`/api/contracts/${contractRace.contractId}/cancel`)
        .set(auth())
        .send({ reason: "Cancelamento concorrente do contrato" }),
    ]);
    expect(contractAttempts.map((response) => response.status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    const [contractAfterRace, paymentAfterRace] = await Promise.all([
      prisma.studentContract.findUniqueOrThrow({
        where: { id: contractRace.contractId },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { id: contractRace.paymentId },
      }),
    ]);
    expect(
      contractAfterRace.status === "CANCELLED" &&
        paymentAfterRace.status === "CONFIRMED",
    ).toBe(false);
  });

  it("serializa geração, estorno, despesa e fechamento concorrentes", async () => {
    const service = await createService("RACEPHASE2");
    const contract = await createContract(await createActivePlan(service.id));
    const installmentRequests = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post(`/api/contracts/${contract.id}/installments`)
          .set(auth())
          .send({
            quantity: 1,
            firstDueDate: "2099-03-10T00:00:00.000Z",
          }),
      ),
    );
    expect(
      installmentRequests.map((response) => response.status).sort(),
    ).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);
    expect(
      await prisma.receivableInstallment.count({
        where: { tenantId, contractId: contract.id },
      }),
    ).toBe(1);

    const refundable = await createPendingPayment("RACEREFUND");
    await request(app.getHttpServer())
      .post(`/api/payments/${refundable.paymentId}/confirm`)
      .set(auth())
      .expect(HttpStatus.CREATED);
    const refunds = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post(`/api/payments/${refundable.paymentId}/refunds`)
          .set(auth())
          .send({
            amountCents: refundable.amountCents,
            reason: "Estorno concorrente integral",
          }),
      ),
    );
    expect(refunds.map((response) => response.status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    const refundedPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: refundable.paymentId },
    });
    const refundedInstallment =
      await prisma.receivableInstallment.findUniqueOrThrow({
        where: { id: refundable.installmentId },
      });
    expect(refundedPayment.status).toBe("REFUNDED");
    expect(refundedPayment.refundedAmountCents).toBe(refundable.amountCents);
    expect(refundedInstallment.amountPaidCents).toBe(0);
    expect(
      await prisma.paymentRefund.count({
        where: { tenantId, paymentId: refundable.paymentId },
      }),
    ).toBe(1);

    const category = await request(app.getHttpServer())
      .post("/api/expense-categories")
      .set(auth())
      .send({ name: "Concorrência" })
      .expect(HttpStatus.CREATED);
    const expense = await request(app.getHttpServer())
      .post("/api/expenses")
      .set(auth())
      .send({
        unitId,
        categoryId: (category.body as { id: string }).id,
        description: "Despesa concorrente",
        amountCents: 1_500,
        dueDate: new Date().toISOString(),
      })
      .expect(HttpStatus.CREATED);
    const expenseId = (expense.body as { id: string }).id;
    const expenseRequests = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/expenses/${expenseId}/pay`)
        .set(auth())
        .send({ paymentMethod: PaymentMethod.PIX }),
      request(app.getHttpServer())
        .post(`/api/expenses/${expenseId}/cancel`)
        .set(auth())
        .send({ reason: "Cancelamento concorrente" }),
    ]);
    expect(expenseRequests.map((response) => response.status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    const finalExpense = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
    });
    expect(["PAID", "CANCELLED"]).toContain(finalExpense.status);

    const cash = await request(app.getHttpServer())
      .post("/api/cash-registers/open")
      .set(auth())
      .send({ unitId, openingBalanceCents: 2_000 })
      .expect(HttpStatus.CREATED);
    const cashId = (cash.body as { id: string }).id;
    const closings = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer())
          .post(`/api/cash-registers/${cashId}/close`)
          .set(auth())
          .send({ countedBalanceCents: 2_000 }),
      ),
    );
    expect(closings.map((response) => response.status).sort()).toEqual([
      HttpStatus.CREATED,
      HttpStatus.CONFLICT,
    ]);
    expect(
      await prisma.cashMovement.count({
        where: { tenantId, cashRegisterId: cashId, type: "CLOSING" },
      }),
    ).toBe(1);
  });

  it("paga despesa em dinheiro, bloqueia edição e entrega relatórios auditados", async () => {
    const category = await request(app.getHttpServer())
      .post("/api/expense-categories")
      .set(auth())
      .send({ name: "Operacional" })
      .expect(HttpStatus.CREATED);
    const expense = await request(app.getHttpServer())
      .post("/api/expenses")
      .set(auth())
      .send({
        unitId,
        categoryId: (category.body as { id: string }).id,
        description: "Material de escritório",
        amountCents: 2_500,
        dueDate: new Date().toISOString(),
      })
      .expect(HttpStatus.CREATED);
    const expenseId = (expense.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/api/expenses/${expenseId}/pay`)
      .set(auth())
      .send({ paymentMethod: "CASH" })
      .expect(HttpStatus.CONFLICT);
    const cash = await request(app.getHttpServer())
      .post("/api/cash-registers/open")
      .set(auth())
      .send({ unitId, openingBalanceCents: 5_000 })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/expenses/${expenseId}/pay`)
      .set(auth())
      .send({
        paymentMethod: "CASH",
        cashRegisterId: (cash.body as { id: string }).id,
      })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .patch(`/api/expenses/${expenseId}`)
      .set(auth())
      .send({ description: "Alterada" })
      .expect(HttpStatus.CONFLICT);
    await request(app.getHttpServer())
      .get("/api/financial/dashboard")
      .set(auth())
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .get("/api/financial/reports/expenses")
      .query({ unitId })
      .set(auth())
      .expect(HttpStatus.OK);
    expect(
      await prisma.auditLog.count({ where: { tenantId } }),
    ).toBeGreaterThanOrEqual(4);
  });

  it("aplica tolerância de inadimplência e cobrança automática idempotente", async () => {
    const retest = await createService(
      "RETESTE",
      8_000,
      FinancialServiceCategory.RETEST,
    );
    const contract = await createContract(await createActivePlan(retest.id));
    const installments = await request(app.getHttpServer())
      .post(`/api/contracts/${contract.id}/installments`)
      .set(auth())
      .send({
        quantity: 1,
        firstDueDate: "2020-01-01T00:00:00.000Z",
      })
      .expect(HttpStatus.CREATED);
    const process = await prisma.studentLicenseProcess.create({
      data: {
        tenantId,
        studentId,
        unitId,
        processType: "FIRST_LICENSE",
        status: "IN_PROGRESS",
        createdByUserId: userId,
      },
    });
    await prisma.studentContract.update({
      where: { id: contract.id },
      data: { processId: process.id },
    });
    await request(app.getHttpServer())
      .patch("/api/financial/settings")
      .set(auth())
      .send({
        blockSchedulingWithDebt: true,
        debtToleranceCents:
          (installments.body as Array<{ balanceCents: number }>)[0]
            .balanceCents - 1,
        autoChargeExamRetest: true,
      })
      .expect(HttpStatus.OK);
    const blocked = await request(app.getHttpServer())
      .get(`/api/financial/eligibility/${studentId}`)
      .set(auth())
      .expect(HttpStatus.OK);
    expect((blocked.body as { allowed: boolean }).allowed).toBe(false);
    await request(app.getHttpServer())
      .patch("/api/financial/settings")
      .set(auth())
      .send({ debtToleranceCents: 99_999 })
      .expect(HttpStatus.OK);
    const allowed = await request(app.getHttpServer())
      .get(`/api/financial/eligibility/${studentId}`)
      .set(auth())
      .expect(HttpStatus.OK);
    expect((allowed.body as { allowed: boolean }).allowed).toBe(true);

    const examId = crypto.randomUUID();
    const charge = {
      tenantId,
      actorUserId: userId,
      examId,
      studentId,
      processId: process.id,
      attemptNumber: 2,
    };
    await Promise.all([
      automaticCharge.chargeExamRetest(charge),
      automaticCharge.chargeExamRetest(charge),
    ]);
    expect(
      await prisma.studentContractItem.count({
        where: { tenantId, sourceType: "EXAM", sourceId: examId },
      }),
    ).toBe(1);
  });
});
