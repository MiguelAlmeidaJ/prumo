import { Injectable } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly requests = new Counter({
    name: "prumo_http_requests_total",
    help: "Total de requisições HTTP da API.",
    labelNames: ["method", "route", "status"],
    registers: [this.registry],
  });
  private readonly duration = new Histogram({
    name: "prumo_http_request_duration_seconds",
    help: "Duração das requisições HTTP da API.",
    labelNames: ["method", "route", "status"],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly componentUp = new Gauge({
    name: "prumo_dependency_up",
    help: "Disponibilidade das dependências da API.",
    labelNames: ["component"],
    registers: [this.registry],
  });
  private readonly databaseConnections = new Gauge({
    name: "prumo_postgres_connections",
    help: "Conexões PostgreSQL observadas pela aplicação.",
    registers: [this.registry],
  });
  private readonly queueJobs = new Gauge({
    name: "prumo_queue_jobs",
    help: "Jobs BullMQ por fila e estado.",
    labelNames: ["queue", "state"],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ prefix: "prumo_", register: this.registry });
  }

  observeHttp(input: {
    method: string;
    route: string;
    status: number;
    durationSeconds: number;
  }): void {
    const labels = {
      method: input.method,
      route: input.route,
      status: String(input.status),
    };
    this.requests.inc(labels);
    this.duration.observe(labels, input.durationSeconds);
  }

  setComponent(component: string, up: boolean): void {
    this.componentUp.set({ component }, up ? 1 : 0);
  }

  setDatabaseConnections(value: number): void {
    this.databaseConnections.set(value);
  }

  setQueueJobs(
    queue: string,
    counts: Record<
      "active" | "delayed" | "failed" | "paused" | "waiting",
      number
    >,
  ): void {
    for (const [state, count] of Object.entries(counts)) {
      this.queueJobs.set({ queue, state }, count);
    }
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
