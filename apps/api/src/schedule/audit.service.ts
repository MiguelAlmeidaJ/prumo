import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  record(
    transaction: Prisma.TransactionClient,
    input: {
      tenantId: string;
      entityType: string;
      entityId: string;
      action: string;
      actorUserId: string;
      before?: unknown;
      after?: unknown;
    },
  ) {
    return transaction.auditLog.create({
      data: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId: input.actorUserId,
        before:
          input.before === undefined ? undefined : jsonValue(input.before),
        after: input.after === undefined ? undefined : jsonValue(input.after),
      },
    });
  }
}
