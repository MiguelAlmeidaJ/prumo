import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generate/prisma";

export { PrismaClient } from "./generate/prisma";
export * from "./generate/prisma";

export function isPrismaKnownRequestError(
  error: unknown,
): error is { code: string } {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

export function createPrismaAdapter(
  connectionString = process.env.DATABASE_URL,
): PrismaPg {
  if (!connectionString) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  return new PrismaPg({ connectionString });
}

export function createPrismaClient(
  connectionString = process.env.DATABASE_URL,
): PrismaClient {
  return new PrismaClient({
    adapter: createPrismaAdapter(connectionString),
  });
}
