import { createHash } from "node:crypto";
import { SAFE_ERROR_LENGTH } from "./communication.constants";

export function stableKey(
  parts: Array<string | number | null | undefined>,
): string {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "").join("|"))
    .digest("hex");
}

export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\b(?:Exponent|Expo)PushToken\[[^\]]+\]/gi, "[REDACTED_PUSH_TOKEN]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /(authorization|password|secret|token|api[-_]?key)\s*(?:[:=]|\s)\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .slice(0, SAFE_ERROR_LENGTH);
}

export function maskDestination(destination: string): string {
  const at = destination.indexOf("@");
  if (at > 0) {
    const local = destination.slice(0, at);
    return `${local.slice(0, Math.min(2, local.length))}***${destination.slice(at)}`;
  }
  return destination.length <= 6
    ? "***"
    : `${destination.slice(0, 3)}***${destination.slice(-3)}`;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function isWithinQuietHours(
  now: Date,
  timezone: string,
  quietHoursStart?: string | null,
  quietHoursEnd?: string | null,
): boolean {
  if (!quietHoursStart || !quietHoursEnd) return false;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  if (quietHoursStart <= quietHoursEnd) {
    return time >= quietHoursStart && time < quietHoursEnd;
  }
  return time >= quietHoursStart || time < quietHoursEnd;
}
