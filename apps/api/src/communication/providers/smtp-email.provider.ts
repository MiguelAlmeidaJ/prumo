import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import {
  EmailProvider,
  type SendEmailInput,
  type SendEmailResult,
} from "./email.provider";

@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  readonly name = "smtp";
  private readonly testMode: boolean;
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    super();
    this.testMode = config.get<string>("APP_ENV") === "test";
  }

  private transport(): Transporter {
    if (!this.transporter) {
      const user = this.config.get<string>("SMTP_USER");
      const password = this.config.get<string>("SMTP_PASSWORD");
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>("SMTP_HOST", "localhost"),
        port: Number(this.config.get<string>("SMTP_PORT", "1025")),
        secure: this.config.get<string>("SMTP_SECURE", "false") === "true",
        connectionTimeout: Number(
          this.config.get<string>("EMAIL_TIMEOUT_MS", "10000"),
        ),
        greetingTimeout: Number(
          this.config.get<string>("EMAIL_TIMEOUT_MS", "10000"),
        ),
        socketTimeout: Number(
          this.config.get<string>("EMAIL_TIMEOUT_MS", "10000"),
        ),
        auth: user && password ? { user, pass: password } : undefined,
      });
    }
    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!input.subject.trim()) {
      throw new Error("O assunto do e-mail é obrigatório.");
    }
    if (this.testMode) {
      return { providerMessageId: "test-email" };
    }
    const rawResult: unknown = await this.transport().sendMail({
      from: this.config.get<string>(
        "EMAIL_FROM",
        "Prumo <nao-responda@prumo.local>",
      ),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (
      !rawResult ||
      typeof rawResult !== "object" ||
      !("messageId" in rawResult) ||
      typeof rawResult.messageId !== "string"
    ) {
      throw new Error(
        "O provider SMTP não retornou o identificador da mensagem.",
      );
    }
    return { providerMessageId: rawResult.messageId };
  }
}
