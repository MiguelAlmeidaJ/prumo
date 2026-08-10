import { Injectable } from "@nestjs/common";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  providerMessageId: string;
}

@Injectable()
export abstract class EmailProvider {
  abstract readonly name: string;
  abstract send(input: SendEmailInput): Promise<SendEmailResult>;
}
