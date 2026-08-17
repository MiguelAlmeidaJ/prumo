import type { Permission } from "@prumo/contracts";
import { MembershipRole } from "@prumo/database";

const BASIC_PERMISSIONS = [
  "profile:read",
  "tenant:select",
  "memberships:read",
] as const satisfies readonly Permission[];

const REGISTRATION_READ_PERMISSIONS = [
  "students.read",
  "instructors.read",
  "vehicles.read",
] as const satisfies readonly Permission[];

const REGISTRATION_WRITE_PERMISSIONS = [
  ...REGISTRATION_READ_PERMISSIONS,
  "students.create",
  "students.update",
  "students.status",
  "instructors.create",
  "instructors.update",
  "instructors.status",
  "vehicles.create",
  "vehicles.update",
  "vehicles.status",
] as const satisfies readonly Permission[];

const SCHEDULE_READ_PERMISSIONS = [
  "units.read",
  "classrooms.read",
  "availability.read",
  "schedule-blocks.read",
  "practical-lessons.read",
  "theoretical-classes.read",
  "schedule.read",
] as const satisfies readonly Permission[];

const SCHEDULE_WRITE_PERMISSIONS = [
  ...SCHEDULE_READ_PERMISSIONS,
  "units.create",
  "units.update",
  "units.status",
  "units.delete",
  "classrooms.create",
  "classrooms.update",
  "classrooms.status",
  "classrooms.delete",
  "availability.manage",
  "schedule-blocks.manage",
  "practical-lessons.create",
  "practical-lessons.update",
  "practical-lessons.status",
  "theoretical-classes.create",
  "theoretical-classes.update",
  "theoretical-classes.status",
  "theoretical-classes.participants",
] as const satisfies readonly Permission[];

const PROCESS_READ_PERMISSIONS = [
  "processes.read",
  "process_stages.read",
  "exams.read",
] as const satisfies readonly Permission[];

const PROCESS_WRITE_PERMISSIONS = [
  ...PROCESS_READ_PERMISSIONS,
  "processes.create",
  "processes.update",
  "processes.start",
  "processes.suspend",
  "processes.complete",
  "processes.cancel",
  "process_stages.manage",
  "exams.create",
  "exams.confirm",
  "exams.complete",
  "exams.cancel",
  "exams.reschedule",
  "documents.review",
  "documents.approve",
  "documents.reject",
] as const satisfies readonly Permission[];

const FINANCIAL_READ_PERMISSIONS = [
  "financial.dashboard.read",
  "services.read",
  "plans.read",
  "contracts.read",
  "receivables.read",
  "payments.read",
  "cash_registers.read",
  "expenses.read",
  "financial_reports.read",
] as const satisfies readonly Permission[];

const FINANCIAL_WRITE_PERMISSIONS = [
  ...FINANCIAL_READ_PERMISSIONS,
  "services.create",
  "services.update",
  "plans.create",
  "plans.update",
  "contracts.create",
  "contracts.update",
  "contracts.activate",
  "contracts.complete",
  "contracts.cancel",
  "receivables.manage",
  "receivables.discount",
  "payments.create",
  "payments.confirm",
  "payments.cancel",
  "payments.refund",
  "cash_registers.open",
  "cash_registers.manage",
  "cash_registers.close",
  "expenses.create",
  "expenses.update",
  "expenses.pay",
  "expenses.cancel",
] as const satisfies readonly Permission[];

const COMMUNICATION_SELF_PERMISSIONS = [
  "notifications.read",
] as const satisfies readonly Permission[];

const COMMUNICATION_ADMIN_PERMISSIONS = [
  ...COMMUNICATION_SELF_PERMISSIONS,
  "notifications.manage",
  "communication.templates.read",
  "communication.templates.manage",
  "communication.history.read",
  "communication.events.read",
  "communication.events.reprocess",
  "communication.campaigns.read",
  "communication.campaigns.create",
  "communication.campaigns.send",
  "communication.campaigns.cancel",
  "communication.settings.manage",
] as const satisfies readonly Permission[];

const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  [MembershipRole.TENANT_OWNER]: [
    ...BASIC_PERMISSIONS,
    "tenant:manage",
    "memberships:manage",
    ...REGISTRATION_WRITE_PERMISSIONS,
    ...SCHEDULE_WRITE_PERMISSIONS,
    ...PROCESS_WRITE_PERMISSIONS,
    ...FINANCIAL_WRITE_PERMISSIONS,
    ...COMMUNICATION_ADMIN_PERMISSIONS,
    "practical-lessons.past",
  ],
  [MembershipRole.TENANT_ADMIN]: [
    ...BASIC_PERMISSIONS,
    "tenant:manage",
    "memberships:manage",
    ...REGISTRATION_WRITE_PERMISSIONS,
    ...SCHEDULE_WRITE_PERMISSIONS,
    ...PROCESS_WRITE_PERMISSIONS,
    ...FINANCIAL_WRITE_PERMISSIONS,
    ...COMMUNICATION_ADMIN_PERMISSIONS,
    "practical-lessons.past",
  ],
  [MembershipRole.SECRETARY]: [
    ...BASIC_PERMISSIONS,
    ...REGISTRATION_WRITE_PERMISSIONS,
    ...SCHEDULE_WRITE_PERMISSIONS,
    ...PROCESS_WRITE_PERMISSIONS,
    ...FINANCIAL_WRITE_PERMISSIONS,
    ...COMMUNICATION_ADMIN_PERMISSIONS,
  ],
  [MembershipRole.FINANCE]: [
    ...BASIC_PERMISSIONS,
    ...REGISTRATION_READ_PERMISSIONS,
    ...SCHEDULE_READ_PERMISSIONS,
    ...PROCESS_READ_PERMISSIONS,
    ...FINANCIAL_WRITE_PERMISSIONS,
    "communication.history.read",
    "communication.campaigns.read",
  ],
  [MembershipRole.INSTRUCTOR]: [
    ...BASIC_PERMISSIONS,
    ...COMMUNICATION_SELF_PERMISSIONS,
  ],
  [MembershipRole.STUDENT]: [
    ...BASIC_PERMISSIONS,
    ...COMMUNICATION_SELF_PERMISSIONS,
  ],
};

export function getPermissionsForRole(role: MembershipRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
