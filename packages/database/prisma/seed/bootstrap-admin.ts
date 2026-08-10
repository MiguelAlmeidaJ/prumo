import {
  AuditActorType,
  PlatformRole,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { hash } from "bcrypt";

const ADMIN_ROLES = [PlatformRole.PLATFORM_ADMIN, PlatformRole.PLATFORM_OWNER];

function bcryptRounds(): number {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
    throw new Error("BCRYPT_ROUNDS deve ser um inteiro entre 10 e 15.");
  }
  return rounds;
}

function bootstrapInput() {
  const name =
    process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrador Prumo";
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL deve conter um e-mail válido.");
  }
  if (
    password.length < 16 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD deve ter ao menos 16 caracteres, com maiúscula, minúscula, número e símbolo.",
    );
  }
  if (/prumo|password|senha|admin|123456/i.test(password)) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD contém um padrão previsível.");
  }
  return { name, email, password };
}

export async function bootstrapAdmin(prisma: PrismaClient) {
  const existingAdmin = await prisma.user.findFirst({
    where: { platformRole: { in: ADMIN_ROLES } },
    select: { id: true, email: true, active: true, platformRole: true },
  });
  if (existingAdmin) {
    return { created: false as const, admin: existingAdmin };
  }

  const input = bootstrapInput();
  const passwordHash = await hash(input.password, bcryptRounds());
  try {
    const admin = await prisma.$transaction(
      async (tx) => {
        const concurrentAdmin = await tx.user.findFirst({
          where: { platformRole: { in: ADMIN_ROLES } },
          select: { id: true, email: true, active: true, platformRole: true },
        });
        if (concurrentAdmin) return concurrentAdmin;

        const existingUser = await tx.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (existingUser) {
          throw new Error(
            "Já existe um usuário com BOOTSTRAP_ADMIN_EMAIL; nenhum dado foi alterado.",
          );
        }

        const created = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash,
            passwordSetAt: new Date(),
            active: true,
            platformRole: PlatformRole.PLATFORM_OWNER,
            communicationSettings: { create: {} },
          },
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            platformRole: true,
            createdAt: true,
          },
        });
        await tx.auditLog.create({
          data: {
            entityType: "User",
            entityId: created.id,
            action: "BOOTSTRAP_ADMIN_CREATED",
            actorType: AuditActorType.SYSTEM,
            reason: "Criação única do primeiro administrador da plataforma.",
            after: {
              id: created.id,
              name: created.name,
              email: created.email,
              active: created.active,
              platformRole: created.platformRole,
              createdAt: created.createdAt.toISOString(),
            },
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { created: "name" in admin, admin } as const;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      const admin = await prisma.user.findFirst({
        where: { platformRole: { in: ADMIN_ROLES } },
        select: { id: true, email: true, active: true, platformRole: true },
      });
      if (admin) return { created: false as const, admin };
    }
    throw error;
  }
}
