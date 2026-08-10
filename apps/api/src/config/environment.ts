import { isAbsolute } from "node:path";

export type AppEnvironment = "development" | "test" | "staging" | "production";

const DEPLOYED_ENVIRONMENTS = new Set<AppEnvironment>([
  "staging",
  "production",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const INSECURE_SECRET_PARTS = [
  "altere",
  "change-me",
  "changeme",
  "default",
  "example",
  "exemplo",
  "password",
  "secret",
];

function valueOf(environment: Record<string, unknown>, key: string): string {
  const value = environment[key];
  return typeof value === "string" ? value.trim() : "";
}

function requireValue(
  environment: Record<string, unknown>,
  key: string,
  errors: string[],
): string {
  const value = valueOf(environment, key);
  if (!value) errors.push(`${key} é obrigatório.`);
  return value;
}

function parseUrl(
  value: string,
  key: string,
  protocols: string[],
  errors: string[],
): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      errors.push(`${key} deve usar ${protocols.join(" ou ")}.`);
      return null;
    }
    return url;
  } catch {
    errors.push(`${key} deve ser uma URL válida.`);
    return null;
  }
}

function rejectLocalHost(url: URL | null, key: string, errors: string[]) {
  if (url && LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    errors.push(`${key} não pode apontar para um host local.`);
  }
}

function validateBoolean(
  environment: Record<string, unknown>,
  key: string,
  errors: string[],
  required = false,
) {
  const value = valueOf(environment, key);
  if (!value && !required) return;
  if (value !== "true" && value !== "false") {
    errors.push(`${key} deve ser true ou false.`);
  }
}

function validateSecret(secret: string, key: string, errors: string[]) {
  if (secret.length < 48) {
    errors.push(`${key} deve possuir pelo menos 48 caracteres.`);
  }
  const normalized = secret.toLowerCase();
  if (
    INSECURE_SECRET_PARTS.some((part) => normalized.includes(part)) ||
    /^(.)\1+$/.test(secret) ||
    new Set(secret).size < 12
  ) {
    errors.push(`${key} contém um valor padrão, de exemplo ou previsível.`);
  }
}

function validateCors(
  environment: Record<string, unknown>,
  deployed: boolean,
  appWebUrl: URL | null,
  errors: string[],
) {
  const raw = deployed
    ? requireValue(environment, "CORS_ORIGINS", errors)
    : valueOf(environment, "CORS_ORIGINS");
  if (!raw) return;
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.includes("*")) {
    errors.push("CORS_ORIGINS não pode conter '*'.");
  }
  const validOrigins = origins.flatMap((origin) => {
    const parsed = parseUrl(
      origin,
      "Cada origem de CORS_ORIGINS",
      deployed ? ["https:"] : ["http:", "https:"],
      errors,
    );
    if (!parsed) return [];
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      errors.push(
        "Cada origem de CORS_ORIGINS deve conter apenas protocolo, host e porta.",
      );
      return [];
    }
    if (deployed) rejectLocalHost(parsed, "CORS_ORIGINS", errors);
    return [parsed.origin];
  });
  if (deployed && appWebUrl && !validOrigins.includes(appWebUrl.origin)) {
    errors.push("CORS_ORIGINS deve incluir a origem de APP_WEB_URL.");
  }
}

function validateSmtp(environment: Record<string, unknown>, errors: string[]) {
  const host = requireValue(environment, "SMTP_HOST", errors);
  if (LOCAL_HOSTS.has(host.toLowerCase())) {
    errors.push("SMTP_HOST não pode apontar para um host local.");
  }
  const portText = requireValue(environment, "SMTP_PORT", errors);
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    errors.push("SMTP_PORT deve ser uma porta válida.");
  }
  validateBoolean(environment, "SMTP_SECURE", errors, true);
  const user = requireValue(environment, "SMTP_USER", errors);
  const password = requireValue(environment, "SMTP_PASSWORD", errors);
  if (user && password.length < 12) {
    errors.push("SMTP_PASSWORD deve possuir pelo menos 12 caracteres.");
  }
  const from = requireValue(environment, "EMAIL_FROM", errors);
  const email = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("EMAIL_FROM deve conter um endereço de e-mail válido.");
  }
}

function validateStorage(
  environment: Record<string, unknown>,
  errors: string[],
) {
  const uploadDir =
    valueOf(environment, "UPLOAD_DIR") ||
    valueOf(environment, "MOBILE_UPLOAD_DIR");
  if (!uploadDir) {
    errors.push("UPLOAD_DIR ou MOBILE_UPLOAD_DIR é obrigatório.");
  } else if (!isAbsolute(uploadDir)) {
    errors.push("O diretório de storage deve usar um caminho absoluto.");
  }
}

