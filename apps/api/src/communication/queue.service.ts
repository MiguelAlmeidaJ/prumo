import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, type JobsOptions, type Processor, Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import {
  COMMUNICATION_QUEUES,
  type CommunicationQueueName,
} from "./communication.constants";
import { stableKey } from "./communication.utils";

function connectionFrom(urlValue: string): ConnectionOptions {
  const url = new URL(urlValue);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}

@Injectable()
export class CommunicationQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(CommunicationQueueService.name);
  private readonly queues = new Map<CommunicationQueueName, Queue>();
  private readonly workers: Worker[] = [];
  private readonly connection: ConnectionOptions;
  readonly enabled: boolean;
  readonly maxAttempts: number;

  constructor(config: ConfigService) {
    const configured = config.get<string>("QUEUE_ENABLED");
    this.enabled =
      process.env.NODE_ENV !== "test" && configured?.toLowerCase() !== "false";
    this.maxAttempts = Math.max(
      1,
      Number(config.get<string>("QUEUE_MAX_ATTEMPTS", "5")),
    );
    this.connection = connectionFrom(
      config.get<string>("REDIS_URL", "redis://localhost:6379"),
    );
  }

  private queue(name: CommunicationQueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connection,
        defaultJobOptions: this.jobOptions(),
      });
      queue.on("error", (error) =>
        this.logger.error(
          JSON.stringify({
            queue: name,
            event: "queue.error",
            error: error.message,
          }),
        ),
      );
      this.queues.set(name, queue);
    }
    return queue;
  }

  private jobOptions(): JobsOptions {
    return {
      attempts: this.maxAttempts,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 604_800, count: 10_000 },
    };
  }

  async add(
    queueName: CommunicationQueueName,
    jobName: string,
    data: Record<string, unknown>,
    options: JobsOptions & { idempotencyKey?: string } = {},
  ): Promise<string | undefined> {
    if (!this.enabled) return undefined;
    const { idempotencyKey, ...jobOptions } = options;
    const jobId = `job-${stableKey([
      queueName,
      jobName,
      idempotencyKey ?? JSON.stringify(data),
    ])}`;
    const job = await this.queue(queueName).add(jobName, data, {
      ...this.jobOptions(),
      ...jobOptions,
      jobId,
    });
    this.logger.log(
      JSON.stringify({
        event: "queue.job.queued",
        queue: queueName,
        job: jobName,
        jobId: job.id,
      }),
    );
    return job.id;
  }

  register(
    queueName: CommunicationQueueName,
    processor: Processor,
    concurrency = 5,
  ): void {
    if (!this.enabled) return;
    const worker = new Worker(queueName, processor, {
      connection: this.connection,
      concurrency,
    });
    worker.on("completed", (job) =>
      this.logger.log(
        JSON.stringify({
          event: "queue.job.completed",
          queue: queueName,
          jobId: job.id,
          attempts: job.attemptsMade,
        }),
      ),
    );
    worker.on("failed", (job, error) =>
      this.logger.error(
        JSON.stringify({
          event: "queue.job.failed",
          queue: queueName,
          jobId: job?.id,
          attempts: job?.attemptsMade,
          final: Boolean(
            job && job.attemptsMade >= Number(job.opts.attempts ?? 1),
          ),
          error: error.message,
        }),
      ),
    );
    worker.on("error", (error) =>
      this.logger.error(
        JSON.stringify({
          event: "queue.worker.error",
          queue: queueName,
          error: error.message,
        }),
      ),
    );
    this.workers.push(worker);
  }

  async scheduleInfrastructureJobs(): Promise<void> {
    if (!this.enabled) return;
    await this.add(
      "domain-events",
      "dispatch-pending",
      {},
      { repeat: { every: 30_000 }, idempotencyKey: "outbox-dispatcher" },
    );
    await this.add(
      "domain-events",
      "validity-routines",
      {},
      {
        repeat: { pattern: "15 * * * *" },
        idempotencyKey: "validity-routines",
      },
    );
  }

  async cancelReminders(input: {
    tenantId: string;
    aggregateType: string;
    aggregateId: string;
  }): Promise<number> {
    if (!this.enabled) return 0;
    const queue = this.queue("reminders");
    const jobs = await queue.getJobs(["delayed", "waiting", "prioritized"]);
    let cancelled = 0;
    for (const job of jobs) {
      const data = job.data as Record<string, unknown>;
      if (
        data.tenantId === input.tenantId &&
        data.aggregateType === input.aggregateType &&
        data.aggregateId === input.aggregateId
      ) {
        await job.remove();
        cancelled += 1;
      }
    }
    return cancelled;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
    await Promise.allSettled(
      [...this.queues.values()].map((queue) => queue.close()),
    );
  }

  queueNames(): readonly CommunicationQueueName[] {
    return COMMUNICATION_QUEUES;
  }
}
