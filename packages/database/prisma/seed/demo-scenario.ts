import {
  AttendanceStatus,
  CampaignRecipientStatus,
  CashMovementType,
  CashRegisterStatus,
  CommunicationAudienceType,
  CommunicationCampaignStatus,
  ContractItemSourceType,
  DomainEventStatus,
  DomainEventType,
  ExamResult,
  ExamStatus,
  ExamType,
  ExpenseStatus,
  FinancialServiceCategory,
  LessonChangeRequestStatus,
  LessonChangeRequestType,
  LessonEvaluationValue,
  LessonStatus,
  LessonType,
  LicenseProcessStatus,
  LicenseProcessType,
  MembershipRole,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  ProcessDocumentStatus,
  ProcessStageStatus,
  ProcessStageType,
  ReceivableStatus,
  RegistryStatus,
  ServicePlanStatus,
  StudentContractStatus,
  StudentDocumentType,
  UserCredentialTokenType,
  VehicleOccurrenceStatus,
  VehicleOccurrenceType,
  Weekday,
} from "../../src";

const DAY_MS = 86_400_000;
const DEMO_MARKER = "[PRUMO_DEMO]";

const PROCESS_BLUEPRINTS: Record<
  LicenseProcessType,
  readonly ProcessStageType[]
> = {
  FIRST_LICENSE: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.MEDICAL_EXAM,
    ProcessStageType.PSYCHOLOGICAL_EXAM,
    ProcessStageType.THEORETICAL_COURSE,
    ProcessStageType.THEORETICAL_EXAM,
    ProcessStageType.PRACTICAL_CLASSES,
    ProcessStageType.PRACTICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
  REHABILITATION: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.MEDICAL_EXAM,
    ProcessStageType.PSYCHOLOGICAL_EXAM,
    ProcessStageType.THEORETICAL_COURSE,
    ProcessStageType.THEORETICAL_EXAM,
    ProcessStageType.PRACTICAL_CLASSES,
    ProcessStageType.PRACTICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
  CATEGORY_ADDITION: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.MEDICAL_EXAM,
    ProcessStageType.PSYCHOLOGICAL_EXAM,
    ProcessStageType.PRACTICAL_CLASSES,
    ProcessStageType.PRACTICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
  CATEGORY_CHANGE: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.MEDICAL_EXAM,
    ProcessStageType.PSYCHOLOGICAL_EXAM,
    ProcessStageType.PRACTICAL_CLASSES,
    ProcessStageType.PRACTICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
  RENEWAL: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.MEDICAL_EXAM,
    ProcessStageType.PSYCHOLOGICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
  REFRESHER: [
    ProcessStageType.REGISTRATION,
    ProcessStageType.DOCUMENT_REVIEW,
    ProcessStageType.THEORETICAL_COURSE,
    ProcessStageType.THEORETICAL_EXAM,
    ProcessStageType.LICENSE_ISSUANCE,
  ],
};

const DEMO_MINIMUM_COUNTS = {
  students: 6,
  instructors: 2,
  vehicles: 3,
  units: 2,
  processes: 5,
  lessons: 6,
  theoreticalClasses: 3,
  exams: 4,
  contracts: 2,
  receivables: 8,
  payments: 3,
  expenses: 3,
  notifications: 5,
  campaigns: 2,
} as const;

type DemoContext = {
  tenantId: string;
  ownerUserId: string;
  passwordHash: string;
};

type DemoProcess = {
  id: string;
  studentId: string;
};

function utcDate(daysFromToday: number, hour = 12, minute = 0): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysFromToday,
      hour,
      minute,
    ),
  );
}

function relativeHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function ensureUserMembership(
  prisma: PrismaClient,
  context: DemoContext,
  input: {
    name: string;
    email: string;
    role: MembershipRole;
    passwordSet?: boolean;
  },
) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      name: input.name,
      email: input.email,
      passwordHash: context.passwordHash,
      passwordSetAt: input.passwordSet === false ? null : new Date(),
      active: true,
    },
    update: {
      name: input.name,
      passwordHash: context.passwordHash,
      passwordSetAt: input.passwordSet === false ? null : new Date(),
      active: true,
    },
  });
  await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: context.tenantId, userId: user.id },
    },
    create: {
      tenantId: context.tenantId,
      userId: user.id,
      role: input.role,
      active: true,
    },
    update: { role: input.role, active: true },
  });
  return user;
}

async function ensureStudent(
  prisma: PrismaClient,
  context: DemoContext,
  input: {
    name: string;
    cpf: string;
    email: string;
    phone: string;
    birthDate: Date;
    status?: RegistryStatus;
    userId?: string;
    addressNumber: string;
  },
) {
  const student = await prisma.student.upsert({
    where: {
      tenantId_cpf: { tenantId: context.tenantId, cpf: input.cpf },
    },
    create: {
      tenantId: context.tenantId,
      userId: input.userId,
      name: input.name,
      cpf: input.cpf,
      email: input.email,
      phone: input.phone,
      birthDate: input.birthDate,
      status: input.status ?? RegistryStatus.ACTIVE,
    },
    update: {
      userId: input.userId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      birthDate: input.birthDate,
      status: input.status ?? RegistryStatus.ACTIVE,
    },
  });
  await prisma.studentAddress.upsert({
    where: {
      studentId_tenantId: {
        studentId: student.id,
        tenantId: context.tenantId,
      },
    },
    create: {
      tenantId: context.tenantId,
      studentId: student.id,
      zipCode: "01310100",
      street: "Avenida Paulista",
      number: input.addressNumber,
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
    update: {
      zipCode: "01310100",
      street: "Avenida Paulista",
      number: input.addressNumber,
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
  });
  for (const document of [
    {
      type: StudentDocumentType.RG,
      number: `RG-${input.cpf.slice(0, 9)}`,
      issuingAuthority: "SSP/SP",
    },
    {
      type: StudentDocumentType.PROOF_OF_ADDRESS,
      number: `END-${input.cpf.slice(0, 9)}`,
      issuingAuthority: "Prumo Demo",
    },
  ]) {
    await prisma.studentDocument.upsert({
      where: {
        tenantId_studentId_type_number: {
          tenantId: context.tenantId,
          studentId: student.id,
          type: document.type,
          number: document.number,
        },
      },
      create: {
        tenantId: context.tenantId,
        studentId: student.id,
        ...document,
        fileName: `${document.type.toLowerCase()}-demo.pdf`,
        fileMimeType: "application/pdf",
        fileSizeBytes: 128_000,
        storageKey: `demo/${student.id}/${document.type}.pdf`,
        uploadedAt: utcDate(-10),
      },
      update: {
        issuingAuthority: document.issuingAuthority,
        fileName: `${document.type.toLowerCase()}-demo.pdf`,
        fileMimeType: "application/pdf",
        fileSizeBytes: 128_000,
        storageKey: `demo/${student.id}/${document.type}.pdf`,
        uploadedAt: utcDate(-10),
      },
    });
  }
  const note = `${DEMO_MARKER} Aluno incluído para validação integral dos fluxos.`;
  const existingNote = await prisma.studentNote.findFirst({
    where: { tenantId: context.tenantId, studentId: student.id, content: note },
  });
  if (!existingNote) {
    await prisma.studentNote.create({
      data: {
        tenantId: context.tenantId,
        studentId: student.id,
        content: note,
      },
    });
  }
  return student;
}

async function ensureInstructor(
  prisma: PrismaClient,
  context: DemoContext,
  input: {
    name: string;
    cpf: string;
    email: string;
    phone: string;
    license: string;
    credentialNumber: string;
    userId: string;
  },
) {
  const instructor = await prisma.instructor.upsert({
    where: {
      tenantId_cpf: { tenantId: context.tenantId, cpf: input.cpf },
    },
    create: {
      tenantId: context.tenantId,
      userId: input.userId,
      name: input.name,
      cpf: input.cpf,
      email: input.email,
      phone: input.phone,
      license: input.license,
      licenseCategory: "AB",
      licenseExpiresAt: utcDate(540),
      credentialNumber: input.credentialNumber,
      status: RegistryStatus.ACTIVE,
    },
    update: {
      userId: input.userId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      license: input.license,
      licenseCategory: "AB",
      licenseExpiresAt: utcDate(540),
      credentialNumber: input.credentialNumber,
      status: RegistryStatus.ACTIVE,
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
          tenantId: context.tenantId,
          instructorId: instructor.id,
          weekday,
          startsAt: "07:00",
          endsAt: weekday === Weekday.SATURDAY ? "14:00" : "21:00",
        },
      },
      create: {
        tenantId: context.tenantId,
        instructorId: instructor.id,
        weekday,
        startsAt: "07:00",
        endsAt: weekday === Weekday.SATURDAY ? "14:00" : "21:00",
        active: true,
      },
      update: { active: true },
    });
  }
  return instructor;
}

