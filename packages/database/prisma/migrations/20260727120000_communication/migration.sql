-- Communication outbox, notifications, channels, reminders and campaigns.
CREATE TYPE "DomainEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');
CREATE TYPE "DomainEventType" AS ENUM ('COMMUNICATION_CAMPAIGN', 'USER_INVITED', 'STUDENT_CREATED', 'PROCESS_CREATED', 'PROCESS_STAGE_COMPLETED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'PRACTICAL_LESSON_CREATED', 'PRACTICAL_LESSON_CONFIRMED', 'PRACTICAL_LESSON_RESCHEDULED', 'PRACTICAL_LESSON_CANCELLED', 'PRACTICAL_LESSON_COMPLETED', 'THEORETICAL_CLASS_CREATED', 'THEORETICAL_CLASS_UPDATED', 'THEORETICAL_CLASS_CANCELLED', 'EXAM_SCHEDULED', 'EXAM_CONFIRMED', 'EXAM_RESCHEDULED', 'EXAM_CANCELLED', 'EXAM_RESULT_RECORDED', 'CONTRACT_ACTIVATED', 'INSTALLMENT_CREATED', 'INSTALLMENT_DUE_SOON', 'INSTALLMENT_OVERDUE', 'PAYMENT_CONFIRMED', 'PAYMENT_REFUNDED', 'DOCUMENT_EXPIRING', 'PROCESS_EXPIRING');
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'SUPPRESSED');
CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');
CREATE TYPE "CommunicationAudienceType" AS ENUM ('ALL_STUDENTS', 'ACTIVE_STUDENTS', 'INSTRUCTORS', 'OVERDUE_STUDENTS', 'PROCESS_STAGE', 'MANUAL_SELECTION');
CREATE TYPE "CommunicationCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'SUPPRESSED');
CREATE TYPE "ScheduledTaskStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "DomainEvent" (
  "id" UUID NOT NULL,
  "tenantId" UUID,
  "type" "DomainEventType" NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "DomainEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingStartedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "eventId" UUID,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "actionUrl" TEXT,
  "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "readAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "eventType" "DomainEventType" NOT NULL,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
  "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "reminderMinutesBefore" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserCommunicationSettings" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
  "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStart" TEXT,
  "quietHoursEnd" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "language" TEXT NOT NULL DEFAULT 'pt-BR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserCommunicationSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationTemplate" (
  "id" UUID NOT NULL,
  "tenantId" UUID,
  "code" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "subject" TEXT,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "allowedVariables" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "notificationId" UUID,
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "provider" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "templateId" UUID,
  "templateCode" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "renderedSubject" TEXT,
  "renderedTitle" TEXT,
  "renderedBody" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "queuedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DevicePushToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tenantId" UUID,
  "token" TEXT NOT NULL,
  "platform" "PushPlatform" NOT NULL,
  "deviceName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReminderRule" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "eventType" "DomainEventType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "minutesBefore" INTEGER NOT NULL,
  "templateId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunicationCampaign" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "audienceType" "CommunicationAudienceType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "status" "CommunicationCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "audienceFilter" JSONB,
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunicationCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunicationCampaignRecipient" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "userId" UUID,
  "studentId" UUID,
  "instructorId" UUID,
  "destination" TEXT NOT NULL,
  "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "deliveryId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunicationCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduledTaskExecution" (
  "id" UUID NOT NULL,
  "tenantId" UUID,
  "taskName" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "status" "ScheduledTaskStatus" NOT NULL DEFAULT 'RUNNING',
  "recordsScanned" INTEGER NOT NULL DEFAULT 0,
  "eventsCreated" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduledTaskExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomainEvent_idempotencyKey_key" ON "DomainEvent"("idempotencyKey");
