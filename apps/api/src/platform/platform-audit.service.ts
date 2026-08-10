import { Injectable } from "@nestjs/common";
import { AuditActorType, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface PlatformAuditInput {
  platformUserId: string;
  tenantId?: string;
  supportSessionId?: string;
  entityType: string;
  entityId: string;
  action: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    input: PlatformAuditInput,
    transaction: Prisma.TransactionClient = this.prisma,
  ) {
    return transaction.auditLog.create({
      data: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorType: input.supportSessionId
          ? AuditActorType.SUPPORT
          : AuditActorType.PLATFORM_USER,
        platformUserId: input.platformUserId,
        supportSessionId: input.supportSessionId,
        reason: input.reason,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        before:
          input.before === undefined ? undefined : jsonValue(input.before),
        after:
          input.after === undefined ? undefined : jsonValue(input.after),
      },
    });
  }
}
