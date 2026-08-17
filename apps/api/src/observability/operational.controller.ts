import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { InfrastructureHealthService } from "./infrastructure-health.service";
import { MetricsService } from "./metrics.service";
import { MetricsTokenGuard } from "./metrics-token.guard";

@Controller()
export class OperationalController {
  constructor(
    private readonly infrastructure: InfrastructureHealthService,
    private readonly metrics: MetricsService,
  ) {}

  @Get("health")
  health() {
    return {
      status: "ok",
      service: "prumo-api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async ready() {
    const report = await this.infrastructure.readiness();
    if (report.status !== "ready") {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  @Get("metrics")
  @UseGuards(MetricsTokenGuard)
  @Header("Cache-Control", "no-store")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async prometheus(): Promise<string> {
    await this.infrastructure.refreshOperationalMetrics();
    return this.metrics.render();
  }
}