CREATE INDEX "DomainEvent_tenantId_status_occurredAt_idx" ON "DomainEvent"("tenantId", "status", "occurredAt");
CREATE INDEX "DomainEvent_type_status_occurredAt_idx" ON "DomainEvent"("type", "status", "occurredAt");
CREATE INDEX "DomainEvent_aggregateType_aggregateId_idx" ON "DomainEvent"("aggregateType", "aggregateId");
CREATE INDEX "Notification_tenantId_userId_readAt_createdAt_idx" ON "Notification"("tenantId", "userId", "readAt", "createdAt");
CREATE INDEX "Notification_tenantId_userId_type_priority_idx" ON "Notification"("tenantId", "userId", "type", "priority");
CREATE UNIQUE INDEX "NotificationPreference_tenantId_userId_eventType_key" ON "NotificationPreference"("tenantId", "userId", "eventType");
CREATE INDEX "NotificationPreference_tenantId_userId_idx" ON "NotificationPreference"("tenantId", "userId");
CREATE UNIQUE INDEX "UserCommunicationSettings_userId_key" ON "UserCommunicationSettings"("userId");
CREATE UNIQUE INDEX "NotificationTemplate_tenantId_code_channel_version_key" ON "NotificationTemplate"("tenantId", "code", "channel", "version");
CREATE UNIQUE INDEX "NotificationTemplate_global_code_channel_version_key" ON "NotificationTemplate"("code", "channel", "version") WHERE "tenantId" IS NULL;
CREATE INDEX "NotificationTemplate_tenantId_code_channel_active_version_idx" ON "NotificationTemplate"("tenantId", "code", "channel", "active", "version");
CREATE UNIQUE INDEX "NotificationDelivery_idempotencyKey_key" ON "NotificationDelivery"("idempotencyKey");
CREATE INDEX "NotificationDelivery_tenantId_status_scheduledAt_idx" ON "NotificationDelivery"("tenantId", "status", "scheduledAt");
CREATE INDEX "NotificationDelivery_tenantId_channel_createdAt_idx" ON "NotificationDelivery"("tenantId", "channel", "createdAt");
CREATE INDEX "NotificationDelivery_tenantId_userId_createdAt_idx" ON "NotificationDelivery"("tenantId", "userId", "createdAt");
CREATE INDEX "NotificationDelivery_eventId_idx" ON "NotificationDelivery"("eventId");
CREATE UNIQUE INDEX "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX "DevicePushToken_userId_tenantId_active_idx" ON "DevicePushToken"("userId", "tenantId", "active");
CREATE UNIQUE INDEX "ReminderRule_tenantId_eventType_channel_minutesBefore_key" ON "ReminderRule"("tenantId", "eventType", "channel", "minutesBefore");
CREATE INDEX "ReminderRule_tenantId_active_idx" ON "ReminderRule"("tenantId", "active");
CREATE UNIQUE INDEX "CommunicationCampaign_id_tenantId_key" ON "CommunicationCampaign"("id", "tenantId");
CREATE INDEX "CommunicationCampaign_tenantId_status_scheduledAt_idx" ON "CommunicationCampaign"("tenantId", "status", "scheduledAt");
CREATE INDEX "CommunicationCampaign_tenantId_createdAt_idx" ON "CommunicationCampaign"("tenantId", "createdAt");
CREATE UNIQUE INDEX "CommunicationCampaignRecipient_tenantId_campaignId_destination_key" ON "CommunicationCampaignRecipient"("tenantId", "campaignId", "destination");
CREATE INDEX "CommunicationCampaignRecipient_tenantId_campaignId_status_idx" ON "CommunicationCampaignRecipient"("tenantId", "campaignId", "status");
CREATE INDEX "CommunicationCampaignRecipient_tenantId_userId_idx" ON "CommunicationCampaignRecipient"("tenantId", "userId");
CREATE INDEX "CommunicationCampaignRecipient_tenantId_studentId_idx" ON "CommunicationCampaignRecipient"("tenantId", "studentId");
CREATE INDEX "CommunicationCampaignRecipient_tenantId_instructorId_idx" ON "CommunicationCampaignRecipient"("tenantId", "instructorId");
CREATE UNIQUE INDEX "ScheduledTaskExecution_tenantId_taskName_periodKey_key" ON "ScheduledTaskExecution"("tenantId", "taskName", "periodKey");
CREATE INDEX "ScheduledTaskExecution_taskName_status_startedAt_idx" ON "ScheduledTaskExecution"("taskName", "status", "startedAt");

ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DomainEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCommunicationSettings" ADD CONSTRAINT "UserCommunicationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DomainEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunicationCampaignRecipient" ADD CONSTRAINT "CommunicationCampaignRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationCampaignRecipient" ADD CONSTRAINT "CommunicationCampaignRecipient_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "CommunicationCampaign"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationCampaignRecipient" ADD CONSTRAINT "CommunicationCampaignRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunicationCampaignRecipient" ADD CONSTRAINT "CommunicationCampaignRecipient_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "NotificationDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduledTaskExecution" ADD CONSTRAINT "ScheduledTaskExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
