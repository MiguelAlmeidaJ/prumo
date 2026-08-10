import {
  AuditActorType,
  PlatformRole,
  type PrismaClient,
} from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapAdmin } from "../prisma/seed/bootstrap-admin";

const ADMIN = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "owner@example.com",
  active: false,
  platformRole: PlatformRole.PLATFORM_OWNER,
};

afterEach(() => {
  delete process.env.BOOTSTRAP_ADMIN_NAME;
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
});

describe("bootstrapAdmin", () => {
  it("não altera nem reativa um administrador existente", async () => {
    const transaction = vi.fn();
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue(ADMIN) },
      $transaction: transaction,
    } as unknown as PrismaClient;

    await expect(bootstrapAdmin(prisma)).resolves.toEqual({
      created: false,
      admin: ADMIN,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("cria o primeiro proprietário e registra auditoria sem a senha", async () => {
    process.env.BOOTSTRAP_ADMIN_NAME = "Primeiro Proprietário";
    process.env.BOOTSTRAP_ADMIN_EMAIL = "OWNER@EXAMPLE.COM";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "F0rte!Unica#2026x";
    const createdAt = new Date("2026-08-10T12:00:00.000Z");
    const created = {
      ...ADMIN,
      name: "Primeiro Proprietário",
      email: "owner@example.com",
      active: true,
      createdAt,
    };
    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-id" }) },
    };
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    } as unknown as PrismaClient;

    await expect(bootstrapAdmin(prisma)).resolves.toMatchObject({
      created: true,
      admin: created,
    });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "owner@example.com",
          active: true,
          platformRole: PlatformRole.PLATFORM_OWNER,
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "BOOTSTRAP_ADMIN_CREATED",
        actorType: AuditActorType.SYSTEM,
        after: expect.not.objectContaining({ password: expect.anything() }),
      }),
    });
  });

  it("recusa reutilizar o e-mail de um usuário comum", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "user@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "F0rte!Unica#2026x";
    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({ id: "existing-user" }),
      },
    };
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    } as unknown as PrismaClient;

    await expect(bootstrapAdmin(prisma)).rejects.toThrow(
      /nenhum dado foi alterado/,
    );
  });
});