async function ensureProcess(
  prisma: PrismaClient,
  context: DemoContext,
  input: {
    protocolNumber: string;
    studentId: string;
    unitId: string;
    processType: LicenseProcessType;
    status: LicenseProcessStatus;
    categoryCode: string;
    currentStageIndex: number;
    rejectedProof?: boolean;
  },
): Promise<DemoProcess> {
  const existing = await prisma.studentLicenseProcess.findUnique({
    where: {
      tenantId_protocolNumber: {
        tenantId: context.tenantId,
        protocolNumber: input.protocolNumber,
      },
    },
  });
  const values = {
    studentId: input.studentId,
    unitId: input.unitId,
    processType: input.processType,
    status: input.status,
    openedAt: utcDate(-45),
    expiresAt: utcDate(320),
    completedAt:
      input.status === LicenseProcessStatus.COMPLETED ? utcDate(-20) : null,
    notes: `${DEMO_MARKER} Processo com estágio controlado para homologação.`,
    createdByUserId: context.ownerUserId,
  };
  const process = existing
    ? await prisma.studentLicenseProcess.update({
        where: { id: existing.id },
        data: values,
      })
    : await prisma.studentLicenseProcess.create({
        data: {
          tenantId: context.tenantId,
          protocolNumber: input.protocolNumber,
          ...values,
        },
      });

  const category = await prisma.licenseCategory.findUniqueOrThrow({
    where: { code: input.categoryCode },
  });
  await prisma.studentProcessCategory.upsert({
    where: {
      tenantId_processId_categoryId: {
        tenantId: context.tenantId,
        processId: process.id,
        categoryId: category.id,
      },
    },
    create: {
      tenantId: context.tenantId,
      processId: process.id,
      categoryId: category.id,
    },
    update: {},
  });

  const blueprint = PROCESS_BLUEPRINTS[input.processType];
  const stages = [];
  for (let index = 0; index < blueprint.length; index += 1) {
    const completedProcess = input.status === LicenseProcessStatus.COMPLETED;
    const completed = completedProcess || index < input.currentStageIndex;
    const current = !completedProcess && index === input.currentStageIndex;
    const status = completed
      ? ProcessStageStatus.COMPLETED
      : current
        ? input.status === LicenseProcessStatus.DRAFT
          ? ProcessStageStatus.AVAILABLE
          : ProcessStageStatus.IN_PROGRESS
        : ProcessStageStatus.BLOCKED;
    stages.push(
      await prisma.processStage.upsert({
        where: {
          tenantId_processId_type: {
            tenantId: context.tenantId,
            processId: process.id,
            type: blueprint[index],
          },
        },
        create: {
          tenantId: context.tenantId,
          processId: process.id,
          type: blueprint[index],
          order: index + 1,
          required: true,
          status,
          startedAt: completed || current ? utcDate(-30 + index) : null,
          completedAt: completed ? utcDate(-29 + index) : null,
          blockedReason:
            status === ProcessStageStatus.BLOCKED
              ? "A etapa anterior ainda está pendente."
              : null,
        },
        update: {
          order: index + 1,
          required: true,
          status,
          startedAt: completed || current ? utcDate(-30 + index) : null,
          completedAt: completed ? utcDate(-29 + index) : null,
          blockedReason:
            status === ProcessStageStatus.BLOCKED
              ? "A etapa anterior ainda está pendente."
              : null,
        },
      }),
    );
  }
  for (let index = 1; index < stages.length; index += 1) {
    await prisma.processStageDependency.upsert({
      where: {
        tenantId_stageId_dependsOnStageId: {
          tenantId: context.tenantId,
          stageId: stages[index].id,
          dependsOnStageId: stages[index - 1].id,
        },
      },
      create: {
        tenantId: context.tenantId,
        stageId: stages[index].id,
        dependsOnStageId: stages[index - 1].id,
      },
      update: {},
    });
  }

  const documents = await prisma.studentDocument.findMany({
    where: { tenantId: context.tenantId, studentId: input.studentId },
  });
  const documentTypes = [
    StudentDocumentType.RG,
    StudentDocumentType.PROOF_OF_ADDRESS,
    ...(input.processType === LicenseProcessType.FIRST_LICENSE
      ? []
      : [StudentDocumentType.CNH]),
  ];
  for (const documentType of documentTypes) {
    const document = documents.find((item) => item.type === documentType);
    const documentReviewCompleted =
      input.status === LicenseProcessStatus.COMPLETED ||
      input.currentStageIndex > 1;
    const rejected =
      input.rejectedProof &&
      documentType === StudentDocumentType.PROOF_OF_ADDRESS;
    const status = rejected
      ? ProcessDocumentStatus.REJECTED
      : documentReviewCompleted
        ? ProcessDocumentStatus.APPROVED
        : document
          ? ProcessDocumentStatus.SUBMITTED
          : ProcessDocumentStatus.PENDING;
    await prisma.processDocumentRequirement.upsert({
      where: {
        tenantId_processId_documentType: {
          tenantId: context.tenantId,
          processId: process.id,
          documentType,
        },
      },
      create: {
        tenantId: context.tenantId,
        processId: process.id,
        studentId: input.studentId,
        documentType,
        required: true,
        status,
        studentDocumentId: rejected ? null : document?.id,
        reviewedByUserId: documentReviewCompleted ? context.ownerUserId : null,
        reviewedAt: documentReviewCompleted ? utcDate(-25) : null,
        rejectionReason: rejected
          ? "Comprovante sem endereço completo — cenário de demonstração."
          : null,
      },
      update: {
        studentId: input.studentId,
        required: true,
        status,
        studentDocumentId: rejected ? null : document?.id,
        reviewedByUserId: documentReviewCompleted ? context.ownerUserId : null,
        reviewedAt: documentReviewCompleted ? utcDate(-25) : null,
        rejectionReason: rejected
          ? "Comprovante sem endereço completo — cenário de demonstração."
          : null,
      },
    });
  }
  return { id: process.id, studentId: input.studentId };
}

async function ensureLesson(
  prisma: PrismaClient,
  context: DemoContext,
  input: {
    marker: string;
    unitId: string;
    studentId: string;
    instructorId: string;
    vehicleId: string;
    processId: string;
    startsAt: Date;
    status: LessonStatus;
    note: string;
  },
) {
  const marker = `${DEMO_MARKER}:${input.marker}`;
  const existing = await prisma.lesson.findFirst({
    where: { tenantId: context.tenantId, notes: { contains: marker } },
  });
  const endsAt = new Date(input.startsAt.getTime() + 50 * 60 * 1000);
  const data = {
    unitId: input.unitId,
    studentId: input.studentId,
    instructorId: input.instructorId,
    vehicleId: input.vehicleId,
    processId: input.processId,
    type: LessonType.PRACTICAL,
    status: input.status,
    startsAt: input.startsAt,
    endsAt,
    notes: `${input.note} ${marker}`,
    createdByUserId: context.ownerUserId,
    completedAt: input.status === LessonStatus.COMPLETED ? endsAt : null,
    startOdometerKm: input.status === LessonStatus.COMPLETED ? 24_100 : null,
    endOdometerKm: input.status === LessonStatus.COMPLETED ? 24_118 : null,
  };
  return existing
    ? prisma.lesson.update({ where: { id: existing.id }, data })
    : prisma.lesson.create({ data: { tenantId: context.tenantId, ...data } });
}

