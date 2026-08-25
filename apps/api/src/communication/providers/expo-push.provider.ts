import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";
import { Expo } from "expo-server-sdk";
import {
  PushProvider,
  type SendPushInput,
  type SendPushResult,
} from "./push.provider";

@Injectable()
export class ExpoPushProvider extends PushProvider {
  readonly name = "expo";
  private readonly expo: Expo;
  private readonly testMode: boolean;

  constructor(config: ConfigService) {
    super();
    this.testMode = config.get<string>("APP_ENV") === "test";
    this.expo = new Expo({
      accessToken: config.get<string>("EXPO_ACCESS_TOKEN") || undefined,
    });
  }

  async send(input: SendPushInput): Promise<SendPushResult> {
    if (!Expo.isExpoPushToken(input.token)) {
      return { invalidToken: true };
    }
    if (this.testMode) {
      return { providerMessageId: "test-expo-ticket", invalidToken: false };
    }
    const [ticket] = await this.expo.sendPushNotificationsAsync([
      {
        to: input.token,
        title: input.title,
        body: input.body,
        data: input.data,
        sound: "default",
      },
    ]);
    if (ticket.status === "error") {
      if (ticket.details?.error === "DeviceNotRegistered") {
        return { invalidToken: true };
      }
      throw new Error(`Expo Push: ${ticket.message}`);
    }
    return {
      providerMessageId: ticket.id,
      invalidToken: false,
    };
  }
}
