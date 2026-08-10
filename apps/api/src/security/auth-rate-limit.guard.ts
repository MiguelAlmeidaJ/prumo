import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { createHash } from "node:crypto";

type RequestLike = {
  originalUrl?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
  body?: { email?: unknown };
  res?: { setHeader(name: string, value: string): void };
};

type Rule = {
  name: string;
  limit: number;
  windowMs: number;
  identity: boolean;
};
type MemoryEntry = { count: number; expiresAt: number };

const RULES: Array<[RegExp, Rule]> = [
  [
    /\/auth\/login$/,
    { name: "login", limit: 10, windowMs: 15 * 60_000, identity: true },
  ],
  [
    /\/auth\/forgot-password$/,
    { name: "forgot", limit: 5, windowMs: 60 * 60_000, identity: true },
  ],
  [
    /\/auth\/set-password$/,
    { name: "credential", limit: 10, windowMs: 15 * 60_000, identity: false },
  ],
  [
    /\/auth\/refresh$/,
    { name: "refresh", limit: 120, windowMs: 15 * 60_000, identity: false },
  ],
];

@Injectable()
export class AuthRateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(AuthRateLimitGuard.name);
  private readonly enabled: boolean;
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(config: ConfigService) {
    this.enabled =
      process.env.NODE_ENV !== "test" &&
      config.get<string>("AUTH_RATE_LIMIT_ENABLED", "true") !== "false";
    this.redis = this.enabled
      ? new Redis(config.get<string>("REDIS_URL", "redis://localhost:6379"), {
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (attempt) => (attempt <= 3 ? attempt * 250 : null),
        })
      : null;
    this.redis?.on("error", () => undefined);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) return true;
    const request = context.switchToHttp().getRequest<RequestLike>();
    const rule = this.rule(request.originalUrl ?? "");
    const ip = request.ip ?? request.socket?.remoteAddress ?? "unknown";
    const keys = [`prumo:rate:${rule.name}:ip:${this.digest(ip)}`];
    const email =
      typeof request.body?.email === "string"
        ? request.body.email.trim().toLowerCase()
        : null;
    if (rule.identity && email) {
      keys.push(`prumo:rate:${rule.name}:identity:${this.digest(email)}`);
    }

    let retryAfterMs = 0;
    for (const key of keys) {
      retryAfterMs = Math.max(retryAfterMs, await this.consume(key, rule));
    }
    if (retryAfterMs > 0) {
      const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      request.res?.setHeader("Retry-After", String(seconds));
      throw new HttpException(
        "Muitas tentativas. Aguarde antes de tentar novamente.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  private rule(url: string): Rule {
    return (
      RULES.find(([pattern]) => pattern.test(url))?.[1] ?? {
        name: "auth",
        limit: 30,
        windowMs: 15 * 60_000,
        identity: false,
      }
    );
  }

  private async consume(key: string, rule: Rule): Promise<number> {
    if (this.redis?.status === "ready") {
      try {
        const count = await this.redis.incr(key);
        if (count === 1) await this.redis.pexpire(key, rule.windowMs);
        const remaining = await this.redis.pttl(key);
        return count > rule.limit ? Math.max(remaining, 1000) : 0;
      } catch (error) {
        this.logger.warn(
          `Redis indisponível para rate limit; usando proteção local (${error instanceof Error ? error.name : "erro"}).`,
        );
      }
    }
    const now = Date.now();
    const current = this.memory.get(key);
    const entry =
      !current || current.expiresAt <= now
        ? { count: 1, expiresAt: now + rule.windowMs }
        : { ...current, count: current.count + 1 };
    this.memory.set(key, entry);
    if (this.memory.size > 10_000) {
      for (const [candidate, value] of this.memory) {
        if (value.expiresAt <= now) this.memory.delete(candidate);
      }
    }
    return entry.count > rule.limit ? entry.expiresAt - now : 0;
  }

  private digest(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 24);
  }
}