async function ensureTheoreticalClass(
  prisma: PrismaClient,
  context: DemoContext,
  input: {
    title: string;
    unitId: string;
    classroomId: string;
    instructorId: string;
    startsAt: Date;
    status: LessonStatus;
    enrollments: DemoProcess[];
  },
) {
  const existing = await prisma.theoreticalClass.findFirst({
    where: { tenantId: context.tenantId, title: input.title },
  });
  const endsAt = new Date(input.startsAt.getTime() + 3 * 60 * 60 * 1000);
  const data = {
    unitId: input.unitId,
    classroomId: input.classroomId,
    instructorId: input.instructorId,
    title: input.title,
    description: `${DEMO_MARKER} Turma para validação de presença e agenda.`,
    startsAt: input.startsAt,
    endsAt,
    capacity: 30,
    status: input.status,
    completedAt: input.status === LessonStatus.COMPLETED ? endsAt : null,
    createdByUserId: context.ownerUserId,
  };
  const theoreticalClass = existing
    ? await prisma.theoreticalClass.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.theoreticalClass.create({
        data: { tenantId: context.tenantId, ...data },
      });
  for (const enrollment of input.enrollments) {
    await prisma.theoreticalClassStudent.upsert({
      where: {
        tenantId_theoreticalClassId_studentId: {
          tenantId: context.tenantId,
          theoreticalClassId: theoreticalClass.id,
          studentId: enrollment.studentId,
        },
      },
      create: {
        tenantId: context.tenantId,
        theoreticalClassId: theoreticalClass.id,
        studentId: enrollment.studentId,
        processId: enrollment.id,
        attendanceStatus:
          input.status === LessonStatus.COMPLETED
            ? AttendanceStatus.PRESENT
            : AttendanceStatus.ENROLLED,
        checkInAt:
          input.status === LessonStatus.COMPLETED ? input.startsAt : null,
      },
      update: {
        processId: enrollment.id,
        attendanceStatus:
          input.status === LessonStatus.COMPLETED
            ? AttendanceStatus.PRESENT
            : AttendanceStatus.ENROLLED,
        checkInAt:
          input.status === LessonStatus.COMPLETED ? input.startsAt : null,
      },
    });
  }
  return theoreticalClass;
}

async function ensureExam(
  prisma: PrismaClient,
  context: DemoContext,
  input: {
    process: DemoProcess;
    unitId: string;
    type: ExamType;
    status: ExamStatus;
    result: ExamResult;
    scheduledAt: Date;
    attemptNumber?: number;
  },
) {
  const attemptNumber = input.attemptNumber ?? 1;
  return prisma.exam.upsert({
    where: {
      tenantId_processId_type_attemptNumber: {
        tenantId: context.tenantId,
        processId: input.process.id,
        type: input.type,
        attemptNumber,
      },
    },
    create: {
      tenantId: context.tenantId,
      processId: input.process.id,
      studentId: input.process.studentId,
      unitId: input.unitId,
      type: input.type,
      status: input.status,
      result: input.result,
      scheduledAt: input.scheduledAt,
      location: "Detran/SP — Unidade Armênia",
      externalProtocol: `DEMO-${input.type}-${attemptNumber}`,
      attemptNumber,
      score: input.result === ExamResult.APPROVED ? 88 : null,
      notes: `${DEMO_MARKER} Exame de homologação.`,
      completedAt:
        input.status === ExamStatus.COMPLETED ? input.scheduledAt : null,
      createdByUserId: context.ownerUserId,
    },
    update: {
      studentId: input.process.studentId,
      unitId: input.unitId,
      status: input.status,
      result: input.result,
      scheduledAt: input.scheduledAt,
      location: "Detran/SP — Unidade Armênia",
      score: input.result === ExamResult.APPROVED ? 88 : null,
      completedAt:
        input.status === ExamStatus.COMPLETED ? input.scheduledAt : null,
    },
  });
}

