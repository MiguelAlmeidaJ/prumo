import { ForbiddenException } from "@nestjs/common";
import { MembershipRole, MobileOperationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { MobileAccessService } from "./mobile-access.service";

const user: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Aluno",
  email: "aluno@example.com",
  scope: "tenant",
  tenantId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  role: MembershipRole.STUDENT,
  permissions: [],
  platformRole: "USER",
  platformPermissions: [],
  mfaEnabled: false,
};

describe("MobileAccessService", () => {
  it("bloqueia rota de aluno para outro perfil antes de consultar dados", async () => {
    const prisma = { student: { findFirst: vi.fn() } };
    const service = new MobileAccessService(prisma as never);
    await expect(
      service.student({ ...user, role: MembershipRole.INSTRUCTOR }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });

  it("resolve perfil somente pelo usuário e tenant autenticados", async () => {
    const prisma = {
      student: {
        findFirst: vi.fn((input: unknown) => {
          void input;
          return Promise.resolve({ id: "student" });
        }),
      },
    };
    const service = new MobileAccessService(prisma as never);
    await expect(service.student(user)).resolves.toEqual({ id: "student" });
    const input = prisma.student.findFirst.mock.calls[0][0] as {
      where: { tenantId: string; userId: string };
    };
    expect(input.where).toMatchObject({
      tenantId: user.tenantId,
      userId: user.id,
    });
  });

  it("reexecuta a resposta persistida para a mesma chave idempotente", async () => {
    const response = { id: "operation-result" };
    const prisma = {
      mobileOperation: {
        findUnique: vi.fn().mockResolvedValue({
          operation: "START",
          resourceId: "44444444-4444-4444-8444-444444444444",
          status: MobileOperationStatus.COMPLETED,
          response,
        }),
      },
    };
    const action = vi.fn();
    const service = new MobileAccessService(prisma as never);
    await expect(
      service.idempotent(
        user,
        "idempotency-key",
        "START",
        "44444444-4444-4444-8444-444444444444",
        action,
      ),
    ).resolves.toEqual(response);
    expect(action).not.toHaveBeenCalled();
  });
});
