import { Injectable, NotFoundException } from "@nestjs/common";
import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { emailHtml } from "./email-layout";
import { EmailProvider } from "./providers/email.provider";
import { PushProvider } from "./providers/push.provider";
import { CommunicationQueueService } from "./queue.service";
import { safeError } from "./communication.utils";

@Injectable()
export class DeliveryChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    private readonly push: PushProvider,
    private readonly queues: CommunicationQueueService,
  ) {}

  async send(deliveryId: string, expectedChannel: NotificationChannel) {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        tenant: { select: { name: true } },
        notification: { select: { actionUrl: true } },
      },
    });
    if (!delivery) throw new NotFoundException("Entrega não encontrada.");
    if (delivery.channel !== expectedChannel) {
      throw new Error("Canal da entrega não corresponde à fila.");
    }
    if (
      (
        [
          NotificationDeliveryStatus.SENT,
          NotificationDeliveryStatus.DELIVERED,
          NotificationDeliveryStatus.CANCELLED,
          NotificationDeliveryStatus.SUPPRESSED,
        ] as NotificationDeliveryStatus[]
      ).includes(delivery.status)
    ) {
      return delivery;
    }
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationDeliveryStatus.SENDING,
        attempts: { increment: 1 },
      },
    });
    try {
      if (expectedChannel === NotificationChannel.EMAIL) {
        const subject = delivery.renderedSubject;
        if (!subject) throw new Error("Entrega de e-mail sem assunto.");
        const result = await this.email.send({
          to: delivery.destination,
          subject,
          html: emailHtml({
            tenantName: delivery.tenant.name,
            title: delivery.renderedTitle ?? subject,
            body: delivery.renderedBody,
            actionUrl: delivery.notification?.actionUrl,
          }),
          text: delivery.renderedBody.replace(/<[^>]+>/g, " "),
        });
        return this.prisma.notificationDelivery.update({
          where: { id: deliveryId },
          data: {
            status: NotificationDeliveryStatus.SENT,
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
            lastError: null,
          },
        });
      }
      if (expectedChannel === NotificationChannel.PUSH) {
        const result = await this.push.send({
          token: delivery.destination,
          title: delivery.renderedTitle ?? "Prumo",
          body: delivery.renderedBody,
          data: {
            actionUrl: delivery.notification?.actionUrl,
            notificationId: delivery.notificationId,
          },
        });
        if (result.invalidToken) {
          await this.prisma.$transaction([
            this.prisma.devicePushToken.updateMany({
              where: { token: delivery.destination },
              data: { active: false },
            }),
            this.prisma.notificationDelivery.update({
              where: { id: deliveryId },
              data: {
                status: NotificationDeliveryStatus.FAILED,
                failedAt: new Date(),
                lastError: "Token de push inválido ou não registrado.",
              },
            }),
          ]);
          return;
        }
        return this.prisma.notificationDelivery.update({
          where: { id: deliveryId },
          data: {
            status: NotificationDeliveryStatus.SENT,
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
            lastError: null,
          },
        });
      }
      throw new Error("Canal não suportado pelo worker de entrega.");
    } catch (error) {
      const current = await this.prisma.notificationDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
        select: { attempts: true },
      });
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NotificationDeliveryStatus.FAILED,
          failedAt: new Date(),
          lastError: safeError(error),
        },
      });
      if (current.attempts < this.queues.maxAttempts) throw error;
      return;
    }
  }
}
