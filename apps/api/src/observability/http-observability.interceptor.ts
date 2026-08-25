import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { catchError, finalize, throwError, type Observable } from "rxjs";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { MetricsService } from "./metrics.service";
import { StructuredLoggerService } from "./structured-logger.service";

interface ObservedRequest extends AuthenticatedRequest {
  method: string;
  path: string;
  requestId?: string;
  route?: { path?: string };
}

interface ObservedResponse {
  statusCode: number;
}

@Injectable()
export class HttpObservabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<ObservedRequest>();
    const response = http.getResponse<ObservedResponse>();
    const startedAt = performance.now();
    let exception: unknown;
    let exceptionStatus: number | undefined;

    return next.handle().pipe(
      catchError((error: unknown) => {
        exception = error;
        exceptionStatus =
          error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const durationMs = performance.now() - startedAt;
        const route = request.route?.path ?? request.path ?? "unknown";
        const status = exceptionStatus ?? response.statusCode;
        this.metrics.observeHttp({
          method: request.method,
          route,
          status,
          durationSeconds: durationMs / 1_000,
        });
        this.logger.write(status >= 500 ? "error" : "info", "http.request", {
          requestId: request.requestId,
          userId: request.user?.id ?? null,
          tenantId: request.tenant?.id ?? request.user?.tenantId ?? null,
          method: request.method,
          route,
          status,
          durationMs: Math.round(durationMs * 100) / 100,
          error:
            exception instanceof Error
              ? { name: exception.name }
              : exception
                ? { name: "UnknownError" }
                : null,
        });
      }),
    );
  }
}
