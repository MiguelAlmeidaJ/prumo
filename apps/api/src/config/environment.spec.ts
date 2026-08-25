import { describe, expect, it } from "vitest";
import { resolveAppEnvironment, validateEnvironment } from "./environment";

const validProductionEnvironment = () => ({
  APP_ENV: "production",
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "A7$fQ2!zR9@kL4#vN8&xT3*mP6^bC1+wH5=yU0_jD2.sE7-rG9!aK4%q",
  JWT_REFRESH_SECRET: "Z3@pM8#tV1&cR6!yF9*kH2^nB7+wQ4=xL0_jS5.dG8-rN1$aE6%u",
  DATABASE_URL: "postgresql://prumo:strong@db.internal:5432/prumo",
  REDIS_URL: "rediss://cache.internal:6379",
  APP_WEB_URL: "https://app.prumo.com.br",
  API_URL: "https://api.prumo.com.br/api",
  CORS_ORIGINS: "https://app.prumo.com.br",
  SMTP_HOST: "smtp.provider.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "prumo-api",
  SMTP_PASSWORD: "smtp-pass-strong-2026",
  EMAIL_FROM: "Prumo <nao-responda@prumo.com.br>",
  STORAGE_REGION: "us-east-1",
  STORAGE_BUCKET: "prumo-documents-staging",
  STORAGE_FORCE_PATH_STYLE: "false",
  STORAGE_SIGNED_URL_TTL_SECONDS: "300",
  STORAGE_SERVER_SIDE_ENCRYPTION: "AES256",
  STORAGE_ENDPOINT: "",
  STORAGE_ACCESS_KEY_ID: "",
  STORAGE_SECRET_ACCESS_KEY: "",
  METRICS_TOKEN: "metrics-token-strong-2026",
  SWAGGER_ENABLED: "false",
  SWAGGER_RESTRICTED: "false",
  TRUST_PROXY: "true",
});

describe("validateEnvironment", () => {
  it("aceita uma configuração segura de produção", () => {
    expect(validateEnvironment(validProductionEnvironment())).toMatchObject({
      APP_ENV: "production",
      SWAGGER_ENABLED: "false",
    });
  });

  it("recusa secrets fracos, padrão ou iguais", () => {
    const environment = validProductionEnvironment();
    environment.JWT_ACCESS_SECRET = "altere-esta-chave-access";
    environment.JWT_REFRESH_SECRET = "altere-esta-chave-access";

    expect(() => validateEnvironment(environment)).toThrow(
      /pelo menos 48 caracteres[\s\S]*valor padrão[\s\S]*devem ser diferentes/,
    );
  });

  it("recusa hosts locais, HTTP e CORS curinga em ambiente publicado", () => {
    const environment = validProductionEnvironment();
    environment.DATABASE_URL = "postgresql://prumo:prumo@localhost:5432/prumo";
    environment.REDIS_URL = "redis://127.0.0.1:6379";
    environment.APP_WEB_URL = "http://localhost:3000";
    environment.API_URL = "http://localhost:3333/api";
    environment.CORS_ORIGINS = "*";

    expect(() => validateEnvironment(environment)).toThrow(
      /DATABASE_URL não pode apontar[\s\S]*REDIS_URL não pode apontar[\s\S]*CORS_ORIGINS não pode conter/,
    );
  });

  it("recusa Swagger em produção", () => {
    const environment = validProductionEnvironment();
    environment.SWAGGER_ENABLED = "true";

    expect(() => validateEnvironment(environment)).toThrow(
      /SWAGGER_ENABLED deve ser false em produção/,
    );
  });

  it("exige restrição e credenciais para Swagger em homologação", () => {
    const environment = {
      ...validProductionEnvironment(),
      APP_ENV: "staging",
      SWAGGER_ENABLED: "true",
    };

    expect(() => validateEnvironment(environment)).toThrow(
      /SWAGGER_RESTRICTED=true[\s\S]*SWAGGER_USERNAME[\s\S]*SWAGGER_PASSWORD/,
    );

    expect(() =>
      validateEnvironment({
        ...environment,
        SWAGGER_RESTRICTED: "true",
        SWAGGER_USERNAME: "prumo-docs",
        SWAGGER_PASSWORD: "docs-pass-strong-2026",
      }),
    ).not.toThrow();
  });

  it("exige SMTP e storage S3 explícitos em ambiente publicado", () => {
    const environment = validProductionEnvironment();
    environment.SMTP_HOST = "";
    environment.STORAGE_BUCKET = "";

    expect(() => validateEnvironment(environment)).toThrow(
      /SMTP_HOST é obrigatório[\s\S]*STORAGE_BUCKET é obrigatório/,
    );
  });

  it("recusa endpoint de storage inseguro ou credenciais incompletas", () => {
    const environment = validProductionEnvironment();
    environment.STORAGE_ENDPOINT = "http://localhost:9000";
    environment.STORAGE_ACCESS_KEY_ID = "access-only";

    expect(() => validateEnvironment(environment)).toThrow(
      /STORAGE_ENDPOINT deve usar https:[\s\S]*devem ser informados juntos/,
    );
  });

  it("mantém configuração local válida no desenvolvimento", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        CORS_ORIGINS: "http://localhost:3000",
        SWAGGER_ENABLED: "true",
        TRUST_PROXY: "false",
      }),
    ).not.toThrow();
    expect(resolveAppEnvironment({ NODE_ENV: "test" })).toBe("test");
  });
});
