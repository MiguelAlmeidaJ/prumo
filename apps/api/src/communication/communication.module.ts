import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditService } from "../schedule/audit.service";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import { CommunicationAdminController } from "./communication-admin.controller";
import { CommunicationWorkersService } from "./communication-workers.service";
import { CommunicationService } from "./communication.service";
import { DeliveryChannelService } from "./delivery-channel.service";
import { DomainEventService } from "./domain-event.service";
import { NotificationOrchestrator } from "./notification-orchestrator.service";
import { NotificationsController } from "./notifications.controller";
import { ExpoPushProvider } from "./providers/expo-push.provider";
import { EmailProvider } from "./providers/email.provider";
import { PushProvider } from "./providers/push.provider";
import { SmtpEmailProvider } from "./providers/smtp-email.provider";
import { CommunicationQueueService } from "./queue.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ValidityRoutinesService } from "./validity-routines.service";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [
    NotificationsController,
    CommunicationAdminController,
    CampaignsController,
  ],
  providers: [
    AuditService,
    CommunicationQueueService,
    DomainEventService,
    TemplateRendererService,
    SmtpEmailProvider,
    ExpoPushProvider,
    { provide: EmailProvider, useExisting: SmtpEmailProvider },
    { provide: PushProvider, useExisting: ExpoPushProvider },
    CommunicationService,
    NotificationOrchestrator,
    DeliveryChannelService,
    CampaignsService,
    ValidityRoutinesService,
    CommunicationWorkersService,
  ],
  exports: [
    DomainEventService,
    CommunicationQueueService,
    TemplateRendererService,
    EmailProvider,
  ],
})
export class CommunicationModule {}
