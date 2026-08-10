import {
  DomainEventType,
  NotificationChannel,
  NotificationPriority,
} from "@prisma/client";

export const COMMUNICATION_QUEUES = [
  "domain-events",
  "notifications",
  "emails",
  "push-notifications",
  "reminders",
  "communication-campaigns",
] as const;

export type CommunicationQueueName = (typeof COMMUNICATION_QUEUES)[number];

export const SECURITY_EVENT_TYPES = new Set<DomainEventType>([
  DomainEventType.USER_INVITED,
]);

export interface EventDefinition {
  templateCode: string;
  priority: NotificationPriority;
  actionUrl: (payload: Record<string, unknown>) => string | undefined;
  scheduleField?: string;
}

const path =
  (prefix: string, field: string) => (payload: Record<string, unknown>) => {
    const id = payload[field];
    return typeof id === "string" ? `${prefix}/${id}` : undefined;
  };

export const EVENT_DEFINITIONS: Partial<
  Record<DomainEventType, EventDefinition>
> = {
  [DomainEventType.USER_INVITED]: {
    templateCode: "user-invited",
    priority: NotificationPriority.URGENT,
    actionUrl: () => "/",
  },
  [DomainEventType.STUDENT_CREATED]: {
    templateCode: "student-created",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/students", "studentId"),
  },
  [DomainEventType.PROCESS_CREATED]: {
    templateCode: "process-created",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/processes", "processId"),
    scheduleField: "expiresAt",
  },
  [DomainEventType.PROCESS_STAGE_COMPLETED]: {
    templateCode: "process-stage-completed",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/processes", "processId"),
  },
  [DomainEventType.DOCUMENT_APPROVED]: {
    templateCode: "document-approved",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/processes", "processId"),
  },
  [DomainEventType.DOCUMENT_REJECTED]: {
    templateCode: "document-rejected",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/processes", "processId"),
  },
  [DomainEventType.PRACTICAL_LESSON_CREATED]: {
    templateCode: "practical-lesson-created",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/practical-lessons", "lessonId"),
    scheduleField: "startsAt",
  },
  [DomainEventType.PRACTICAL_LESSON_CONFIRMED]: {
    templateCode: "practical-lesson-created",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/practical-lessons", "lessonId"),
    scheduleField: "startsAt",
  },
  [DomainEventType.PRACTICAL_LESSON_RESCHEDULED]: {
    templateCode: "practical-lesson-rescheduled",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/practical-lessons", "lessonId"),
    scheduleField: "startsAt",
  },
  [DomainEventType.PRACTICAL_LESSON_CANCELLED]: {
    templateCode: "practical-lesson-cancelled",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/practical-lessons", "lessonId"),
  },
  [DomainEventType.PRACTICAL_LESSON_COMPLETED]: {
    templateCode: "practical-lesson-completed",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/practical-lessons", "lessonId"),
  },
  [DomainEventType.THEORETICAL_CLASS_CREATED]: {
    templateCode: "theoretical-class-created",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/theoretical-classes", "classId"),
    scheduleField: "startsAt",
  },
  [DomainEventType.THEORETICAL_CLASS_UPDATED]: {
    templateCode: "theoretical-class-updated",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/theoretical-classes", "classId"),
    scheduleField: "startsAt",
  },
  [DomainEventType.THEORETICAL_CLASS_CANCELLED]: {
    templateCode: "theoretical-class-cancelled",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/theoretical-classes", "classId"),
  },
  [DomainEventType.EXAM_SCHEDULED]: {
    templateCode: "exam-scheduled",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/exams", "examId"),
    scheduleField: "scheduledAt",
  },
  [DomainEventType.EXAM_CONFIRMED]: {
    templateCode: "exam-scheduled",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/exams", "examId"),
    scheduleField: "scheduledAt",
  },
  [DomainEventType.EXAM_RESCHEDULED]: {
    templateCode: "exam-rescheduled",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/exams", "examId"),
    scheduleField: "scheduledAt",
  },
  [DomainEventType.EXAM_CANCELLED]: {
    templateCode: "exam-cancelled",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/exams", "examId"),
  },
  [DomainEventType.EXAM_RESULT_RECORDED]: {
    templateCode: "exam-result",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/exams", "examId"),
  },
  [DomainEventType.CONTRACT_ACTIVATED]: {
    templateCode: "contract-activated",
    priority: NotificationPriority.NORMAL,
    actionUrl: path("/contracts", "contractId"),
  },
  [DomainEventType.INSTALLMENT_CREATED]: {
    templateCode: "installment-created",
    priority: NotificationPriority.NORMAL,
    actionUrl: () => "/financial/receivables",
    scheduleField: "dueDate",
  },
  [DomainEventType.INSTALLMENT_DUE_SOON]: {
    templateCode: "installment-due-soon",
    priority: NotificationPriority.HIGH,
    actionUrl: () => "/financial/receivables",
  },
  [DomainEventType.INSTALLMENT_OVERDUE]: {
    templateCode: "installment-overdue",
    priority: NotificationPriority.URGENT,
    actionUrl: () => "/financial/receivables",
  },
  [DomainEventType.PAYMENT_CONFIRMED]: {
    templateCode: "payment-confirmed",
    priority: NotificationPriority.NORMAL,
    actionUrl: () => "/financial/payments",
  },
  [DomainEventType.PAYMENT_REFUNDED]: {
    templateCode: "payment-refunded",
    priority: NotificationPriority.HIGH,
    actionUrl: () => "/financial/payments",
  },
  [DomainEventType.DOCUMENT_EXPIRING]: {
    templateCode: "document-expiring",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/processes", "processId"),
  },
  [DomainEventType.PROCESS_EXPIRING]: {
    templateCode: "process-expiring",
    priority: NotificationPriority.HIGH,
    actionUrl: path("/processes", "processId"),
  },
};

export const DEFAULT_CHANNELS = [
  NotificationChannel.IN_APP,
  NotificationChannel.EMAIL,
  NotificationChannel.PUSH,
] as const;

export const SAFE_ERROR_LENGTH = 1500;
