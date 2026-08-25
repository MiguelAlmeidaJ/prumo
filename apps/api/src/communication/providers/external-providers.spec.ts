import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { ExpoPushProvider } from "./expo-push.provider";
import { SmtpEmailProvider } from "./smtp-email.provider";

const testConfig = new ConfigService({
  APP_ENV: "test",
  SMTP_HOST: "smtp.invalid",
});

describe("providers externos em testes", () => {
  it("não abre conexão SMTP", async () => {
    const provider = new SmtpEmailProvider(testConfig);

    await expect(
      provider.send({
        to: "destino@prumo.local",
        subject: "Convite",
        html: "<p>Convite</p>",
        text: "Convite",
      }),
    ).resolves.toEqual({ providerMessageId: "test-email" });
  });

  it("não chama a API do Expo para token válido", async () => {
    const provider = new ExpoPushProvider(testConfig);

    await expect(
      provider.send({
        token: "ExponentPushToken[test-token]",
        title: "Aula",
        body: "Lembrete",
      }),
    ).resolves.toEqual({
      providerMessageId: "test-expo-ticket",
      invalidToken: false,
    });
  });
});