async function seedFinancial(
  prisma: PrismaClient,
  context: DemoContext,
  input: {
    unitId: string;
    mariana: DemoProcess;
    lucas: DemoProcess;
    financeUserId: string;
  },
) {
  const serviceSpecs = [
    ["MATRICULA", "Matrícula", FinancialServiceCategory.ENROLLMENT, 35_000],
    [
      "CURSO-TEORICO",
      "Curso teórico",
      FinancialServiceCategory.THEORETICAL_COURSE,
      45_000,
    ],
    [
      "PACOTE-AULAS-B",
      "Pacote de aulas práticas B",
      FinancialServiceCategory.PRACTICAL_LESSON_PACKAGE,
      180_000,
    ],
    [
      "EXAME-PRATICO",
      "Exame prático",
      FinancialServiceCategory.PRACTICAL_EXAM,
      25_000,
    ],
    [
      "TAXA-DOCUMENTAL",
      "Taxa documental",
      FinancialServiceCategory.DOCUMENT_FEE,
      10_000,
    ],
  ] as const;
  const services = [];
  for (const [code, name, category, defaultPriceCents] of serviceSpecs) {
    services.push(
      await prisma.service.upsert({
        where: { tenantId_code: { tenantId: context.tenantId, code } },
        create: {
          tenantId: context.tenantId,
          code,
          name,
          category,
          defaultPriceCents,
          description: `${DEMO_MARKER} Serviço do catálogo de demonstração.`,
          active: true,
        },
        update: { name, category, defaultPriceCents, active: true },
      }),
    );
  }
  const planName = "Primeira Habilitação B — Completo";
  const existingPlan = await prisma.servicePlan.findFirst({
    where: { tenantId: context.tenantId, name: planName },
  });
  const plan = existingPlan
    ? await prisma.servicePlan.update({
        where: { id: existingPlan.id },
        data: {
          description: `${DEMO_MARKER} Plano comercial completo.`,
          status: ServicePlanStatus.ACTIVE,
          totalPriceCents: 295_000,
        },
      })
    : await prisma.servicePlan.create({
        data: {
          tenantId: context.tenantId,
          name: planName,
          description: `${DEMO_MARKER} Plano comercial completo.`,
          status: ServicePlanStatus.ACTIVE,
          totalPriceCents: 295_000,
        },
      });
  const planItems = [];
  for (const service of services) {
    planItems.push(
      await prisma.servicePlanItem.upsert({
        where: {
          tenantId_planId_serviceId: {
            tenantId: context.tenantId,
            planId: plan.id,
            serviceId: service.id,
          },
        },
        create: {
          tenantId: context.tenantId,
          planId: plan.id,
          serviceId: service.id,
          quantity: 1,
          unitPriceCents: service.defaultPriceCents,
          totalCents: service.defaultPriceCents,
        },
        update: {
          quantity: 1,
          unitPriceCents: service.defaultPriceCents,
          totalCents: service.defaultPriceCents,
        },
      }),
    );
  }

  async function ensureContract(
    contractNumber: string,
    process: DemoProcess,
    status: StudentContractStatus,
  ) {
    return prisma.studentContract.upsert({
      where: {
        tenantId_contractNumber: {
          tenantId: context.tenantId,
          contractNumber,
        },
      },
      create: {
        tenantId: context.tenantId,
        studentId: process.studentId,
        processId: process.id,
        unitId: input.unitId,
        planId: plan.id,
        contractNumber,
        status,
        subtotalCents: 295_000,
        totalCents: 295_000,
        signedAt: utcDate(-40),
        activatedAt: utcDate(-39),
        createdByUserId: context.ownerUserId,
      },
      update: {
        studentId: process.studentId,
        processId: process.id,
        unitId: input.unitId,
        planId: plan.id,
        status,
        subtotalCents: 295_000,
        totalCents: 295_000,
        signedAt: utcDate(-40),
        activatedAt: utcDate(-39),
      },
    });
  }
  const marianaContract = await ensureContract(
    "DEMO-2026-0001",
    input.mariana,
    StudentContractStatus.ACTIVE,
  );
  const lucasContract = await ensureContract(
    "DEMO-2026-0002",
    input.lucas,
    StudentContractStatus.DEFAULTED,
  );
  for (const item of planItems) {
    await prisma.studentContractItem.upsert({
      where: {
        tenantId_sourceType_sourceId: {
          tenantId: context.tenantId,
          sourceType: ContractItemSourceType.PLAN,
          sourceId: item.id,
        },
      },
      create: {
        tenantId: context.tenantId,
        contractId: marianaContract.id,
        serviceId: item.serviceId,
        description: services.find((service) => service.id === item.serviceId)!
          .name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        sourceType: ContractItemSourceType.PLAN,
        sourceId: item.id,
      },
      update: {
        contractId: marianaContract.id,
        serviceId: item.serviceId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
      },
    });
  }
  const lucasItem = await prisma.studentContractItem.findFirst({
    where: {
      tenantId: context.tenantId,
      contractId: lucasContract.id,
      description: `${DEMO_MARKER} Pacote completo categoria A`,
    },
  });
  if (lucasItem) {
    await prisma.studentContractItem.update({
      where: { id: lucasItem.id },
      data: { quantity: 1, unitPriceCents: 295_000, totalCents: 295_000 },
    });
  } else {
    await prisma.studentContractItem.create({
      data: {
        tenantId: context.tenantId,
        contractId: lucasContract.id,
        description: `${DEMO_MARKER} Pacote completo categoria A`,
        quantity: 1,
        unitPriceCents: 295_000,
        totalCents: 295_000,
        sourceType: ContractItemSourceType.MANUAL,
      },
    });
  }

  async function ensureInstallments(
    contractId: string,
    studentId: string,
    statuses: Array<{
      dueOffset: number;
      status: ReceivableStatus;
      paid: number;
    }>,
  ) {
    const result = [];
    for (let index = 0; index < statuses.length; index += 1) {
      const spec = statuses[index];
      result.push(
        await prisma.receivableInstallment.upsert({
          where: {
            tenantId_contractId_installmentNumber: {
              tenantId: context.tenantId,
              contractId,
              installmentNumber: index + 1,
            },
          },
          create: {
            tenantId: context.tenantId,
            contractId,
            studentId,
            installmentNumber: index + 1,
            dueDate: utcDate(spec.dueOffset),
            originalAmountCents: 59_000,
            amountDueCents: 59_000,
            amountPaidCents: spec.paid,
            balanceCents: 59_000 - spec.paid,
            status: spec.status,
            paidAt: spec.paid === 59_000 ? utcDate(spec.dueOffset - 1) : null,
          },
          update: {
            studentId,
            dueDate: utcDate(spec.dueOffset),
            originalAmountCents: 59_000,
            amountDueCents: 59_000,
            amountPaidCents: spec.paid,
            balanceCents: 59_000 - spec.paid,
            status: spec.status,
            paidAt: spec.paid === 59_000 ? utcDate(spec.dueOffset - 1) : null,
          },
        }),
      );
    }
    return result;
  }
  const marianaInstallments = await ensureInstallments(
    marianaContract.id,
    input.mariana.studentId,
    [
      { dueOffset: -35, status: ReceivableStatus.PAID, paid: 59_000 },
      { dueOffset: -5, status: ReceivableStatus.OVERDUE, paid: 20_000 },
      { dueOffset: 25, status: ReceivableStatus.PENDING, paid: 0 },
      { dueOffset: 55, status: ReceivableStatus.PENDING, paid: 0 },
      { dueOffset: 85, status: ReceivableStatus.PENDING, paid: 0 },
    ],
  );
  const lucasInstallments = await ensureInstallments(
    lucasContract.id,
    input.lucas.studentId,
    [
      { dueOffset: -65, status: ReceivableStatus.PAID, paid: 59_000 },
      { dueOffset: -35, status: ReceivableStatus.OVERDUE, paid: 0 },
      { dueOffset: -5, status: ReceivableStatus.OVERDUE, paid: 0 },
      { dueOffset: 25, status: ReceivableStatus.PENDING, paid: 0 },
      { dueOffset: 55, status: ReceivableStatus.PENDING, paid: 0 },
    ],
  );

  const registerMarker = `${DEMO_MARKER}:cash-register:today`;
  const existingRegister = await prisma.cashRegister.findFirst({
    where: { tenantId: context.tenantId, notes: registerMarker },
  });
  const cashRegister = existingRegister
    ? await prisma.cashRegister.update({
        where: { id: existingRegister.id },
        data: {
          unitId: input.unitId,
          status: CashRegisterStatus.OPEN,
          openingBalanceCents: 20_000,
          expectedBalanceCents: 70_500,
          openedByUserId: input.financeUserId,
          openedAt: utcDate(0, 10),
        },
      })
    : await prisma.cashRegister.create({
        data: {
          tenantId: context.tenantId,
          unitId: input.unitId,
          status: CashRegisterStatus.OPEN,
          openingBalanceCents: 20_000,
          expectedBalanceCents: 70_500,
          openedByUserId: input.financeUserId,
          openedAt: utcDate(0, 10),
          notes: registerMarker,
        },
      });

  async function ensurePayment(inputPayment: {
    reference: string;
    studentId: string;
    contractId: string;
    installmentId: string;
    amountCents: number;
    method: PaymentMethod;
    receivedAt: Date;
    register?: boolean;
  }) {
    const existing = await prisma.payment.findFirst({
      where: {
        tenantId: context.tenantId,
        externalReference: inputPayment.reference,
      },
    });
    const data = {
      studentId: inputPayment.studentId,
      contractId: inputPayment.contractId,
      amountCents: inputPayment.amountCents,
      paymentMethod: inputPayment.method,
      status: PaymentStatus.CONFIRMED,
      receivedAt: inputPayment.receivedAt,
      confirmedAt: inputPayment.receivedAt,
      cashRegisterId: inputPayment.register ? cashRegister.id : null,
      externalReference: inputPayment.reference,
      notes: `${DEMO_MARKER} Pagamento confirmado.`,
      receivedByUserId: input.financeUserId,
    };
    const payment = existing
      ? await prisma.payment.update({ where: { id: existing.id }, data })
      : await prisma.payment.create({
          data: { tenantId: context.tenantId, ...data },
        });
    await prisma.paymentAllocation.upsert({
      where: {
        tenantId_paymentId_installmentId: {
          tenantId: context.tenantId,
          paymentId: payment.id,
          installmentId: inputPayment.installmentId,
        },
      },
      create: {
        tenantId: context.tenantId,
        paymentId: payment.id,
        installmentId: inputPayment.installmentId,
        amountCents: inputPayment.amountCents,
      },
      update: { amountCents: inputPayment.amountCents },
    });
    return payment;
  }
  const payments = [
    await ensurePayment({
      reference: "DEMO-PAG-0001",
      studentId: input.mariana.studentId,
      contractId: marianaContract.id,
      installmentId: marianaInstallments[0].id,
      amountCents: 59_000,
      method: PaymentMethod.PIX,
      receivedAt: utcDate(-36),
    }),
    await ensurePayment({
      reference: "DEMO-PAG-0002",
      studentId: input.mariana.studentId,
      contractId: marianaContract.id,
      installmentId: marianaInstallments[1].id,
      amountCents: 20_000,
      method: PaymentMethod.CASH,
      receivedAt: utcDate(0, 11),
      register: true,
    }),
    await ensurePayment({
      reference: "DEMO-PAG-0003",
      studentId: input.lucas.studentId,
      contractId: lucasContract.id,
      installmentId: lucasInstallments[0].id,
      amountCents: 59_000,
      method: PaymentMethod.CREDIT_CARD,
      receivedAt: utcDate(-66),
    }),
  ];

  const categories = [];
  for (const name of ["Combustível", "Aluguel", "Manutenção"]) {
    categories.push(
      await prisma.expenseCategory.upsert({
        where: { tenantId_name: { tenantId: context.tenantId, name } },
        create: { tenantId: context.tenantId, name, active: true },
        update: { active: true },
      }),
    );
  }
  const expenseSpecs = [
    {
      description: `${DEMO_MARKER} Abastecimento da frota`,
      categoryId: categories[0].id,
      amountCents: 8_500,
      dueDate: utcDate(0),
      paidAt: utcDate(0),
      status: ExpenseStatus.PAID,
      paymentMethod: PaymentMethod.CASH,
      cashRegisterId: cashRegister.id,
    },
    {
      description: `${DEMO_MARKER} Aluguel da unidade Centro`,
      categoryId: categories[1].id,
      amountCents: 350_000,
      dueDate: utcDate(10),
      paidAt: null,
      status: ExpenseStatus.PENDING,
      paymentMethod: null,
      cashRegisterId: null,
    },
    {
      description: `${DEMO_MARKER} Revisão preventiva do veículo`,
      categoryId: categories[2].id,
      amountCents: 45_000,
      dueDate: utcDate(-7),
      paidAt: null,
      status: ExpenseStatus.OVERDUE,
      paymentMethod: null,
      cashRegisterId: null,
    },
  ];
  const expenses = [];
  for (const spec of expenseSpecs) {
    const existing = await prisma.expense.findFirst({
      where: { tenantId: context.tenantId, description: spec.description },
    });
    const data = {
      unitId: input.unitId,
      categoryId: spec.categoryId,
      supplierName: "Fornecedor Demonstração",
      description: spec.description,
      amountCents: spec.amountCents,
      dueDate: spec.dueDate,
      paidAt: spec.paidAt,
      status: spec.status,
      paymentMethod: spec.paymentMethod,
      cashRegisterId: spec.cashRegisterId,
      createdByUserId: input.financeUserId,
    };
    expenses.push(
      existing
        ? await prisma.expense.update({ where: { id: existing.id }, data })
        : await prisma.expense.create({
            data: { tenantId: context.tenantId, ...data },
          }),
    );
  }

  const movementSpecs = [
    {
      type: CashMovementType.OPENING,
      amountCents: 20_000,
      description: `${DEMO_MARKER} Saldo inicial do caixa`,
      paymentId: null,
      expenseId: null,
    },
    {
      type: CashMovementType.INCOME,
      amountCents: 20_000,
      description: `${DEMO_MARKER} Recebimento parcial em dinheiro`,
      paymentId: payments[1].id,
      expenseId: null,
    },
    {
      type: CashMovementType.EXPENSE,
      amountCents: 8_500,
      description: `${DEMO_MARKER} Pagamento de combustível`,
      paymentId: null,
      expenseId: expenses[0].id,
    },
  ];
  for (const spec of movementSpecs) {
    const existing = await prisma.cashMovement.findFirst({
      where: {
        tenantId: context.tenantId,
        cashRegisterId: cashRegister.id,
        description: spec.description,
      },
    });
    const data = {
      cashRegisterId: cashRegister.id,
      type: spec.type,
      amountCents: spec.amountCents,
      paymentId: spec.paymentId,
      expenseId: spec.expenseId,
      description: spec.description,
      createdByUserId: input.financeUserId,
    };
    if (existing) {
      await prisma.cashMovement.update({ where: { id: existing.id }, data });
    } else {
      await prisma.cashMovement.create({
        data: { tenantId: context.tenantId, ...data },
      });
    }
  }
}

