/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { DomainEventStatus, DomainEventType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { DomainEventService } from "./domain-event.service";

function setup(attempts = 1) {
  const prisma = {
    domainEvent: {
      upsert: vi.fn(async ({ create }) => ({ id: "event-id", ...create })),
      findUnique: vi.fn(async () => ({ attempts })),
      update: vi.fn(async ({ data }) => data),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
    },
  };
  const queues = {
    maxAttempts: 3,
    add: vi.fn(async () => "job-id"),
  };
  return {
    service: new DomainEventService(prisma as never, queues as never),
    prisma,
    queues,
  };
}

describe("DomainEventService", () => {
  it("publica com chave idempotente determinística e job idempotente", async () => {
    const { service, prisma, queues } = setup();
    const input = {
      tenantId: "tenant",
      type: DomainEventType.STUDENT_CREATED,
      aggregateType: "Student",
      aggregateId: "student",
      payload: { studentId: "student" },
    };
    await service.publish(input);
    await service.publish(input);
    const first =
      prisma.domainEvent.upsert.mock.calls[0][0].create.idempotencyKey;
    const second =
      prisma.domainEvent.upsert.mock.calls[1][0].create.idempotencyKey;
    expect(first).toBe(second);
    expect(queues.add).toHaveBeenCalledWith(
      "domain-events",
      "dispatch-event",
      { eventId: "event-id" },
      { idempotencyKey: "event-id" },
    );
  });

  it("move para dead letter após o limite de tentativas", async () => {
    const { service, prisma } = setup(3);
    await service.failed("event-id", new Error("provider falhou"));
    expect(prisma.domainEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DomainEventStatus.DEAD_LETTER,
        }),
      }),
    );
  });
});