export function resolveAppEnvironment(
  environment: Record<string, unknown>,
): AppEnvironment {
  const explicit = valueOf(environment, "APP_ENV");
  const nodeEnvironment = valueOf(environment, "NODE_ENV");
  return (explicit || nodeEnvironment || "development") as AppEnvironment;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];
  const appEnvironment = resolveAppEnvironment(environment);
  if (
    !(["development", "test", "staging", "production"] as string[]).includes(
      appEnvironment,
    )
  ) {
    throw new Error(
      "Configuração de ambiente inválida:\n- APP_ENV deve ser development, test, staging ou production.",
    );
  }

  const deployed = DEPLOYED_ENVIRONMENTS.has(appEnvironment);
  validateBoolean(environment, "SWAGGER_ENABLED", errors);
  validateBoolean(environment, "SWAGGER_RESTRICTED", errors);
  validateBoolean(environment, "TRUST_PROXY", errors);

  if (deployed) {
    const accessSecret = requireValue(environment, "JWT_ACCESS_SECRET", errors);
    const refreshSecret = requireValue(
      environment,
      "JWT_REFRESH_SECRET",
      errors,
    );
    validateSecret(accessSecret, "JWT_ACCESS_SECRET", errors);
    validateSecret(refreshSecret, "JWT_REFRESH_SECRET", errors);
    if (accessSecret && accessSecret === refreshSecret) {
      errors.push(
        "JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes.",
      );
    }

    const databaseUrl = parseUrl(
      requireValue(environment, "DATABASE_URL", errors),
      "DATABASE_URL",
      ["postgresql:", "postgres:"],
      errors,
    );
    const redisUrl = parseUrl(
      requireValue(environment, "REDIS_URL", errors),
      "REDIS_URL",
      ["redis:", "rediss:"],
      errors,
    );
    const appWebUrl = parseUrl(
      requireValue(environment, "APP_WEB_URL", errors),
      "APP_WEB_URL",
      ["https:"],
      errors,
    );
    const apiUrl = parseUrl(
      requireValue(environment, "API_URL", errors),
      "API_URL",
      ["https:"],
      errors,
    );
    rejectLocalHost(databaseUrl, "DATABASE_URL", errors);
    rejectLocalHost(redisUrl, "REDIS_URL", errors);
    rejectLocalHost(appWebUrl, "APP_WEB_URL", errors);
    rejectLocalHost(apiUrl, "API_URL", errors);
    for (const [key, publicUrl] of [
      ["APP_WEB_URL", appWebUrl],
      ["API_URL", apiUrl],
    ] as const) {
      if (publicUrl && (publicUrl.username || publicUrl.password)) {
        errors.push(`${key} não pode conter credenciais.`);
      }
    }
    if (
      appWebUrl &&
      (appWebUrl.pathname !== "/" || appWebUrl.search || appWebUrl.hash)
    ) {
      errors.push(
        "APP_WEB_URL deve conter somente a origem oficial do web app.",
      );
    }
    validateCors(environment, true, appWebUrl, errors);
    validateSmtp(environment, errors);
    validateStorage(environment, errors);

    const swaggerEnabled = valueOf(environment, "SWAGGER_ENABLED") === "true";
    if (appEnvironment === "production" && swaggerEnabled) {
      errors.push("SWAGGER_ENABLED deve ser false em produção.");
    }
    if (
      appEnvironment === "production" &&
      valueOf(environment, "SWAGGER_ENABLED") !== "false"
    ) {
      errors.push("SWAGGER_ENABLED=false deve ser definido em produção.");
    }
    if (appEnvironment === "staging" && swaggerEnabled) {
      if (valueOf(environment, "SWAGGER_RESTRICTED") !== "true") {
        errors.push(
          "SWAGGER_RESTRICTED=true é obrigatório ao habilitar Swagger em homologação.",
        );
      }
      requireValue(environment, "SWAGGER_USERNAME", errors);
      const swaggerPassword = requireValue(
        environment,
        "SWAGGER_PASSWORD",
        errors,
      );
      if (swaggerPassword && swaggerPassword.length < 16) {
        errors.push("SWAGGER_PASSWORD deve possuir pelo menos 16 caracteres.");
      }
    }
  } else {
    validateCors(environment, false, null, errors);
  }

  if (errors.length) {
    throw new Error(
      `Configuração de ambiente inválida:\n${errors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }
  return { ...environment, APP_ENV: appEnvironment };
}
