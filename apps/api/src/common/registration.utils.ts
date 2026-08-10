import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export function digits(value: unknown): unknown {
  return typeof value === "string" ? value.replace(/\D/g, "") : value;
}

export function upper(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

export function nullable(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function optionalDate(
  value: string | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}

export function throwConflict(
  error: unknown,
  message: string,
): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
