import { Injectable } from "@nestjs/common";
import {
  DomainEventStatus,
  type DomainEventType,
  Prisma,
} from "@prumo/database";
import { PrismaService } from "../database/prisma.service";
import { CommunicationQueueService } from "./queue.service";
import { safeError, stableKey } from "./communication.utils";

type EventDatabase = PrismaService | Prisma.TransactionClient;

export interface PublishDomainEventInput {
  tenantId?: string | null;
  type: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
  idempotencyKey?: string;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class DomainEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: CommunicationQueueService,
  ) {}

  async publish(input: PublishDomainEventInput) {
    const event = await this.create(this.prisma, input);
    await this.enqueue(event.id);
    return event;
  }

  publishInTransaction(
    transaction: Prisma.TransactionClient,
    input: PublishDomainEventInput,
  ) {
    return this.create(transaction, input);
  }

  private create(database: EventDatabase, input: PublishDomainEventInput) {
    const idempotencyKey =
      input.idempotencyKey ??
      stableKey([
        input.tenantId,
        input.type,
        input.aggregateType,
        input.aggregateId,
        input.occurredAt?.toISOString(),
      ]);
    return database.domainEvent.upsert({
      where: { idempotencyKey },
      create: {
        tenantId: input.tenantId,
        type: input.type,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: json(input.payload),
        occurredAt: input.occurredAt,
        idempotencyKey,
      },
      update: {},
    });
  }

  enqueue(eventId: string) {
    return this.queues.add(
      "domain-events",
      "dispatch-event",
      { eventId },
      { idempotencyKey: eventId },
    );
  }

  async dispatchPending(): Promise<number> {
    const events = await this.prisma.domainEvent.findMany({
      where: {
        status: {
          in: [DomainEventStatus.PENDING, DomainEventStatus.FAILED],
        },
        attempts: { lt: this.queues.maxAttempts },
      },
      select: { id: true },
      orderBy: { occurredAt: "asc" },
      take: 200,
    });
    await Promise.all(events.map(({ id }) => this.enqueue(id)));
    return events.length;
  }

  async begin(eventId: string): Promise<boolean> {
    const result = await this.prisma.domainEvent.updateMany({
      where: {
        id: eventId,
        status: {
          in: [DomainEventStatus.PENDING, DomainEventStatus.FAILED],
        },
        attempts: { lt: this.queues.maxAttempts },
      },
      data: {
        status: DomainEventStatus.PROCESSING,
        attempts: { increment: 1 },
        processingStartedAt: new Date(),
        failedAt: null,
        lastError: null,
      },
    });
    return result.count === 1;
  }

  async processed(eventId: string): Promise<void> {
    await this.prisma.domainEvent.updateMany({
      where: { id: eventId, status: DomainEventStatus.PROCESSING },
      data: {
        status: DomainEventStatus.PROCESSED,
        processedAt: new Date(),
        lastError: null,
      },
    });
  }

  async failed(eventId: string, error: unknown): Promise<void> {
    const event = await this.prisma.domainEvent.findUnique({
      where: { id: eventId },
      select: { attempts: true },
    });
    if (!event) return;
    await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        status:
          event.attempts >= this.queues.maxAttempts
            ? DomainEventStatus.DEAD_LETTER
            : DomainEventStatus.FAILED,
        failedAt: new Date(),
        lastError: safeError(error),
      },
    });
  }

  async reprocess(tenantId: string, eventId: string) {
    const result = await this.prisma.domainEvent.updateMany({
      where: { id: eventId, tenantId },
      data: {
        status: DomainEventStatus.PENDING,
        attempts: 0,
        processingStartedAt: null,
        processedAt: null,
        failedAt: null,
        lastError: null,
      },
    });
    if (!result.count) return null;
    await this.enqueue(eventId);
    return this.prisma.domainEvent.findUnique({ where: { id: eventId } });
  }
}