async function seedCommunication(
  prisma: PrismaClient,
  context: DemoContext,
  input: {
    ownerUserId: string;
    studentUsers: Array<{ id: string; email: string; studentId: string }>;
    instructorUser: { id: string; email: string; instructorId: string };
  },
) {
  const event = await prisma.domainEvent.upsert({
    where: { idempotencyKey: "demo:payment-overdue:v1" },
    create: {
      tenantId: context.tenantId,
      type: DomainEventType.INSTALLMENT_OVERDUE,
      aggregateType: "ReceivableInstallment",
      aggregateId: context.tenantId,
      payload: { source: "demo", daysOverdue: 5 },
      status: DomainEventStatus.PROCESSED,
      attempts: 1,
      idempotencyKey: "demo:payment-overdue:v1",
      occurredAt: utcDate(-1),
      processedAt: utcDate(-1),
    },
    update: {
      tenantId: context.tenantId,
      payload: { source: "demo", daysOverdue: 5 },
      status: DomainEventStatus.PROCESSED,
      attempts: 1,
      processedAt: utcDate(-1),
    },
  });
  const notifications = [
    {
      userId: input.ownerUserId,
      type: "DEMO_DAILY_SUMMARY",
      title: "Resumo operacional disponível",
      body: "Há aulas, exames e pendências para acompanhar hoje.",
      actionUrl: "/",
      priority: NotificationPriority.NORMAL,
      readAt: null,
    },
    {
      userId: input.studentUsers[0].id,
      type: "DEMO_LESSON_REMINDER",
      title: "Sua próxima aula está confirmada",
      body: "Confira horário, instrutor e veículo no aplicativo.",
      actionUrl: "/",
      priority: NotificationPriority.HIGH,
      readAt: null,
    },
    {
      userId: input.studentUsers[0].id,
      type: "DEMO_PAYMENT_OVERDUE",
      title: "Parcela com saldo pendente",
      body: "Existe uma parcela parcialmente paga no seu contrato.",
      actionUrl: "/financial",
      priority: NotificationPriority.URGENT,
      readAt: null,
    },
    {
      userId: input.studentUsers[1].id,
      type: "DEMO_DOCUMENT_REJECTED",
      title: "Documento precisa ser reenviado",
      body: "O comprovante de endereço está incompleto.",
      actionUrl: "/documents",
      priority: NotificationPriority.HIGH,
      readAt: utcDate(-1),
    },
    {
      userId: input.instructorUser.id,
      type: "DEMO_INSTRUCTOR_AGENDA",
      title: "Agenda da semana atualizada",
      body: "Novas aulas foram incluídas na sua agenda.",
      actionUrl: "/schedule",
      priority: NotificationPriority.NORMAL,
      readAt: null,
    },
  ];
  for (const spec of notifications) {
    const existing = await prisma.notification.findFirst({
      where: {
        tenantId: context.tenantId,
        userId: spec.userId,
        type: spec.type,
      },
    });
    const data = { ...spec, eventId: event.id };
    if (existing) {
      await prisma.notification.update({ where: { id: existing.id }, data });
    } else {
      await prisma.notification.create({
        data: { tenantId: context.tenantId, ...data },
      });
    }
  }

  const campaigns = [
    {
      name: "Boas-vindas aos alunos — Demo",
      audienceType: CommunicationAudienceType.ACTIVE_STUDENTS,
      channel: NotificationChannel.EMAIL,
      subject: "Bem-vindo à Autoescola Demonstração",
      body: "Acompanhe aulas, documentos e pagamentos pelo Prumo.",
      status: CommunicationCampaignStatus.COMPLETED,
      startedAt: utcDate(-7),
      completedAt: utcDate(-7),
    },
    {
      name: "Lembrete de documentos — Demo",
      audienceType: CommunicationAudienceType.MANUAL_SELECTION,
      channel: NotificationChannel.IN_APP,
      subject: null,
      body: "Revise seus documentos pendentes antes da próxima etapa.",
      status: CommunicationCampaignStatus.DRAFT,
      startedAt: null,
      completedAt: null,
    },
  ];
  for (const spec of campaigns) {
    const existing = await prisma.communicationCampaign.findFirst({
      where: { tenantId: context.tenantId, name: spec.name },
    });
    const data = {
      ...spec,
      audienceFilter: { source: "demo" },
      createdByUserId: input.ownerUserId,
    };
    const campaign = existing
      ? await prisma.communicationCampaign.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.communicationCampaign.create({
          data: { tenantId: context.tenantId, ...data },
        });
    for (const student of input.studentUsers) {
      await prisma.communicationCampaignRecipient.upsert({
        where: {
          tenantId_campaignId_destination: {
            tenantId: context.tenantId,
            campaignId: campaign.id,
            destination: student.email,
          },
        },
        create: {
          tenantId: context.tenantId,
          campaignId: campaign.id,
          userId: student.id,
          studentId: student.studentId,
          destination: student.email,
          status:
            spec.status === CommunicationCampaignStatus.COMPLETED
              ? CampaignRecipientStatus.DELIVERED
              : CampaignRecipientStatus.PENDING,
        },
        update: {
          userId: student.id,
          studentId: student.studentId,
          status:
            spec.status === CommunicationCampaignStatus.COMPLETED
              ? CampaignRecipientStatus.DELIVERED
              : CampaignRecipientStatus.PENDING,
        },
      });
    }
  }

  const deliveryKey = "demo:delivery:payment-overdue:v1";
  const template = await prisma.notificationTemplate.findFirst({
    where: {
      tenantId: null,
      code: "installment-overdue",
      channel: NotificationChannel.IN_APP,
      active: true,
    },
  });
  await prisma.notificationDelivery.upsert({
    where: { idempotencyKey: deliveryKey },
    create: {
      tenantId: context.tenantId,
      eventId: event.id,
      userId: input.studentUsers[0].id,
      channel: NotificationChannel.IN_APP,
      provider: "internal",
      destination: input.studentUsers[0].email,
      templateId: template?.id,
      templateCode: "installment-overdue",
      templateVersion: 1,
      renderedTitle: "Parcela vencida",
      renderedBody: "Existe uma parcela vencida no seu contrato.",
      status: NotificationDeliveryStatus.DELIVERED,
      attempts: 1,
      scheduledAt: utcDate(-1),
      queuedAt: utcDate(-1),
      sentAt: utcDate(-1),
      deliveredAt: utcDate(-1),
      idempotencyKey: deliveryKey,
    },
    update: {
      tenantId: context.tenantId,
      eventId: event.id,
      userId: input.studentUsers[0].id,
      templateId: template?.id,
      status: NotificationDeliveryStatus.DELIVERED,
      attempts: 1,
      deliveredAt: utcDate(-1),
    },
  });
}

