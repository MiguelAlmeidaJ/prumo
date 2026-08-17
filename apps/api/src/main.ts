import { ConsoleLogger, RequestMethod, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { timingSafeEqual } from "node:crypto";
import helmet from "helmet";
import { AppModule } from "./app.module";
import type { AppEnvironment } from "./config/environment";
import { StructuredLoggerService } from "./observability/structured-logger.service";

interface SwaggerRequest {
  headers: { authorization?: string };
}

interface SwaggerResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { send(body: string): void };
}

function constantTimeMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function swaggerBasicAuth(config: ConfigService) {
  const expectedUsername = config.getOrThrow<string>("SWAGGER_USERNAME");
  const expectedPassword = config.getOrThrow<string>("SWAGGER_PASSWORD");
  return (
    request: SwaggerRequest,
    response: SwaggerResponse,
    next: () => void,
  ) => {
    const authorization = request.headers.authorization ?? "";
    const [scheme, encoded] = authorization.split(" ", 2);
    let username = "";
    let password = "";
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator >= 0) {
        username = decoded.slice(0, separator);
        password = decoded.slice(separator + 1);
      }
    }
    if (
      constantTimeMatch(username, expectedUsername) &&
      constantTimeMatch(password, expectedPassword)
    ) {
      next();
      return;
    }
    response.setHeader("WWW-Authenticate", 'Basic realm="Prumo Swagger"');
    response.status(401).send("Autenticação necessária.");
  };
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ json: true, colors: false }),
  });
  const configService = app.get(ConfigService);
  const appEnvironment = configService.get<AppEnvironment>("APP_ENV")!;
  const isProduction = appEnvironment === "production";
  const isDeployed = isProduction || appEnvironment === "staging";

  if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
    }),
  );

  // Um arquivo binário de 10 MB ocupa até ~13,4 MB quando codificado em base64.
  app.useBodyParser("json", { limit: "14mb" });
  app.useBodyParser("urlencoded", { limit: "14mb", extended: true });
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "ready", method: RequestMethod.GET },
      { path: "metrics", method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks(["SIGINT", "SIGTERM"]);
  const configuredOrigins = (configService.get<string>("CORS_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = isDeployed
    ? configuredOrigins
    : [...configuredOrigins, "http://localhost:3000", "http://127.0.0.1:3000"];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerEnabled =
    configService.get<string>("SWAGGER_ENABLED") === undefined
      ? !isDeployed
      : configService.get<string>("SWAGGER_ENABLED") === "true";
  if (swaggerEnabled) {
    if (isDeployed) app.use("/docs", swaggerBasicAuth(configService));
    const config = new DocumentBuilder()
      .setTitle("Prumo API")
      .setDescription(
        "API multi-tenant de gestão para autoescolas, com cadastros, agenda, processos, exames e financeiro",
      )
      .setVersion("0.6.0")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Access token retornado pela autenticação.",
        },
        "bearer",
      )
      .build();

    SwaggerModule.setup(
      "docs",
      app,
      SwaggerModule.createDocument(app, config),
      {
        jsonDocumentUrl: "/docs/openapi.json",
      },
    );
  }

  const port = Number(process.env.API_PORT ?? 3333);
  const server = await app.listen(port, "0.0.0.0");
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const logger = app.get(StructuredLoggerService);
  logger.write("info", "application.started", {
    port,
    swaggerEnabled,
    healthPath: "/health",
    readinessPath: "/ready",
  });
}

void bootstrap();
