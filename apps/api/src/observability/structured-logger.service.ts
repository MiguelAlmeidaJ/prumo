import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type LogLevel = "error" | "info" | "warn";

@Injectable()
export class StructuredLoggerService {
  private readonly environment: string;

  constructor(config: ConfigService) {
    this.environment = config.get<string>("APP_ENV", "development");
  }

  write(level: LogLevel, event: string, fields: Record<string, unknown>): void {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: "prumo-api",
      environment: this.environment,
      event,
      ...fields,
    });
    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  }
}