export async function seedDemoScenario(
  prisma: PrismaClient,
  context: DemoContext,
): Promise<void> {
  const secretary = await ensureUserMembership(prisma, context, {
    name: "Fernanda Lima",
    email: "secretaria@prumo.local",
    role: MembershipRole.SECRETARY,
  });
  const finance = await ensureUserMembership(prisma, context, {
    name: "Ricardo Nunes",
    email: "financeiro@prumo.local",
    role: MembershipRole.FINANCE,
  });
  const instructorCarlosUser = await ensureUserMembership(prisma, context, {
    name: "Carlos Oliveira",
    email: "carlos@exemplo.local",
    role: MembershipRole.INSTRUCTOR,
  });
  const instructorAnaUser = await ensureUserMembership(prisma, context, {
    name: "Ana Martins",
    email: "ana.instrutora@prumo.local",
    role: MembershipRole.INSTRUCTOR,
  });
  const marianaUser = await ensureUserMembership(prisma, context, {
    name: "Mariana Souza",
    email: "mariana@exemplo.local",
    role: MembershipRole.STUDENT,
  });
  const lucasUser = await ensureUserMembership(prisma, context, {
    name: "Lucas Mendes",
    email: "lucas.aluno@prumo.local",
    role: MembershipRole.STUDENT,
  });
  const invitedUser = await ensureUserMembership(prisma, context, {
    name: "Patrícia Atendimento",
    email: "convite@prumo.local",
    role: MembershipRole.SECRETARY,
    passwordSet: false,
  });
  await prisma.userCredentialToken.upsert({
    where: { tokenHash: "demo-invitation-token-hash-v1" },
    create: {
      userId: invitedUser.id,
      tenantId: context.tenantId,
      type: UserCredentialTokenType.INVITATION,
      tokenHash: "demo-invitation-token-hash-v1",
      expiresAt: utcDate(7),
    },
    update: {
      userId: invitedUser.id,
      tenantId: context.tenantId,
      expiresAt: utcDate(7),
      consumedAt: null,
    },
  });

  const centro = await prisma.schoolUnit.upsert({
    where: {
      tenantId_name: { tenantId: context.tenantId, name: "Unidade Centro" },
    },
    create: {
      tenantId: context.tenantId,
      name: "Unidade Centro",
      document: "12345678000199",
      phone: "(11) 3333-0101",
      email: "centro@prumo.local",
      address: "Avenida Paulista, 1000 - Bela Vista, São Paulo/SP",
      openingTime: "07:00",
      closingTime: "22:00",
      active: true,
    },
    update: { active: true },
  });
  const zonaSul = await prisma.schoolUnit.upsert({
    where: {
      tenantId_name: { tenantId: context.tenantId, name: "Unidade Zona Sul" },
    },
    create: {
      tenantId: context.tenantId,
      name: "Unidade Zona Sul",
      document: "12345678000270",
      phone: "(11) 3333-0202",
      email: "zonasul@prumo.local",
      address: "Avenida Jabaquara, 1800 - Saúde, São Paulo/SP",
      openingTime: "08:00",
      closingTime: "21:00",
      active: true,
    },
    update: { active: true },
  });
  const classroomCentro = await prisma.classroom.upsert({
    where: {
      tenantId_unitId_name: {
        tenantId: context.tenantId,
        unitId: centro.id,
        name: "Sala Teórica 1",
      },
    },
    create: {
      tenantId: context.tenantId,
      unitId: centro.id,
      name: "Sala Teórica 1",
      capacity: 30,
      active: true,
    },
    update: { capacity: 30, active: true },
  });
  await prisma.classroom.upsert({
    where: {
      tenantId_unitId_name: {
        tenantId: context.tenantId,
        unitId: centro.id,
        name: "Sala Multimídia",
      },
    },
    create: {
      tenantId: context.tenantId,
      unitId: centro.id,
      name: "Sala Multimídia",
      capacity: 18,
      active: true,
    },
    update: { capacity: 18, active: true },
  });
  const classroomZonaSul = await prisma.classroom.upsert({
    where: {
      tenantId_unitId_name: {
        tenantId: context.tenantId,
        unitId: zonaSul.id,
        name: "Sala Teórica Zona Sul",
      },
    },
    create: {
      tenantId: context.tenantId,
      unitId: zonaSul.id,
      name: "Sala Teórica Zona Sul",
      capacity: 24,
      active: true,
    },
    update: { capacity: 24, active: true },
  });

  const students = {
    mariana: await ensureStudent(prisma, context, {
      name: "Mariana Souza",
      cpf: "52998224725",
      email: "mariana@exemplo.local",
      phone: "(11) 99999-0101",
      birthDate: new Date("1998-04-12T00:00:00.000Z"),
      userId: marianaUser.id,
      addressNumber: "1000",
    }),
    lucas: await ensureStudent(prisma, context, {
      name: "Lucas Mendes",
      cpf: "12345678909",
      email: "lucas.aluno@prumo.local",
      phone: "(11) 99999-0102",
      birthDate: new Date("2001-09-22T00:00:00.000Z"),
      userId: lucasUser.id,
      addressNumber: "1100",
    }),
    beatriz: await ensureStudent(prisma, context, {
      name: "Beatriz Alves",
      cpf: "93541134780",
      email: "beatriz.alves@demo.local",
      phone: "(11) 99999-0103",
      birthDate: new Date("1995-02-18T00:00:00.000Z"),
      addressNumber: "1200",
    }),
    rafael: await ensureStudent(prisma, context, {
      name: "Rafael Santos",
      cpf: "98765432100",
      email: "rafael.santos@demo.local",
      phone: "(11) 99999-0104",
      birthDate: new Date("1989-11-03T00:00:00.000Z"),
      addressNumber: "1300",
    }),
    camila: await ensureStudent(prisma, context, {
      name: "Camila Rocha",
      cpf: "16899535009",
      email: "camila.rocha@demo.local",
      phone: "(11) 99999-0105",
      birthDate: new Date("2002-06-28T00:00:00.000Z"),
      addressNumber: "1400",
    }),
    joao: await ensureStudent(prisma, context, {
      name: "João Pedro Costa",
      cpf: "39053344705",
      email: "joao.costa@demo.local",
      phone: "(11) 99999-0106",
      birthDate: new Date("1997-12-15T00:00:00.000Z"),
      status: RegistryStatus.INACTIVE,
      addressNumber: "1500",
    }),
  };

  const instructors = {
    carlos: await ensureInstructor(prisma, context, {
      name: "Carlos Oliveira",
      cpf: "11144477735",
      email: "carlos@exemplo.local",
      phone: "(11) 99999-0202",
      license: "01234567890",
      credentialNumber: "INSTR-DEMO-01",
      userId: instructorCarlosUser.id,
    }),
    ana: await ensureInstructor(prisma, context, {
      name: "Ana Martins",
      cpf: "52998224725",
      email: "ana.instrutora@prumo.local",
      phone: "(11) 99999-0203",
      license: "10987654321",
      credentialNumber: "INSTR-DEMO-02",
      userId: instructorAnaUser.id,
    }),
  };

  const vehicleSpecs = [
    ["PRM1A23", "Volkswagen", "Polo", "Branco", "B", RegistryStatus.ACTIVE],
    ["PRM2B34", "Chevrolet", "Onix", "Prata", "B", RegistryStatus.ACTIVE],
    ["PRM3C45", "Honda", "CG 160", "Vermelha", "A", RegistryStatus.ACTIVE],
  ] as const;
  const vehicles = [];
  for (let index = 0; index < vehicleSpecs.length; index += 1) {
    const [plate, brand, model, color, category, status] = vehicleSpecs[index];
    vehicles.push(
      await prisma.vehicle.upsert({
        where: { tenantId_plate: { tenantId: context.tenantId, plate } },
        create: {
          tenantId: context.tenantId,
          plate,
          brand,
          model,
          year: 2024 + (index % 2),
          color,
          renavam: `1234567890${index + 1}`,
          category,
          status,
        },
        update: { brand, model, color, category, status },
      }),
    );
  }

  const processes = {
    mariana: await ensureProcess(prisma, context, {
      protocolNumber: "DEMO-PROC-0001",
      studentId: students.mariana.id,
      unitId: centro.id,
      processType: LicenseProcessType.FIRST_LICENSE,
      status: LicenseProcessStatus.IN_PROGRESS,
      categoryCode: "B",
      currentStageIndex: 6,
    }),
    lucas: await ensureProcess(prisma, context, {
      protocolNumber: "DEMO-PROC-0002",
      studentId: students.lucas.id,
      unitId: centro.id,
      processType: LicenseProcessType.FIRST_LICENSE,
      status: LicenseProcessStatus.PENDING_DOCUMENTS,
      categoryCode: "A",
      currentStageIndex: 1,
      rejectedProof: true,
    }),
    beatriz: await ensureProcess(prisma, context, {
      protocolNumber: "DEMO-PROC-0003",
      studentId: students.beatriz.id,
      unitId: zonaSul.id,
      processType: LicenseProcessType.CATEGORY_ADDITION,
      status: LicenseProcessStatus.IN_PROGRESS,
      categoryCode: "B",
      currentStageIndex: 4,
    }),
    rafael: await ensureProcess(prisma, context, {
      protocolNumber: "DEMO-PROC-0004",
      studentId: students.rafael.id,
      unitId: centro.id,
      processType: LicenseProcessType.RENEWAL,
      status: LicenseProcessStatus.COMPLETED,
      categoryCode: "B",
      currentStageIndex: 5,
    }),
    camila: await ensureProcess(prisma, context, {
      protocolNumber: "DEMO-PROC-0005",
      studentId: students.camila.id,
      unitId: zonaSul.id,
      processType: LicenseProcessType.FIRST_LICENSE,
      status: LicenseProcessStatus.DRAFT,
      categoryCode: "B",
      currentStageIndex: 0,
    }),
  };

  const lessons = [
    await ensureLesson(prisma, context, {
      marker: "lesson-completed-mariana",
      unitId: centro.id,
      studentId: students.mariana.id,
      instructorId: instructors.carlos.id,
      vehicleId: vehicles[0].id,
      processId: processes.mariana.id,
      startsAt: utcDate(-3, 14),
      status: LessonStatus.COMPLETED,
      note: "Treino de baliza e controle de embreagem.",
    }),
    await ensureLesson(prisma, context, {
      marker: "lesson-today-mariana",
      unitId: centro.id,
      studentId: students.mariana.id,
      instructorId: instructors.carlos.id,
      vehicleId: vehicles[0].id,
      processId: processes.mariana.id,
      startsAt: relativeHours(2),
      status: LessonStatus.CONFIRMED,
      note: "Circuito urbano e conversões.",
    }),
    await ensureLesson(prisma, context, {
      marker: "lesson-future-mariana",
      unitId: centro.id,
      studentId: students.mariana.id,
      instructorId: instructors.ana.id,
      vehicleId: vehicles[1].id,
      processId: processes.mariana.id,
      startsAt: relativeHours(26),
      status: LessonStatus.CONFIRMED,
      note: "Direção defensiva em vias arteriais.",
    }),
    await ensureLesson(prisma, context, {
      marker: "lesson-beatriz-1",
      unitId: zonaSul.id,
      studentId: students.beatriz.id,
      instructorId: instructors.ana.id,
      vehicleId: vehicles[1].id,
      processId: processes.beatriz.id,
      startsAt: relativeHours(50),
      status: LessonStatus.PENDING,
      note: "Avaliação inicial da categoria adicional.",
    }),
    await ensureLesson(prisma, context, {
      marker: "lesson-lucas-1",
      unitId: centro.id,
      studentId: students.lucas.id,
      instructorId: instructors.carlos.id,
      vehicleId: vehicles[2].id,
      processId: processes.lucas.id,
      startsAt: relativeHours(74),
      status: LessonStatus.PENDING,
      note: "Introdução aos comandos da motocicleta.",
    }),
    await ensureLesson(prisma, context, {
      marker: "lesson-completed-beatriz",
      unitId: zonaSul.id,
      studentId: students.beatriz.id,
      instructorId: instructors.ana.id,
      vehicleId: vehicles[1].id,
      processId: processes.beatriz.id,
      startsAt: utcDate(-8, 16),
      status: LessonStatus.COMPLETED,
      note: "Aula concluída com aproveitamento satisfatório.",
    }),
  ];
  await prisma.lessonEvaluation.upsert({
    where: { lessonId: lessons[0].id },
    create: {
      tenantId: context.tenantId,
      lessonId: lessons[0].id,
      studentId: students.mariana.id,
      instructorId: instructors.carlos.id,
      evaluatorUserId: instructorCarlosUser.id,
      control: LessonEvaluationValue.GOOD,
      attention: LessonEvaluationValue.GOOD,
      signaling: LessonEvaluationValue.SATISFACTORY,
      parking: LessonEvaluationValue.DEVELOPING,
      gearShift: LessonEvaluationValue.GOOD,
      trafficRules: LessonEvaluationValue.GOOD,
      confidence: LessonEvaluationValue.SATISFACTORY,
      overallRating: LessonEvaluationValue.GOOD,
      notes: "Evolução consistente; reforçar estacionamento.",
      visibleToStudent: true,
    },
    update: {
      overallRating: LessonEvaluationValue.GOOD,
      notes: "Evolução consistente; reforçar estacionamento.",
      visibleToStudent: true,
    },
  });
  const changeRequest = await prisma.lessonChangeRequest.findFirst({
    where: {
      tenantId: context.tenantId,
      lessonId: lessons[2].id,
      requestedByUserId: marianaUser.id,
      type: LessonChangeRequestType.RESCHEDULE,
    },
  });
  const changeData = {
    studentId: students.mariana.id,
    requestedByUserId: marianaUser.id,
    type: LessonChangeRequestType.RESCHEDULE,
    status: LessonChangeRequestStatus.PENDING,
    reason: "Conflito com horário de trabalho.",
    preferredStartsAt: relativeHours(30),
  };
  if (changeRequest) {
    await prisma.lessonChangeRequest.update({
      where: { id: changeRequest.id },
      data: changeData,
    });
  } else {
    await prisma.lessonChangeRequest.create({
      data: {
        tenantId: context.tenantId,
        lessonId: lessons[2].id,
        ...changeData,
      },
    });
  }

  const occurrenceMarker = `${DEMO_MARKER} Ruído no freio dianteiro`;
  const occurrence = await prisma.vehicleOccurrence.findFirst({
    where: { tenantId: context.tenantId, description: occurrenceMarker },
  });
  const occurrenceData = {
    vehicleId: vehicles[1].id,
    instructorId: instructors.ana.id,
    lessonId: lessons[5].id,
    reportedByUserId: instructorAnaUser.id,
    type: VehicleOccurrenceType.MECHANICAL_PROBLEM,
    description: occurrenceMarker,
    occurredAt: utcDate(-8, 17),
    status: VehicleOccurrenceStatus.IN_REVIEW,
  };
  if (occurrence) {
    await prisma.vehicleOccurrence.update({
      where: { id: occurrence.id },
      data: occurrenceData,
    });
  } else {
    await prisma.vehicleOccurrence.create({
      data: { tenantId: context.tenantId, ...occurrenceData },
    });
  }

  await ensureTheoreticalClass(prisma, context, {
    title: "Legislação de trânsito — Turma Demo A",
    unitId: centro.id,
    classroomId: classroomCentro.id,
    instructorId: instructors.carlos.id,
    startsAt: relativeHours(4),
    status: LessonStatus.CONFIRMED,
    enrollments: [processes.mariana, processes.lucas],
  });
  await ensureTheoreticalClass(prisma, context, {
    title: "Direção defensiva — Turma Demo B",
    unitId: zonaSul.id,
    classroomId: classroomZonaSul.id,
    instructorId: instructors.ana.id,
    startsAt: relativeHours(30),
    status: LessonStatus.PENDING,
    enrollments: [processes.beatriz, processes.camila],
  });
  await ensureTheoreticalClass(prisma, context, {
    title: "Primeiros socorros — Turma Demo concluída",
    unitId: centro.id,
    classroomId: classroomCentro.id,
    instructorId: instructors.carlos.id,
    startsAt: utcDate(-10, 18),
    status: LessonStatus.COMPLETED,
    enrollments: [processes.mariana, processes.beatriz],
  });

  await ensureExam(prisma, context, {
    process: processes.mariana,
    unitId: centro.id,
    type: ExamType.PRACTICAL,
    status: ExamStatus.REQUESTED,
    result: ExamResult.PENDING,
    scheduledAt: relativeHours(96),
  });
  await ensureExam(prisma, context, {
    process: processes.mariana,
    unitId: centro.id,
    type: ExamType.THEORETICAL,
    status: ExamStatus.COMPLETED,
    result: ExamResult.APPROVED,
    scheduledAt: utcDate(-20, 13),
  });
  await ensureExam(prisma, context, {
    process: processes.lucas,
    unitId: centro.id,
    type: ExamType.MEDICAL,
    status: ExamStatus.CONFIRMED,
    result: ExamResult.PENDING,
    scheduledAt: relativeHours(6),
  });
  await ensureExam(prisma, context, {
    process: processes.beatriz,
    unitId: zonaSul.id,
    type: ExamType.PRACTICAL,
    status: ExamStatus.SCHEDULED,
    result: ExamResult.PENDING,
    scheduledAt: relativeHours(54),
  });

  const blockMarker = `${DEMO_MARKER} Manutenção preventiva`;
  const existingBlock = await prisma.scheduleBlock.findFirst({
    where: { tenantId: context.tenantId, reason: blockMarker },
  });
  const blockData = {
    resourceType: "VEHICLE" as const,
    vehicleId: vehicles[1].id,
    startsAt: relativeHours(100),
    endsAt: relativeHours(104),
    reason: blockMarker,
    createdByUserId: secretary.id,
  };
  if (existingBlock) {
    await prisma.scheduleBlock.update({
      where: { id: existingBlock.id },
      data: blockData,
    });
  } else {
    await prisma.scheduleBlock.create({
      data: { tenantId: context.tenantId, ...blockData },
    });
  }

  await seedFinancial(prisma, context, {
    unitId: centro.id,
    mariana: processes.mariana,
    lucas: processes.lucas,
    financeUserId: finance.id,
  });
  await seedCommunication(prisma, context, {
    ownerUserId: context.ownerUserId,
    studentUsers: [
      {
        id: marianaUser.id,
        email: marianaUser.email,
        studentId: students.mariana.id,
      },
      {
        id: lucasUser.id,
        email: lucasUser.email,
        studentId: students.lucas.id,
      },
    ],
    instructorUser: {
      id: instructorCarlosUser.id,
      email: instructorCarlosUser.email,
      instructorId: instructors.carlos.id,
    },
  });
}

