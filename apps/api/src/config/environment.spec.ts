import { resolve } from "node:path";
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
  UPLOAD_DIR: resolve("var", "uploads-staging"),
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

  it("exige SMTP e storage explícitos em ambiente publicado", () => {
    const environment = validProductionEnvironment();
    environment.SMTP_HOST = "";
    environment.UPLOAD_DIR = "relative/uploads";

    expect(() => validateEnvironment(environment)).toThrow(
      /SMTP_HOST é obrigatório[\s\S]*caminho absoluto/,
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
