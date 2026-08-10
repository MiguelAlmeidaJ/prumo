import {
  BillingCycle,
  MembershipRole,
  NotificationChannel,
  PrismaClient,
  RegistryStatus,
  StudentDocumentType,
  StudentProcessStatus,
  TenantStatus,
  TenantSubscriptionStatus,
  Weekday,
} from "@prisma/client";
import { compare, hash } from "bcrypt";
import { DEFAULT_REMINDER_RULES, runReferenceSeed } from "./seed/reference";

const prisma = new PrismaClient();

const DEMO_TENANT_SLUG = "autoescola-demonstracao";
const DEMO_ADMIN_EMAIL = "admin@prumo.local";
const DEVELOPMENT_PASSWORD = "PrumoDev@123";

function getRounds(): number {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
    throw new Error("BCRYPT_ROUNDS deve ser um inteiro entre 10 e 15.");
  }

  return rounds;
}

async function seedDemo(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "O seed de demonstração só pode ser executado com NODE_ENV=development.",
    );
  }
  const configuredPassword = process.env.SEED_ADMIN_PASSWORD;
  const password = configuredPassword ?? DEVELOPMENT_PASSWORD;
  const { basicPlan, proPlan, templateIds } = await runReferenceSeed(prisma);

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    create: {
      name: "Autoescola Demonstração",
      slug: DEMO_TENANT_SLUG,
      status: TenantStatus.ACTIVE,
    },
    update: {
      name: "Autoescola Demonstração",
      status: TenantStatus.ACTIVE,
    },
  });

  const suspendedTenant = await prisma.tenant.upsert({
    where: { slug: "autoescola-horizonte" },
    create: {
      name: "Autoescola Horizonte",
      slug: "autoescola-horizonte",
      document: "98765432000110",
      status: TenantStatus.SUSPENDED,
      suspendedAt: new Date(),
      suspensionReason: "Tenant de demonstração para validação do console.",
    },
    update: {
      name: "Autoescola Horizonte",
      status: TenantStatus.SUSPENDED,
      suspendedAt: new Date(),
      suspensionReason: "Tenant de demonstração para validação do console.",
    },
  });

  await Promise.all([
    prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id },
      update: {},
    }),
    prisma.tenantSettings.upsert({
      where: { tenantId: suspendedTenant.id },
      create: { tenantId: suspendedTenant.id },
      update: {},
    }),
    prisma.tenantFinancialSettings.upsert({
      where: { tenantId: suspendedTenant.id },
      create: { tenantId: suspendedTenant.id },
      update: {},
    }),
  ]);

  async function ensureSubscription(
    tenantId: string,
    planId: string,
    status: TenantSubscriptionStatus,
  ): Promise<void> {
    const existing = await prisma.tenantSubscription.findFirst({
      where: { tenantId, planId },
      orderBy: { createdAt: "asc" },
    });
    const startsAt = new Date("2026-01-01T00:00:00.000Z");
    const currentPeriodStartsAt = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );
    const currentPeriodEndsAt = new Date(
      Date.UTC(
        currentPeriodStartsAt.getUTCFullYear(),
        currentPeriodStartsAt.getUTCMonth() + 1,
        1,
      ),
    );
    const data = {
      status,
      billingCycle: BillingCycle.MONTHLY,
      startsAt,
      currentPeriodStartsAt,
      currentPeriodEndsAt,
    };
    if (existing) {
      await prisma.tenantSubscription.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.tenantSubscription.create({
        data: { tenantId, planId, ...data },
      });
    }
  }
  await ensureSubscription(
    tenant.id,
    proPlan.id,
    TenantSubscriptionStatus.ACTIVE,
  );
  await ensureSubscription(
    suspendedTenant.id,
    basicPlan.id,
    TenantSubscriptionStatus.SUSPENDED,
  );
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { planCode: proPlan.code },
  });
  await prisma.tenant.update({
    where: { id: suspendedTenant.id },
    data: { planCode: basicPlan.code },
  });

  for (const [
    eventType,
    minutesBefore,
    templateCode,
  ] of DEFAULT_REMINDER_RULES) {
    const templateId = templateIds.get(
      `${templateCode}:${NotificationChannel.IN_APP}`,
    );
    if (!templateId) continue;
    await prisma.reminderRule.upsert({
      where: {
        tenantId_eventType_channel_minutesBefore: {
          tenantId: tenant.id,
          eventType,
          channel: NotificationChannel.IN_APP,
          minutesBefore,
        },
      },
      create: {
        tenantId: tenant.id,
        eventType,
        channel: NotificationChannel.IN_APP,
        minutesBefore,
        templateId,
        active: true,
      },
      update: { templateId },
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO_ADMIN_EMAIL },
  });
  const passwordMatches = existingUser
    ? await compare(password, existingUser.passwordHash)
    : false;
  const passwordHash =
    existingUser && passwordMatches
      ? existingUser.passwordHash
      : await hash(password, getRounds());

  const user = await prisma.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    create: {
      name: "Administrador Prumo",
      email: DEMO_ADMIN_EMAIL,
      passwordHash,
      passwordSetAt: new Date(),
      active: true,
    },
    update: {
      name: "Administrador Prumo",
      passwordHash,
      passwordSetAt: new Date(),
      active: true,
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: user.id,
      },
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: MembershipRole.TENANT_OWNER,
      active: true,
    },
    update: {
      role: MembershipRole.TENANT_OWNER,
      active: true,
    },
  });

  const student = await prisma.student.upsert({
    where: {
      tenantId_cpf: {
        tenantId: tenant.id,
        cpf: "52998224725",
      },
    },
    create: {
      tenantId: tenant.id,
      name: "Mariana Souza",
      cpf: "52998224725",
      email: "mariana@exemplo.local",
      phone: "(11) 99999-0101",
      status: RegistryStatus.ACTIVE,
    },
    update: {
      name: "Mariana Souza",
      email: "mariana@exemplo.local",
      phone: "(11) 99999-0101",
      status: RegistryStatus.ACTIVE,
    },
  });

  const studentUser = await prisma.user.upsert({
    where: { email: "mariana@exemplo.local" },
    create: {
      name: "Mariana Souza",
      email: "mariana@exemplo.local",
      passwordHash,
      passwordSetAt: new Date(),
      active: true,
    },
    update: {
      name: "Mariana Souza",
      passwordHash,
      passwordSetAt: new Date(),
      active: true,
    },
  });
  await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: studentUser.id },
    },
    create: {
      tenantId: tenant.id,
      userId: studentUser.id,
      role: MembershipRole.STUDENT,
      active: true,
    },
    update: { role: MembershipRole.STUDENT, active: true },
  });
  await prisma.student.update({
    where: { id: student.id },
    data: { userId: studentUser.id },
  });

  await prisma.studentAddress.upsert({
    where: {
      studentId_tenantId: {
        studentId: student.id,
        tenantId: tenant.id,
      },
    },
    create: {
      tenantId: tenant.id,
      studentId: student.id,
      zipCode: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
    update: {
      zipCode: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
  });

  await prisma.studentDocument.upsert({
    where: {
      tenantId_studentId_type_number: {
        tenantId: tenant.id,
        studentId: student.id,
        type: StudentDocumentType.RG,
        number: "123456789",
      },
    },
    create: {
      tenantId: tenant.id,
      studentId: student.id,
      type: StudentDocumentType.RG,
      number: "123456789",
      issuingAuthority: "SSP/SP",
    },
    update: {
      issuingAuthority: "SSP/SP",
    },
  });

  const demoProcess = await prisma.studentProcess.findFirst({
    where: {
      tenantId: tenant.id,
      studentId: student.id,
      renach: "DEMO000001",
    },
  });
  if (demoProcess) {
    await prisma.studentProcess.update({
      where: { id: demoProcess.id },
      data: {
        category: "B",
        status: StudentProcessStatus.IN_PROGRESS,
      },
    });
  } else {
    await prisma.studentProcess.create({
      data: {
        tenantId: tenant.id,
        studentId: student.id,
        category: "B",
        renach: "DEMO000001",
        status: StudentProcessStatus.IN_PROGRESS,
      },
    });
  }

  const instructor = await prisma.instructor.upsert({
    where: {
      tenantId_cpf: {
        tenantId: tenant.id,
        cpf: "11144477735",
      },
    },
    create: {
      tenantId: tenant.id,
      name: "Carlos Oliveira",
      cpf: "11144477735",
      email: "carlos@exemplo.local",
      phone: "(11) 99999-0202",
      license: "01234567890",
      licenseCategory: "AB",
      credentialNumber: "INSTR-DEMO-01",
      status: RegistryStatus.ACTIVE,
    },
    update: {
      name: "Carlos Oliveira",
      status: RegistryStatus.ACTIVE,
    },
  });

  const instructorUser = await prisma.user.upsert({
    where: { email: "carlos@exemplo.local" },
    create: {
      name: "Carlos Oliveira",
      email: "carlos@exemplo.local",
      passwordHash,
      passwordSetAt: new Date(),
      active: true,
    },
    update: {
      name: "Carlos Oliveira",
      passwordHash,
      passwordSetAt: new Date(),
      active: true,
    },
  });
  await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: instructorUser.id },
    },
    create: {
      tenantId: tenant.id,
      userId: instructorUser.id,
      role: MembershipRole.INSTRUCTOR,
      active: true,
    },
    update: { role: MembershipRole.INSTRUCTOR, active: true },
  });
  await prisma.instructor.update({
    where: { id: instructor.id },
    data: { userId: instructorUser.id },
  });

  await prisma.vehicle.upsert({
    where: {
      tenantId_plate: {
        tenantId: tenant.id,
        plate: "PRM1A23",
      },
    },
    create: {
      tenantId: tenant.id,
      plate: "PRM1A23",
      brand: "Volkswagen",
      model: "Polo",
      year: 2025,
      color: "Branco",
      renavam: "12345678901",
      category: "B",
      status: RegistryStatus.ACTIVE,
    },
    update: {
      brand: "Volkswagen",
      model: "Polo",
      year: 2025,
      status: RegistryStatus.ACTIVE,
    },
  });

  const unit = await prisma.schoolUnit.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Unidade Centro",
      },
    },
    create: {
      tenantId: tenant.id,
      name: "Unidade Centro",
      document: "12345678000199",
      phone: "(11) 3333-0101",
      email: "centro@prumo.local",
      address: "Avenida Paulista, 1000 - Bela Vista, São Paulo/SP",
      openingTime: "07:00",
      closingTime: "22:00",
      active: true,
    },
    update: {
      document: "12345678000199",
      phone: "(11) 3333-0101",
      email: "centro@prumo.local",
      address: "Avenida Paulista, 1000 - Bela Vista, São Paulo/SP",
      openingTime: "07:00",
      closingTime: "22:00",
      active: true,
    },
  });

  await prisma.tenantFinancialSettings.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      autoChargeExamRetest: false,
      autoChargeExtraLesson: false,
      blockSchedulingWithDebt: false,
      debtToleranceCents: 0,
      requireOpenCashRegisterForCashPayment: true,
      defaultFinePercentageBasisPoints: 200,
      defaultMonthlyInterestBasisPoints: 100,
    },
    update: {},
  });

  await prisma.classroom.upsert({
    where: {
      tenantId_unitId_name: {
        tenantId: tenant.id,
        unitId: unit.id,
        name: "Sala Teórica 1",
      },
    },
    create: {
      tenantId: tenant.id,
      unitId: unit.id,
      name: "Sala Teórica 1",
      capacity: 30,
      active: true,
    },
    update: {
      capacity: 30,
      active: true,
    },
  });

  const weekdays = [
    Weekday.MONDAY,
    Weekday.TUESDAY,
    Weekday.WEDNESDAY,
    Weekday.THURSDAY,
    Weekday.FRIDAY,
    Weekday.SATURDAY,
  ];
  for (const weekday of weekdays) {
    await prisma.instructorAvailability.upsert({
      where: {
        tenantId_instructorId_weekday_startsAt_endsAt: {
          tenantId: tenant.id,
          instructorId: instructor.id,
          weekday,
          startsAt: "07:00",
          endsAt: "22:00",
        },
      },
      create: {
        tenantId: tenant.id,
        instructorId: instructor.id,
        weekday,
        startsAt: "07:00",
        endsAt: "22:00",
        active: true,
      },
      update: { active: true },
    });
  }

  console.log(`Seed de demonstração concluído: ${DEMO_ADMIN_EMAIL}.`);
}

seedDemo()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
