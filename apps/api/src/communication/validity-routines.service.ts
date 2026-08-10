import { Injectable } from "@nestjs/common";
import {
  DomainEventType,
  ReceivableStatus,
  ScheduledTaskStatus,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { DomainEventService } from "./domain-event.service";

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

@Injectable()
export class ValidityRoutinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async run(now = new Date()): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ["TRIAL", "ACTIVE"] } },
      select: { id: true },
    });
    for (const tenant of tenants) await this.runTenant(tenant.id, now);
  }

  async runTenant(tenantId: string, now = new Date()) {
    const periodKey = utcDay(now);
    const existing = await this.prisma.scheduledTaskExecution.findUnique({
      where: {
        tenantId_taskName_periodKey: {
          tenantId,
          taskName: "communication-validity-routines",
          periodKey,
        },
      },
    });
    if (existing?.status === ScheduledTaskStatus.COMPLETED) return existing;
    const execution = existing
      ? await this.prisma.scheduledTaskExecution.update({
          where: { id: existing.id },
          data: { status: ScheduledTaskStatus.RUNNING, startedAt: now },
        })
      : await this.prisma.scheduledTaskExecution.create({
          data: {
            tenantId,
            taskName: "communication-validity-routines",
            periodKey,
          },
        });
    let scanned = 0;
    let created = 0;
    try {
      const [dueSoon, overdue, processes, documents] = await Promise.all([
        this.prisma.receivableInstallment.findMany({
          where: {
            tenantId,
            status: {
              in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_PAID],
            },
            balanceCents: { gt: 0 },
            dueDate: { gte: now, lte: plusDays(now, 3) },
          },
          select: {
            id: true,
            studentId: true,
            dueDate: true,
            balanceCents: true,
          },
        }),
        this.prisma.receivableInstallment.findMany({
          where: {
            tenantId,
            status: {
              in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_PAID],
            },
            balanceCents: { gt: 0 },
            dueDate: { lt: now },
          },
          select: {
            id: true,
            studentId: true,
            dueDate: true,
            balanceCents: true,
          },
        }),
        this.prisma.studentLicenseProcess.findMany({
          where: {
            tenantId,
            status: {
              in: ["DRAFT", "PENDING_DOCUMENTS", "IN_PROGRESS", "SUSPENDED"],
            },
            expiresAt: { gte: now, lte: plusDays(now, 30) },
          },
          select: { id: true, studentId: true, expiresAt: true },
        }),
        this.prisma.studentDocument.findMany({
          where: {
            tenantId,
            expiresAt: { gte: now, lte: plusDays(now, 30) },
          },
          select: { id: true, studentId: true, expiresAt: true },
        }),
      ]);
      scanned =
        dueSoon.length + overdue.length + processes.length + documents.length;
      for (const item of dueSoon) {
        await this.events.publish({
          tenantId,
          type: DomainEventType.INSTALLMENT_DUE_SOON,
          aggregateType: "ReceivableInstallment",
          aggregateId: item.id,
          payload: {
            installmentId: item.id,
            studentId: item.studentId,
            dueDate: item.dueDate.toISOString(),
            balanceCents: item.balanceCents,
          },
          idempotencyKey: `installment-due-soon:${tenantId}:${item.id}:${periodKey}`,
        });
        created += 1;
      }
      for (const item of overdue) {
        const claimed = await this.prisma.receivableInstallment.updateMany({
          where: {
            id: item.id,
            tenantId,
            status: {
              in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_PAID],
            },
            balanceCents: { gt: 0 },
            dueDate: { lt: now },
          },
          data: { status: ReceivableStatus.OVERDUE },
        });
        if (claimed.count !== 1) continue;
        await this.events.publish({
          tenantId,
          type: DomainEventType.INSTALLMENT_OVERDUE,
          aggregateType: "ReceivableInstallment",
          aggregateId: item.id,
          payload: {
            installmentId: item.id,
            studentId: item.studentId,
            dueDate: item.dueDate.toISOString(),
            balanceCents: item.balanceCents,
          },
          idempotencyKey: `installment-overdue:${tenantId}:${item.id}:${periodKey}`,
        });
        created += 1;
      }
      for (const process of processes) {
        await this.events.publish({
          tenantId,
          type: DomainEventType.PROCESS_EXPIRING,
          aggregateType: "StudentLicenseProcess",
          aggregateId: process.id,
          payload: {
            processId: process.id,
            studentId: process.studentId,
            expiresAt: process.expiresAt?.toISOString(),
          },
          idempotencyKey: `process-expiring:${tenantId}:${process.id}:${periodKey}`,
        });
        created += 1;
      }
      for (const document of documents) {
        await this.events.publish({
          tenantId,
          type: DomainEventType.DOCUMENT_EXPIRING,
          aggregateType: "StudentDocument",
          aggregateId: document.id,
          payload: {
            documentId: document.id,
            studentId: document.studentId,
            expiresAt: document.expiresAt?.toISOString(),
          },
          idempotencyKey: `document-expiring:${tenantId}:${document.id}:${periodKey}`,
        });
        created += 1;
      }
      return this.prisma.scheduledTaskExecution.update({
        where: { id: execution.id },
        data: {
          status: ScheduledTaskStatus.COMPLETED,
          recordsScanned: scanned,
          eventsCreated: created,
          completedAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      await this.prisma.scheduledTaskExecution.update({
        where: { id: execution.id },
        data: {
          status: ScheduledTaskStatus.FAILED,
          recordsScanned: scanned,
          eventsCreated: created,
          completedAt: new Date(),
          lastError:
            error instanceof Error
              ? error.message.slice(0, 1500)
              : String(error),
        },
      });
      throw error;
    }
  }
}
