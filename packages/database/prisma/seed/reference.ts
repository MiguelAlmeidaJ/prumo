import {
  DomainEventType,
  NotificationChannel,
  PlatformPlanStatus,
  type PrismaClient,
} from "@prisma/client";

const TEMPLATE_CODES = [
  "user-invited",
  "student-created",
  "process-created",
  "process-stage-completed",
  "document-approved",
  "document-rejected",
  "practical-lesson-created",
  "practical-lesson-rescheduled",
  "practical-lesson-cancelled",
  "practical-lesson-completed",
  "practical-lesson-reminder",
  "theoretical-class-created",
  "theoretical-class-updated",
  "theoretical-class-cancelled",
  "theoretical-class-reminder",
  "exam-scheduled",
  "exam-rescheduled",
  "exam-cancelled",
  "exam-result",
  "exam-reminder",
  "contract-activated",
  "installment-created",
  "installment-due-soon",
  "installment-overdue",
  "payment-confirmed",
  "payment-refunded",
  "document-expiring",
  "process-expiring",
] as const;

const TEMPLATE_LABELS: Partial<
  Record<(typeof TEMPLATE_CODES)[number], string>
> = {
  "practical-lesson-created": "Aula prática criada",
  "practical-lesson-rescheduled": "Aula prática reagendada",
  "practical-lesson-cancelled": "Aula prática cancelada",
  "practical-lesson-reminder": "Lembrete de aula prática",
  "theoretical-class-reminder": "Lembrete de turma teórica",
  "exam-scheduled": "Exame agendado",
  "exam-rescheduled": "Exame reagendado",
  "exam-result": "Resultado de exame disponível",
  "exam-reminder": "Lembrete de exame",
  "installment-due-soon": "Parcela próxima do vencimento",
  "installment-overdue": "Parcela vencida",
  "payment-confirmed": "Pagamento confirmado",
  "document-rejected": "Documento rejeitado",
  "process-expiring": "Processo próximo do vencimento",
};

export const DEFAULT_REMINDER_RULES = [
  [
    DomainEventType.PRACTICAL_LESSON_CREATED,
    24 * 60,
    "practical-lesson-reminder",
  ],
  [
    DomainEventType.PRACTICAL_LESSON_CREATED,
    2 * 60,
    "practical-lesson-reminder",
  ],
  [
    DomainEventType.THEORETICAL_CLASS_CREATED,
    24 * 60,
    "theoretical-class-reminder",
  ],
  [DomainEventType.EXAM_SCHEDULED, 48 * 60, "exam-reminder"],
  [DomainEventType.INSTALLMENT_CREATED, 3 * 24 * 60, "installment-due-soon"],
  [DomainEventType.PROCESS_CREATED, 30 * 24 * 60, "process-expiring"],
] as const;

export async function runReferenceSeed(prisma: PrismaClient) {
  const licenseCategories = [
    {
      code: "ACC",
      name: "Autorização para Conduzir Ciclomotor",
      description: "Categoria para ciclomotores.",
    },
    {
      code: "A",
      name: "Categoria A",
      description: "Veículos de duas ou três rodas.",
    },
    {
      code: "B",
      name: "Categoria B",
      description: "Automóveis e utilitários leves.",
    },
    { code: "C", name: "Categoria C", description: "Veículos de carga." },
    {
      code: "D",
      name: "Categoria D",
      description: "Veículos de passageiros.",
    },
    {
      code: "E",
      name: "Categoria E",
      description: "Combinações de veículos.",
    },
  ];
  for (const category of licenseCategories) {
    await prisma.licenseCategory.upsert({
      where: { code: category.code },
      create: { ...category, active: true },
      update: { ...category, active: true },
    });
  }

  const basicPlan = await prisma.platformPlan.upsert({
    where: { code: "BASIC" },
    create: {
      code: "BASIC",
      name: "Prumo Básico",
      description: "Plano inicial para autoescolas de pequeno porte.",
      status: PlatformPlanStatus.ACTIVE,
      monthlyPriceCents: 19_900,
      annualPriceCents: 199_000,
      maxUsers: 10,
      maxStudents: 300,
      maxUnits: 1,
      maxStorageBytes: BigInt(5 * 1024 * 1024 * 1024),
      features: {
        FINANCIAL: true,
        MOBILE_APP: true,
        NOTIFICATIONS: true,
        MULTI_UNIT: false,
        ADVANCED_REPORTS: false,
        CUSTOM_BRANDING: false,
        API_ACCESS: false,
      },
    },
    update: {
      name: "Prumo Básico",
      status: PlatformPlanStatus.ACTIVE,
      monthlyPriceCents: 19_900,
    },
  });
  const proPlan = await prisma.platformPlan.upsert({
    where: { code: "PRO" },
    create: {
      code: "PRO",
      name: "Prumo Pro",
      description: "Plano completo com múltiplas unidades e relatórios.",
      status: PlatformPlanStatus.ACTIVE,
      monthlyPriceCents: 49_900,
      annualPriceCents: 499_000,
      maxUsers: 50,
      maxStudents: 2_000,
      maxUnits: 10,
      maxStorageBytes: BigInt(50 * 1024 * 1024 * 1024),
      features: {
        FINANCIAL: true,
        MOBILE_APP: true,
        NOTIFICATIONS: true,
        MULTI_UNIT: true,
        ADVANCED_REPORTS: true,
        CUSTOM_BRANDING: true,
        API_ACCESS: true,
      },
    },
    update: {
      name: "Prumo Pro",
      status: PlatformPlanStatus.ACTIVE,
      monthlyPriceCents: 49_900,
    },
  });

  await Promise.all([
    prisma.platformSetting.upsert({
      where: { key: "support.maxDurationMinutes" },
      create: {
        key: "support.maxDurationMinutes",
        value: 30,
        description: "Duração máxima da sessão de suporte em minutos.",
      },
      update: { value: 30 },
    }),
    prisma.platformSetting.upsert({
      where: { key: "security.globalMfaRecommended" },
      create: {
        key: "security.globalMfaRecommended",
        value: true,
        description: "Recomenda MFA para todos os papéis globais.",
      },
      update: { value: true },
    }),
  ]);

  const templateIds = new Map<string, string>();
  for (const code of TEMPLATE_CODES) {
    for (const channel of [
      NotificationChannel.IN_APP,
      NotificationChannel.EMAIL,
      NotificationChannel.PUSH,
    ]) {
      const label =
        TEMPLATE_LABELS[code] ??
        code
          .split("-")
          .map((part) => part[0].toUpperCase() + part.slice(1))
          .join(" ");
      const existing = await prisma.notificationTemplate.findFirst({
        where: { tenantId: null, code, channel, version: 1 },
      });
      const values = {
        subject:
          channel === NotificationChannel.EMAIL ? `Prumo | ${label}` : null,
        title: channel !== NotificationChannel.EMAIL ? label : null,
        body:
          channel === NotificationChannel.EMAIL
            ? `Olá, {{userName}}. <p>${label} na {{tenantName}}.</p><p>Acesse: {{actionUrl}}</p>`
            : `Olá, {{userName}}. ${label} na {{tenantName}}.`,
        allowedVariables: ["userName", "tenantName", "actionUrl", "eventType"],
        active: true,
      };
      const template = existing
        ? await prisma.notificationTemplate.update({
            where: { id: existing.id },
            data: values,
          })
        : await prisma.notificationTemplate.create({
            data: {
              tenantId: null,
              code,
              channel,
              version: 1,
              ...values,
            },
          });
      templateIds.set(`${code}:${channel}`, template.id);
    }
  }

  return { basicPlan, proPlan, templateIds };
}
