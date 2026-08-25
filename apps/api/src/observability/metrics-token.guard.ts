import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";

interface MetricsRequest {
  headers: { authorization?: string };
}

@Injectable()
export class MetricsTokenGuard implements CanActivate {
  private readonly expected: string;
  private readonly protected: boolean;

  constructor(config: ConfigService) {
    this.expected = config.get<string>("METRICS_TOKEN", "");
    this.protected = ["staging", "production"].includes(
      config.get<string>("APP_ENV", "development"),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.protected) return true;
    const authorization =
      context.switchToHttp().getRequest<MetricsRequest>().headers
        .authorization ?? "";
    const actual = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(this.expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException("Autenticação de métricas necessária.");
    }
    return true;
  }
}
