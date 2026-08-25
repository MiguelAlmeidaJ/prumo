import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {
  isPrismaKnownRequestError,
  MembershipRole,
  MobileOperationStatus,
  Prisma,
} from "@prumo/database";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class MobileAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async student(user: AuthenticatedUser) {
    if (user.role !== MembershipRole.STUDENT) {
      throw new ForbiddenException("Esta rota é exclusiva para alunos.");
    }
    let student = await this.prisma.student.findFirst({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        socialName: true,
        email: true,
        phone: true,
      },
    });
    if (!student) {
      const candidates = await this.prisma.student.findMany({
        where: {
          tenantId: user.tenantId,
          userId: null,
          email: { equals: user.email, mode: "insensitive" },
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          socialName: true,
          email: true,
          phone: true,
        },
        take: 2,
      });
      if (candidates.length === 1) {
        student = await this.prisma.student.update({
          where: { id: candidates[0].id },
          data: { userId: user.id },
          select: {
            id: true,
            name: true,
            socialName: true,
            email: true,
            phone: true,
          },
        });
      }
    }
    if (!student) {
      throw new ForbiddenException(
        "A conta não está vinculada a um aluno ativo neste tenant.",
      );
    }
    return student;
  }

  async instructor(user: AuthenticatedUser) {
    if (user.role !== MembershipRole.INSTRUCTOR) {
      throw new ForbiddenException("Esta rota é exclusiva para instrutores.");
    }
    let instructor = await this.prisma.instructor.findFirst({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        licenseCategory: true,
        credentialNumber: true,
      },
    });
    if (!instructor) {
      const candidates = await this.prisma.instructor.findMany({
        where: {
          tenantId: user.tenantId,
          userId: null,
          email: { equals: user.email, mode: "insensitive" },
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          licenseCategory: true,
          credentialNumber: true,
        },
        take: 2,
      });
      if (candidates.length === 1) {
        instructor = await this.prisma.instructor.update({
          where: { id: candidates[0].id },
          data: { userId: user.id },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            licenseCategory: true,
            credentialNumber: true,
          },
        });
      }
    }
    if (!instructor) {
      throw new ForbiddenException(
        "A conta não está vinculada a um instrutor ativo neste tenant.",
      );
    }
    return instructor;
  }

  async idempotent<T>(
    user: AuthenticatedUser,
    key: string | undefined,
    operation: string,
    resourceId: string | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    const normalizedKey = key?.trim();
    if (!normalizedKey || normalizedKey.length < 8 || normalizedKey.length > 200) {
      throw new ConflictException(
        "Informe uma Idempotency-Key válida para esta operação.",
      );
    }
    const unique = {
      tenantId_userId_idempotencyKey: {
        tenantId: user.tenantId,
        userId: user.id,
        idempotencyKey: normalizedKey,
      },
    };
    const existing = await this.prisma.mobileOperation.findUnique({
      where: unique,
    });
    if (existing) {
      if (
        existing.operation !== operation ||
        existing.resourceId !== (resourceId ?? null)
      ) {
        throw new ConflictException(
          "A chave idempotente já foi usada em outra operação.",
        );
      }
      if (
        existing.status === MobileOperationStatus.COMPLETED &&
        existing.response !== null
      ) {
        return existing.response as T;
      }
      if (existing.status === MobileOperationStatus.PROCESSING) {
        throw new ConflictException("A operação já está em processamento.");
      }
      await this.prisma.mobileOperation.update({
        where: { id: existing.id },
        data: {
          status: MobileOperationStatus.PROCESSING,
          lastError: null,
        },
      });
    } else {
      try {
        await this.prisma.mobileOperation.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            idempotencyKey: normalizedKey,
            operation,
            resourceId,
          },
        });
      } catch (error) {
        if (
          isPrismaKnownRequestError(error) &&
          error.code === "P2002"
        ) {
          throw new ConflictException("A operação já está em processamento.");
        }
        throw error;
      }
    }
    try {
      const result = await action();
      await this.prisma.mobileOperation.update({
        where: unique,
        data: {
          status: MobileOperationStatus.COMPLETED,
          response: json(result),
          lastError: null,
        },
      });
      return result;
    } catch (error) {
      await this.prisma.mobileOperation.update({
        where: unique,
        data: {
          status: MobileOperationStatus.FAILED,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Falha não identificada.",
        },
      });
      throw error;
    }
  }
}
