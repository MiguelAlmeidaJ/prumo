import { BadRequestException, ConflictException } from "@nestjs/common";
import { LessonStatus, Prisma, Weekday } from "@prisma/client";

export const ACTIVE_LESSON_STATUSES = [
  LessonStatus.PENDING,
  LessonStatus.CONFIRMED,
  LessonStatus.IN_PROGRESS,
] as const;

const WEEKDAYS = [
  Weekday.SUNDAY,
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
] as const;

export function parseInterval(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  ) {
    throw new BadRequestException("startsAt deve ser anterior a endsAt.");
  }
  return { start, end };
}

export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[date.getUTCDay()];
}

export function utcTime(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

export function ensureSameUtcDay(start: Date, end: Date): void {
  if (
    start.getUTCFullYear() !== end.getUTCFullYear() ||
    start.getUTCMonth() !== end.getUTCMonth() ||
    start.getUTCDate() !== end.getUTCDate()
  ) {
    throw new ConflictException("A aula deve começar e terminar no mesmo dia.");
  }
}

export async function lockScheduleResources(
  tx: Prisma.TransactionClient,
  tenantId: string,
  resources: string[],
): Promise<void> {
  const keys = [...new Set(resources)].sort();
  for (const resource of keys) {
    const lockKey = `${tenantId}:${resource}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  }
}
