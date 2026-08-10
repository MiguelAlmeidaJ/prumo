import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { NotificationChannel } from "@prisma/client";
import type { Job } from "bullmq";
import { CampaignsService } from "./campaigns.service";
import { DeliveryChannelService } from "./delivery-channel.service";
import { DomainEventService } from "./domain-event.service";
import { NotificationOrchestrator } from "./notification-orchestrator.service";
import { CommunicationQueueService } from "./queue.service";
import { ValidityRoutinesService } from "./validity-routines.service";

@Injectable()
export class CommunicationWorkersService implements OnApplicationBootstrap {
  constructor(
    private readonly queues: CommunicationQueueService,
    private readonly events: DomainEventService,
    private readonly orchestrator: NotificationOrchestrator,
    private readonly deliveries: DeliveryChannelService,
    private readonly campaigns: CampaignsService,
    private readonly routines: ValidityRoutinesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.queues.register(
      "domain-events",
      (job: Job<Record<string, unknown>>) => this.domainJob(job),
      3,
    );
    this.queues.register(
      "notifications",
      (job: Job<Record<string, unknown>>) => this.notificationJob(job),
      8,
    );
    this.queues.register(
      "emails",
      (job: Job<Record<string, unknown>>) => this.emailJob(job),
      5,
    );
    this.queues.register(
      "push-notifications",
      (job: Job<Record<string, unknown>>) => this.pushJob(job),
      10,
    );
    this.queues.register(
      "reminders",
      (job: Job<Record<string, unknown>>) => this.reminderJob(job),
      5,
    );
    this.queues.register(
      "communication-campaigns",
      (job: Job<Record<string, unknown>>) => this.campaignJob(job),
      2,
    );
    await this.queues.scheduleInfrastructureJobs();
    await this.events.dispatchPending();
  }

  private async domainJob(
    job: Job<Record<string, unknown>>,
  ): Promise<unknown> {
    if (job.name === "dispatch-pending") return this.events.dispatchPending();
    if (job.name === "validity-routines") return this.routines.run();
    if (job.name !== "dispatch-event") return;
    const eventId = String(job.data.eventId);
    if (!(await this.events.begin(eventId))) return;
    await this.queues.add(
      "notifications",
      "orchestrate-event",
      { eventId },
      { idempotencyKey: eventId },
    );
  }

  private async notificationJob(
    job: Job<Record<string, unknown>>,
  ): Promise<void> {
    if (job.name === "send-delivery") return;
    const eventId = String(job.data.eventId);
    try {
      await this.orchestrator.processEvent(eventId);
      await this.events.processed(eventId);
    } catch (error) {
      await this.events.failed(eventId, error);
      throw error;
    }
  }

  private emailJob(job: Job<Record<string, unknown>>) {
    return this.deliveries.send(
      String(job.data.deliveryId),
      NotificationChannel.EMAIL,
    );
  }

  private pushJob(job: Job<Record<string, unknown>>) {
    return this.deliveries.send(
      String(job.data.deliveryId),
      NotificationChannel.PUSH,
    );
  }

  private reminderJob(job: Job<Record<string, unknown>>) {
    return this.orchestrator.processReminder({
      eventId: String(job.data.eventId),
      userId: String(job.data.userId),
      ruleId: String(job.data.ruleId),
      scheduleIdentifier: String(job.data.scheduleIdentifier),
    });
  }

  private campaignJob(job: Job<Record<string, unknown>>) {
    return this.campaigns.process(String(job.data.campaignId));
  }
}
