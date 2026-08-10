import type {
  TenantDashboardEvent,
  TenantDashboardResponse,
  TenantDashboardTask,
} from "@prumo/contracts";
import { Injectable } from "@nestjs/common";
import {
  ExamStatus,
  LessonStatus,
  ProcessDocumentStatus,
  ReceivableStatus,
  RegistryStatus,
} from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";

const ACTIVE_LESSONS = [
  LessonStatus.PENDING,
  LessonStatus.CONFIRMED,
  LessonStatus.IN_PROGRESS,
];
const ACTIVE_EXAMS = [
  ExamStatus.REQUESTED,
  ExamStatus.SCHEDULED,
  ExamStatus.CONFIRMED,
];
const ACTIVE_PROCESSES = ["DRAFT", "PENDING_DOCUMENTS", "IN_PROGRESS"] as const;
const OPEN_RECEIVABLES = [
  ReceivableStatus.PENDING,
  ReceivableStatus.PARTIALLY_PAID,
  ReceivableStatus.OVERDUE,
  ReceivableStatus.NEGOTIATED,
];

function utcDay(date = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function amount(value: { _sum: { balanceCents: number | null } }): number {
  return value._sum.balanceCents ?? 0;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthenticatedUser): Promise<TenantDashboardResponse> {
    if (user.role === "STUDENT") return this.student(user);
    if (user.role === "INSTRUCTOR") return this.instructor(user);
    return this.management(user);
  }

  private async management(
    user: AuthenticatedUser,
  ): Promise<TenantDashboardResponse> {
    const now = new Date();
    const today = utcDay(now);
    const upcomingEnd = new Date(today.start.getTime() + 7 * 86_400_000);
    const [
      activeStudents,
      activeProcesses,
      lessonsToday,
      classesToday,
      examsToday,
      overdue,
      pendingDocuments,
      requestedExams,
      pendingChanges,
      pendingInvitations,
      lessons,
      classes,
      exams,
    ] = await Promise.all([
      this.prisma.student.count({
        where: { tenantId: user.tenantId, status: RegistryStatus.ACTIVE },
      }),
      this.prisma.studentLicenseProcess.count({
        where: {
          tenantId: user.tenantId,
          status: { in: [...ACTIVE_PROCESSES] },
        },
      }),
      this.prisma.lesson.count({
        where: {
          tenantId: user.tenantId,
          startsAt: { gte: today.start, lt: today.end },
          status: { in: ACTIVE_LESSONS },
        },
      }),
      this.prisma.theoreticalClass.count({
        where: {
          tenantId: user.tenantId,
          startsAt: { gte: today.start, lt: today.end },
          status: { in: ACTIVE_LESSONS },
        },
      }),
      this.prisma.exam.count({
        where: {
          tenantId: user.tenantId,
          scheduledAt: { gte: today.start, lt: today.end },
          status: { in: ACTIVE_EXAMS },
        },
      }),
      this.prisma.receivableInstallment.aggregate({
        where: {
          tenantId: user.tenantId,
          balanceCents: { gt: 0 },
          dueDate: { lt: today.start },
          status: { in: OPEN_RECEIVABLES },
        },
        _sum: { balanceCents: true },
      }),
      this.prisma.processDocumentRequirement.count({
        where: {
          tenantId: user.tenantId,
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
      this.prisma.exam.count({
        where: { tenantId: user.tenantId, status: ExamStatus.REQUESTED },
      }),
      this.prisma.lessonChangeRequest.count({
        where: { tenantId: user.tenantId, status: "PENDING" },
      }),
      this.prisma.userCredentialToken.count({
        where: {
          tenantId: user.tenantId,
          type: "INVITATION",
          consumedAt: null,
          expiresAt: { gt: now },
        },
      }),
      this.prisma.lesson.findMany({
        where: {
          tenantId: user.tenantId,
          startsAt: { gte: now, lt: upcomingEnd },
          status: { in: ACTIVE_LESSONS },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          student: { select: { name: true } },
          instructor: { select: { name: true } },
        },
        orderBy: { startsAt: "asc" },
        take: 8,
      }),
      this.prisma.theoreticalClass.findMany({
        where: {
          tenantId: user.tenantId,
          startsAt: { gte: now, lt: upcomingEnd },
          status: { in: ACTIVE_LESSONS },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          status: true,
          instructor: { select: { name: true } },
        },
        orderBy: { startsAt: "asc" },
        take: 8,
      }),
      this.prisma.exam.findMany({
        where: {
          tenantId: user.tenantId,
          scheduledAt: { gte: now, lt: upcomingEnd },
          status: { in: ACTIVE_EXAMS },
        },
        select: {
          id: true,
          type: true,
          scheduledAt: true,
          status: true,
          student: { select: { name: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 8,
      }),
    ]);

    return {
      scope: "MANAGEMENT",
      generatedAt: now.toISOString(),
      metrics: [
        {
          key: "students",
          label: "Alunos ativos",
          value: activeStudents,
          format: "NUMBER",
          href: "/students",
        },
        {
          key: "processes",
          label: "Processos em andamento",
          value: activeProcesses,
          format: "NUMBER",
          href: "/processes",
        },
        {
          key: "today",
          label: "Compromissos hoje",
          value: lessonsToday + classesToday + examsToday,
          format: "NUMBER",
          href: "/schedule",
        },
        {
          key: "overdue",
          label: "Saldo vencido",
          value: amount(overdue),
          format: "CURRENCY",
          href: "/financial/receivables",
        },
      ],
      tasks: this.tasks([
        [
          "documents",
          "Documentos para tratar",
          "Pendências de envio ou análise nos processos.",
          pendingDocuments,
          "/processes",
          pendingDocuments > 0 ? "WARNING" : "INFO",
        ],
        [
          "exams",
          "Exames solicitados",
          "Solicitações aguardando agendamento.",
          requestedExams,
          "/exams",
          requestedExams > 0 ? "WARNING" : "INFO",
        ],
        [
          "changes",
          "Alterações de aula",
          "Pedidos de cancelamento ou reagendamento.",
          pendingChanges,
          "/schedule",
          pendingChanges > 0 ? "WARNING" : "INFO",
        ],
        [
          "invites",
          "Convites pendentes",
          "Pessoas que ainda não concluíram o primeiro acesso.",
          pendingInvitations,
          "/team",
          "INFO",
        ],
      ]),
      upcoming: this.mergeEvents(
        lessons.map((item) => ({
          id: item.id,
          kind: "PRACTICAL_LESSON" as const,
          title: `Aula prática · ${item.student.name}`,
          startsAt: item.startsAt.toISOString(),
          endsAt: item.endsAt.toISOString(),
          status: item.status,
          context: item.instructor.name,
          href: `/practical-lessons/${item.id}`,
        })),
        classes.map((item) => ({
          id: item.id,
          kind: "THEORETICAL_CLASS" as const,
          title: item.title,
          startsAt: item.startsAt.toISOString(),
          endsAt: item.endsAt.toISOString(),
          status: item.status,
          context: item.instructor.name,
          href: `/theoretical-classes/${item.id}`,
        })),
        exams.map((item) => ({
          id: item.id,
          kind: "EXAM" as const,
          title: `Exame ${item.type.toLowerCase()} · ${item.student.name}`,
          startsAt: item.scheduledAt.toISOString(),
          endsAt: null,
          status: item.status,
          context: "Exame",
          href: `/exams/${item.id}`,
        })),
      ),
    };
  }

  private async student(
    user: AuthenticatedUser,
  ): Promise<TenantDashboardResponse> {
    const now = new Date();
    const today = utcDay(now);
    const end = new Date(today.start.getTime() + 7 * 86_400_000);
    const student = await this.prisma.student.findFirst({
      where: { tenantId: user.tenantId, userId: user.id },
      select: { id: true },
    });
    if (!student) return this.empty("STUDENT", now);
    const [lessons, exams, activeProcesses, pendingDocuments, overdue] =
      await Promise.all([
        this.prisma.lesson.findMany({
          where: {
            tenantId: user.tenantId,
            studentId: student.id,
            startsAt: { gte: now, lt: end },
            status: { in: ACTIVE_LESSONS },
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            instructor: { select: { name: true } },
          },
          orderBy: { startsAt: "asc" },
          take: 8,
        }),
        this.prisma.exam.findMany({
          where: {
            tenantId: user.tenantId,
            studentId: student.id,
            scheduledAt: { gte: now, lt: end },
            status: { in: ACTIVE_EXAMS },
          },
          select: {
            id: true,
            type: true,
            scheduledAt: true,
            status: true,
            location: true,
          },
          orderBy: { scheduledAt: "asc" },
          take: 8,
        }),
        this.prisma.studentLicenseProcess.count({
          where: {
            tenantId: user.tenantId,
            studentId: student.id,
            status: { in: [...ACTIVE_PROCESSES] },
          },
        }),
        this.prisma.processDocumentRequirement.count({
          where: {
            tenantId: user.tenantId,
            studentId: student.id,
            required: true,
            status: {
              in: [
                ProcessDocumentStatus.PENDING,
                ProcessDocumentStatus.REJECTED,
                ProcessDocumentStatus.EXPIRED,
              ],
            },
          },
        }),
        this.prisma.receivableInstallment.aggregate({
          where: {
            tenantId: user.tenantId,
            studentId: student.id,
            balanceCents: { gt: 0 },
            dueDate: { lt: today.start },
            status: { in: OPEN_RECEIVABLES },
          },
          _sum: { balanceCents: true },
        }),
      ]);
    const events = this.mergeEvents(
      lessons.map((item) => ({
        id: item.id,
        kind: "PRACTICAL_LESSON" as const,
        title: "Aula prática",
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        status: item.status,
        context: item.instructor.name,
        href: "/",
      })),
      exams.map((item) => ({
        id: item.id,
        kind: "EXAM" as const,
        title: `Exame ${item.type.toLowerCase()}`,
        startsAt: item.scheduledAt.toISOString(),
        endsAt: null,
        status: item.status,
        context: item.location ?? "Local a confirmar",
        href: "/",
      })),
    );
    const todayCount = events.filter(
      (event) =>
        new Date(event.startsAt) >= today.start &&
        new Date(event.startsAt) < today.end,
    ).length;
    return {
      scope: "STUDENT",
      generatedAt: now.toISOString(),
      metrics: [
        {
          key: "today",
          label: "Compromissos hoje",
          value: todayCount,
          format: "NUMBER",
          href: null,
        },
        {
          key: "next",
          label: "Próximos 7 dias",
          value: events.length,
          format: "NUMBER",
          href: null,
        },
        {
          key: "processes",
          label: "Processos ativos",
          value: activeProcesses,
          format: "NUMBER",
          href: null,
        },
        {
          key: "overdue",
          label: "Saldo vencido",
          value: amount(overdue),
          format: "CURRENCY",
          href: null,
        },
      ],
      tasks: this.tasks([
        [
          "documents",
          "Documentos pendentes",
          "Itens necessários para o andamento do seu processo.",
          pendingDocuments,
          "/",
          pendingDocuments > 0 ? "WARNING" : "INFO",
        ],
      ]),
      upcoming: events,
    };
  }

  private async instructor(
    user: AuthenticatedUser,
  ): Promise<TenantDashboardResponse> {
    const now = new Date();
    const today = utcDay(now);
    const end = new Date(today.start.getTime() + 7 * 86_400_000);
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const instructor = await this.prisma.instructor.findFirst({
      where: { tenantId: user.tenantId, userId: user.id },
      select: { id: true },
    });
    if (!instructor) return this.empty("INSTRUCTOR", now);
    const [lessons, classes, completedLessons, completedClasses] =
      await Promise.all([
        this.prisma.lesson.findMany({
          where: {
            tenantId: user.tenantId,
            instructorId: instructor.id,
            startsAt: { gte: now, lt: end },
            status: { in: ACTIVE_LESSONS },
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            student: { select: { name: true } },
          },
          orderBy: { startsAt: "asc" },
          take: 12,
        }),
        this.prisma.theoreticalClass.findMany({
          where: {
            tenantId: user.tenantId,
            instructorId: instructor.id,
            startsAt: { gte: now, lt: end },
            status: { in: ACTIVE_LESSONS },
          },
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
          orderBy: { startsAt: "asc" },
          take: 12,
        }),
        this.prisma.lesson.count({
          where: {
            tenantId: user.tenantId,
            instructorId: instructor.id,
            completedAt: { gte: monthStart },
            status: LessonStatus.COMPLETED,
          },
        }),
        this.prisma.theoreticalClass.count({
          where: {
            tenantId: user.tenantId,
            instructorId: instructor.id,
            completedAt: { gte: monthStart },
            status: LessonStatus.COMPLETED,
          },
        }),
      ]);
    const events = this.mergeEvents(
      lessons.map((item) => ({
        id: item.id,
        kind: "PRACTICAL_LESSON" as const,
        title: `Aula prática · ${item.student.name}`,
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        status: item.status,
        context: "Aula prática",
        href: "/",
      })),
      classes.map((item) => ({
        id: item.id,
        kind: "THEORETICAL_CLASS" as const,
        title: item.title,
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        status: item.status,
        context: "Aula teórica",
        href: "/",
      })),
    );
    const todayCount = events.filter(
      (event) =>
        new Date(event.startsAt) >= today.start &&
        new Date(event.startsAt) < today.end,
    ).length;
    return {
      scope: "INSTRUCTOR",
      generatedAt: now.toISOString(),
      metrics: [
        {
          key: "today",
          label: "Aulas hoje",
          value: todayCount,
          format: "NUMBER",
          href: null,
        },
        {
          key: "next",
          label: "Próximos 7 dias",
          value: events.length,
          format: "NUMBER",
          href: null,
        },
        {
          key: "completed",
          label: "Concluídas no mês",
          value: completedLessons + completedClasses,
          format: "NUMBER",
          href: null,
        },
      ],
      tasks: [],
      upcoming: events,
    };
  }

  private tasks(
    values: Array<
      [string, string, string, number, string, "INFO" | "WARNING" | "CRITICAL"]
    >,
  ): TenantDashboardTask[] {
    return values.map(([key, title, description, count, href, tone]) => ({
      key,
      title,
      description,
      count,
      href,
      tone,
    }));
  }

  private mergeEvents(
    ...groups: TenantDashboardEvent[][]
  ): TenantDashboardEvent[] {
    return groups
      .flat()
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 8);
  }

  private empty(
    scope: "STUDENT" | "INSTRUCTOR",
    now: Date,
  ): TenantDashboardResponse {
    return {
      scope,
      generatedAt: now.toISOString(),
      metrics: [],
      tasks: [],
      upcoming: [],
    };
  }
}
