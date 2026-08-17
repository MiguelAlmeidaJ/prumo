import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { CommunicationQueueService } from "../communication/queue.service";
import { PrismaService } from "../database/prisma.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { MetricsService } from "./metrics.service";

interface ComponentStatus {
  status: "disabled" | "down" | "up";
  latencyMs?: number;
}

export interface ReadinessReport {
  status: "not_ready" | "ready";
  timestamp: string;
  checks: {
    postgres: ComponentStatus;
    redis: ComponentStatus;
    queues: ComponentStatus;
    storage: ComponentStatus;
  };
}

const CHECK_TIMEOUT_MS = 3_000;

@Injectable()
export class InfrastructureHealthService implements OnApplicationShutdown {
  private readonly redis: Redis;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly queues: CommunicationQueueService,
    private readonly storage: ObjectStorageService,
    private readonly metrics: MetricsService,
  ) {
    this.redis = new Redis(
      config.get<string>("REDIS_URL", "redis://localhost:6379"),
      {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: CHECK_TIMEOUT_MS,
      },
    );
    this.redis.on("error", () => undefined);
  }

  async readiness(): Promise<ReadinessReport> {
    const [postgres, redis, queues, storage] = await Promise.all([
      this.check(() => this.prisma.$queryRaw`SELECT 1`),
      this.check(() => this.pingRedis()),
      this.queues.enabled
        ? this.check(() => this.queues.healthSnapshot())
        : Promise.resolve<ComponentStatus>({ status: "disabled" }),
      this.check(() => this.storage.checkHealth()),
    ]);
    const checks = { postgres, redis, queues, storage };
    for (const [component, result] of Object.entries(checks)) {
      this.metrics.setComponent(component, result.status !== "down");
    }
    return {
      status: Object.values(checks).some(({ status }) => status === "down")
        ? "not_ready"
        : "ready",
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  async refreshOperationalMetrics(): Promise<void> {
    const report = await this.readiness();
    if (report.checks.postgres.status === "up") {
      try {
        const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count
          FROM pg_stat_activity
          WHERE datname = current_database()
        `;
        this.metrics.setDatabaseConnections(Number(rows[0]?.count ?? 0));
      } catch {
        this.metrics.setComponent("postgres", false);
      }
    }
    if (this.queues.enabled && report.checks.queues.status === "up") {
      try {
        const snapshot = await this.queues.healthSnapshot();
        for (const queue of snapshot.queues) {
          this.metrics.setQueueJobs(queue.name, {
            active: queue.active,
            delayed: queue.delayed,
            failed: queue.failed,
            paused: queue.paused,
            waiting: queue.waiting,
          });
        }
      } catch {
        this.metrics.setComponent("queues", false);
      }
    }
  }

  onApplicationShutdown(): void {
    this.redis.disconnect(false);
  }

  private async pingRedis(): Promise<void> {
    if (this.redis.status === "wait") await this.redis.connect();
    await this.redis.ping();
  }

  private async check(
    operation: () => Promise<unknown>,
  ): Promise<ComponentStatus> {
    const startedAt = performance.now();
    try {
      await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("health check timeout")),
            CHECK_TIMEOUT_MS,
          ),
        ),
      ]);
      return {
        status: "up",
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      };
    } catch {
      return {
        status: "down",
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      };
    }
  }
}
