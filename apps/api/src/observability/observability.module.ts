import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { InfrastructureHealthService } from "./infrastructure-health.service";
import { HttpObservabilityInterceptor } from "./http-observability.interceptor";
import { MetricsService } from "./metrics.service";
import { MetricsTokenGuard } from "./metrics-token.guard";
import { OperationalController } from "./operational.controller";
import { RequestIdMiddleware } from "./request-id.middleware";
import { StructuredLoggerService } from "./structured-logger.service";
import { SafeExceptionFilter } from "./safe-exception.filter";

@Global()
@Module({
  controllers: [OperationalController],
  providers: [
    MetricsService,
    StructuredLoggerService,
    RequestIdMiddleware,
    InfrastructureHealthService,
    MetricsTokenGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpObservabilityInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: SafeExceptionFilter,
    },
  ],
  exports: [MetricsService, StructuredLoggerService, RequestIdMiddleware],
})
export class ObservabilityModule {}