export async function verifyDemoScenario(
  prisma: PrismaClient,
  tenantId: string,
) {
  const [
    students,
    instructors,
    vehicles,
    units,
    processes,
    lessons,
    theoreticalClasses,
    exams,
    contracts,
    receivables,
    payments,
    expenses,
    notifications,
    campaigns,
    pendingInvitations,
    roles,
  ] = await Promise.all([
    prisma.student.count({ where: { tenantId } }),
    prisma.instructor.count({ where: { tenantId } }),
    prisma.vehicle.count({ where: { tenantId } }),
    prisma.schoolUnit.count({ where: { tenantId } }),
    prisma.studentLicenseProcess.count({ where: { tenantId } }),
    prisma.lesson.count({ where: { tenantId } }),
    prisma.theoreticalClass.count({ where: { tenantId } }),
    prisma.exam.count({ where: { tenantId } }),
    prisma.studentContract.count({ where: { tenantId } }),
    prisma.receivableInstallment.count({ where: { tenantId } }),
    prisma.payment.count({ where: { tenantId } }),
    prisma.expense.count({ where: { tenantId } }),
    prisma.notification.count({ where: { tenantId } }),
    prisma.communicationCampaign.count({ where: { tenantId } }),
    prisma.userCredentialToken.count({
      where: {
        tenantId,
        type: UserCredentialTokenType.INVITATION,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.membership.groupBy({
      by: ["role"],
      where: { tenantId, active: true },
      _count: true,
    }),
  ]);
  const counts = {
    students,
    instructors,
    vehicles,
    units,
    processes,
    lessons,
    theoreticalClasses,
    exams,
    contracts,
    receivables,
    payments,
    expenses,
    notifications,
    campaigns,
  };
  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * DAY_MS);
  const [
    activeStudents,
    activeProcesses,
    completedProcesses,
    upcomingLessons,
    completedLessons,
    pendingDocuments,
    requestedExams,
    pendingLessonChanges,
    overdueReceivables,
    paidReceivables,
    openCashRegisters,
    unreadNotifications,
  ] = await Promise.all([
    prisma.student.count({
      where: { tenantId, status: RegistryStatus.ACTIVE },
    }),
    prisma.studentLicenseProcess.count({
      where: {
        tenantId,
        status: {
          in: [
            LicenseProcessStatus.DRAFT,
            LicenseProcessStatus.PENDING_DOCUMENTS,
            LicenseProcessStatus.IN_PROGRESS,
          ],
        },
      },
    }),
    prisma.studentLicenseProcess.count({
      where: { tenantId, status: LicenseProcessStatus.COMPLETED },
    }),
    prisma.lesson.count({
      where: {
        tenantId,
        startsAt: { gte: now, lt: inSevenDays },
        status: { in: [LessonStatus.PENDING, LessonStatus.CONFIRMED] },
      },
    }),
    prisma.lesson.count({
      where: { tenantId, status: LessonStatus.COMPLETED },
    }),
    prisma.processDocumentRequirement.count({
      where: {
        tenantId,
        required: true,
        status: {
          in: [
            ProcessDocumentStatus.PENDING,
            ProcessDocumentStatus.SUBMITTED,
            ProcessDocumentStatus.REJECTED,
            ProcessDocumentStatus.EXPIRED,
          ],
        },
      },
    }),
    prisma.exam.count({
      where: { tenantId, status: ExamStatus.REQUESTED },
    }),
    prisma.lessonChangeRequest.count({
      where: { tenantId, status: LessonChangeRequestStatus.PENDING },
    }),
    prisma.receivableInstallment.count({
      where: {
        tenantId,
        balanceCents: { gt: 0 },
        dueDate: { lt: now },
        status: {
          in: [
            ReceivableStatus.PENDING,
            ReceivableStatus.PARTIALLY_PAID,
            ReceivableStatus.OVERDUE,
            ReceivableStatus.NEGOTIATED,
          ],
        },
      },
    }),
    prisma.receivableInstallment.count({
      where: { tenantId, status: ReceivableStatus.PAID },
    }),
    prisma.cashRegister.count({
      where: { tenantId, status: CashRegisterStatus.OPEN },
    }),
    prisma.notification.count({
      where: { tenantId, readAt: null, archivedAt: null },
    }),
  ]);
  const coverage = {
    activeStudents,
    activeProcesses,
    completedProcesses,
    upcomingLessons,
    completedLessons,
    pendingDocuments,
    requestedExams,
    pendingLessonChanges,
    overdueReceivables,
    paidReceivables,
    openCashRegisters,
    unreadNotifications,
  };
  const failures = Object.entries(DEMO_MINIMUM_COUNTS)
    .filter(([key, minimum]) => counts[key as keyof typeof counts] < minimum)
    .map(
      ([key, minimum]) =>
        `${key}: ${counts[key as keyof typeof counts]} (mínimo ${minimum})`,
    );
  const requiredRoles = [
    MembershipRole.TENANT_OWNER,
    MembershipRole.SECRETARY,
    MembershipRole.FINANCE,
    MembershipRole.INSTRUCTOR,
    MembershipRole.STUDENT,
  ];
  for (const [scenario, matches] of Object.entries(coverage)) {
    if (matches < 1) failures.push(`cenário sem dados: ${scenario}`);
  }
  const presentRoles = new Set(roles.map((item) => item.role));
  for (const role of requiredRoles) {
    if (!presentRoles.has(role)) failures.push(`papel ausente: ${role}`);
  }
  if (pendingInvitations < 1) failures.push("convite pendente ausente");
  if (failures.length) {
    throw new Error(`Cenário demo incompleto: ${failures.join("; ")}`);
  }
  return {
    tenantId,
    counts,
    coverage,
    pendingInvitations,
    roles: Object.fromEntries(roles.map((item) => [item.role, item._count])),
  };
}
