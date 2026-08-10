import { Injectable } from "@nestjs/common";

export interface SendPushInput {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SendPushResult {
  providerMessageId?: string;
  invalidToken: boolean;
}

@Injectable()
export abstract class PushProvider {
  abstract readonly name: string;
  abstract send(input: SendPushInput): Promise<SendPushResult>;
}
