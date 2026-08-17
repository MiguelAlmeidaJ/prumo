/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from "@prumo/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { DeliveryChannelService } from "./delivery-channel.service";
import type { EmailProvider } from "./providers/email.provider";
import type { PushProvider } from "./providers/push.provider";
import type { CommunicationQueueService } from "./queue.service";

const PUSH_TOKEN = "ExponentPushToken[smoke-provider-mock]";

function pushDelivery() {
  return {
    id: "delivery-1",
    channel: NotificationChannel.PUSH,
    status: NotificationDeliveryStatus.PENDING,
    destination: PUSH_TOKEN,
    renderedSubject: null,
    renderedTitle: "Aviso Prumo",
    renderedBody: "Conteúdo da notificação.",
    notificationId: "notification-1",
    tenant: { name: "Autoescola Prumo" },
    notification: { actionUrl: "/notifications" },
  };
}

describe("DeliveryChannelService com PushProvider mock", () => {
  let prisma: any;
  let push: { send: ReturnType<typeof vi.fn> };
  let service: DeliveryChannelService;

  beforeEach(() => {
    prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue(pushDelivery()),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ attempts: 1 }),
        update: vi.fn().mockResolvedValue({
          ...pushDelivery(),
          status: NotificationDeliveryStatus.SENT,
        }),
      },
      devicePushToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    push = { send: vi.fn() };
    service = new DeliveryChannelService(
      prisma as PrismaService,
      { send: vi.fn(), name: "mock-email" } as unknown as EmailProvider,
      push as unknown as PushProvider,
      { maxAttempts: 3 } as CommunicationQueueService,
    );
  });

  it("envia push com actionUrl e persiste o identificador do provider", async () => {
    push.send.mockResolvedValue({
      providerMessageId: "expo-ticket-1",
      invalidToken: false,
    });

    await service.send("delivery-1", NotificationChannel.PUSH);

    expect(push.send).toHaveBeenCalledWith({
      token: PUSH_TOKEN,
      title: "Aviso Prumo",
      body: "Conteúdo da notificação.",
      data: {
        actionUrl: "/notifications",
        notificationId: "notification-1",
      },
    });
    expect(prisma.notificationDelivery.update).toHaveBeenLastCalledWith({
      where: { id: "delivery-1" },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.SENT,
        providerMessageId: "expo-ticket-1",
      }),
    });
  });

  it("desativa o token quando o provider o identifica como inválido", async () => {
    push.send.mockResolvedValue({
      providerMessageId: "expo-ticket-invalid",
      invalidToken: true,
    });

    await service.send("delivery-1", NotificationChannel.PUSH);

    expect(prisma.devicePushToken.updateMany).toHaveBeenCalledWith({
      where: { token: PUSH_TOKEN },
      data: { active: false },
    });
    expect(prisma.notificationDelivery.update).toHaveBeenLastCalledWith({
      where: { id: "delivery-1" },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.FAILED,
        lastError: "Token de push inválido ou não registrado.",
      }),
    });
  });

  it("sanitiza segredos antes de registrar uma falha retentável", async () => {
    push.send.mockRejectedValue(
      new Error(`Falha no token ${PUSH_TOKEN} com Bearer segredo-supersecreto`),
    );

    await expect(
      service.send("delivery-1", NotificationChannel.PUSH),
    ).rejects.toThrow();

    const failedUpdate = prisma.notificationDelivery.update.mock.calls.at(-1);
    expect(failedUpdate[0].data.status).toBe(
      NotificationDeliveryStatus.FAILED,
    );
    expect(failedUpdate[0].data.lastError).not.toContain(PUSH_TOKEN);
    expect(failedUpdate[0].data.lastError).not.toContain(
      "segredo-supersecreto",
    );
  });
});
