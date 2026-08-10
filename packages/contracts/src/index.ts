import { z } from "zod";

export const membershipRoleValues = [
  "TENANT_OWNER",
  "TENANT_ADMIN",
  "SECRETARY",
  "FINANCE",
  "INSTRUCTOR",
  "STUDENT",
] as const;

export const platformRoleValues = [
  "USER",
  "PLATFORM_SUPPORT",
  "PLATFORM_ADMIN",
  "PLATFORM_OWNER",
] as const;

export const platformPermissionValues = [
  "platform.dashboard.read",
  "platform.tenants.read",
  "platform.tenants.create",
  "platform.tenants.update",
  "platform.tenants.status",
  "platform.tenants.metrics",
  "platform.users.read",
  "platform.users.manage",
  "platform.users.roles",
  "platform.support.start",
  "platform.support.read",
  "platform.support.end",
  "platform.plans.read",
  "platform.plans.manage",
  "platform.subscriptions.read",
  "platform.subscriptions.manage",
  "platform.audit.read",
  "platform.health.read",
  "platform.settings.manage",
] as const;

export const permissionValues = [
  "*",
  "profile:read",
  "tenant:select",
  "tenant:manage",
  "memberships:read",
  "memberships:manage",
  "students.read",
  "students.create",
  "students.update",
  "students.status",
  "instructors.read",
  "instructors.create",
  "instructors.update",
  "instructors.status",
  "vehicles.read",
  "vehicles.create",
  "vehicles.update",
  "vehicles.status",
  "units.read",
  "units.create",
  "units.update",
  "units.status",
  "units.delete",
  "classrooms.read",
  "classrooms.create",
  "classrooms.update",
  "classrooms.status",
  "classrooms.delete",
  "availability.read",
  "availability.manage",
  "schedule-blocks.read",
  "schedule-blocks.manage",
  "practical-lessons.read",
  "practical-lessons.create",
  "practical-lessons.update",
  "practical-lessons.status",
  "practical-lessons.past",
  "theoretical-classes.read",
  "theoretical-classes.create",
  "theoretical-classes.update",
  "theoretical-classes.status",
  "theoretical-classes.participants",
  "schedule.read",
  "processes.read",
  "processes.create",
  "processes.update",
  "processes.start",
  "processes.suspend",
  "processes.complete",
  "processes.cancel",
  "process_stages.read",
  "process_stages.manage",
  "exams.read",
  "exams.create",
  "exams.confirm",
  "exams.complete",
  "exams.cancel",
  "exams.reschedule",
  "documents.review",
  "documents.approve",
  "documents.reject",
  "financial.dashboard.read",
  "services.read",
  "services.create",
  "services.update",
  "plans.read",
  "plans.create",
  "plans.update",
  "contracts.read",
  "contracts.create",
  "contracts.update",
  "contracts.activate",
  "contracts.complete",
  "contracts.cancel",
  "receivables.read",
  "receivables.manage",
  "receivables.discount",
  "payments.read",
  "payments.create",
  "payments.confirm",
  "payments.cancel",
  "payments.refund",
  "cash_registers.read",
  "cash_registers.open",
  "cash_registers.manage",
  "cash_registers.close",
  "expenses.read",
  "expenses.create",
  "expenses.update",
  "expenses.pay",
  "expenses.cancel",
  "financial_reports.read",
  "notifications.read",
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
] as const;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  password: z.string().min(8),
});

const refreshTokenSchema = z.string().min(20);

export const selectTenantSchema = z.object({
  tenantId: z.string().uuid(),
  refreshToken: refreshTokenSchema,
});

export const refreshSchema = z.object({
  refreshToken: refreshTokenSchema,
});

export const logoutSchema = refreshSchema;
export const tenantContextSchema = selectTenantSchema.pick({ tenantId: true });

const strongPasswordSchema = z.string().min(12).max(128);

export const inviteTeamMemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  role: z.enum(membershipRoleValues),
  profileId: z.string().uuid().optional(),
});

export const updateTeamMemberSchema = z
  .object({
    role: z.enum(membershipRoleValues).optional(),
    active: z.boolean().optional(),
  })
  .refine((input) => input.role !== undefined || input.active !== undefined, {
    message: "Informe role ou active.",
  });

export const forgotPasswordSchema = loginSchema.pick({ email: true });

export const credentialTokenSchema = z.object({
  token: z.string().min(32).max(512),
});

export const setCredentialPasswordSchema = credentialTokenSchema.extend({
  password: strongPasswordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: strongPasswordSchema,
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "A nova senha deve ser diferente da senha atual.",
    path: ["newPassword"],
  });

export type MembershipRole = (typeof membershipRoleValues)[number];
export type Permission = (typeof permissionValues)[number];
export type PlatformRole = (typeof platformRoleValues)[number];
export type PlatformPermission = (typeof platformPermissionValues)[number];
export type LoginInput = z.infer<typeof loginSchema>;
export type SelectTenantInput = z.infer<typeof selectTenantSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type TenantContext = z.infer<typeof tenantContextSchema>;
export type InviteTeamMemberInput = z.infer<typeof inviteTeamMemberSchema>;
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type CredentialTokenInput = z.infer<typeof credentialTokenSchema>;
export type SetCredentialPasswordInput = z.infer<
  typeof setCredentialPasswordSchema
>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: "TRIAL" | "ACTIVE";
}

export interface MembershipSummary {
  id: string;
  role: MembershipRole;
  permissions: Permission[];
  tenant: TenantSummary;
}

export interface TeamMemberSummary {
  id: string;
  role: MembershipRole;
  active: boolean;
  invitationPending: boolean;
  createdAt: string;
  user: UserSummary;
}

export interface TeamMemberInviteResult {
  member: TeamMemberSummary;
  emailSent: boolean;
}

export interface CredentialTokenInfo {
  type: "INVITATION" | "PASSWORD_RESET";
  email: string;
  name: string;
  tenant: { id: string; name: string } | null;
  expiresAt: string;
}

export interface ActionMessage {
  message: string;
}

export type TenantDashboardScope = "MANAGEMENT" | "INSTRUCTOR" | "STUDENT";
export type TenantDashboardMetricFormat = "NUMBER" | "CURRENCY";
export type TenantDashboardTaskTone = "INFO" | "WARNING" | "CRITICAL";
export type TenantDashboardEventKind =
  "PRACTICAL_LESSON" | "THEORETICAL_CLASS" | "EXAM";

export interface TenantDashboardMetric {
  key: string;
  label: string;
  value: number;
  format: TenantDashboardMetricFormat;
  href: string | null;
}

export interface TenantDashboardTask {
  key: string;
  title: string;
  description: string;
  count: number;
  href: string;
  tone: TenantDashboardTaskTone;
}

export interface TenantDashboardEvent {
  id: string;
  kind: TenantDashboardEventKind;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  context: string;
  href: string;
}

export interface TenantDashboardResponse {
  scope: TenantDashboardScope;
  generatedAt: string;
  metrics: TenantDashboardMetric[];
  tasks: TenantDashboardTask[];
  upcoming: TenantDashboardEvent[];
}

export const updateTenantSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    timezone: z.string().trim().min(3).max(64).optional(),
    locale: z
      .string()
      .trim()
      .regex(/^[a-z]{2}-[A-Z]{2}$/)
      .optional(),
    supportAccessEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Informe ao menos uma configuração.",
  });

export type UpdateTenantSettingsInput = z.infer<
  typeof updateTenantSettingsSchema
>;

export interface TenantSettingsSummary {
  tenant: { id: string; name: string; slug: string };
  timezone: string;
  locale: string;
  supportAccessEnabled: boolean;
  requireMfaForManagers: boolean;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: UserSummary;
  activeMembership: MembershipSummary | null;
  memberships: MembershipSummary[];
  platform?: PlatformAccessSummary;
}

export interface MeResponse {
  user: UserSummary;
  activeMembership: MembershipSummary | null;
  platform?: PlatformAccessSummary;
}

export interface PlatformAccessSummary {
  role: Exclude<PlatformRole, "USER">;
  permissions: PlatformPermission[];
  mfaEnabled: boolean;
}

export type RegistryStatus = "ACTIVE" | "INACTIVE";
export type StudentDocumentType =
  "RG" | "CNH" | "BIRTH_CERTIFICATE" | "PROOF_OF_ADDRESS" | "OTHER";
export type StudentProcessStatus =
  "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface StudentAddressSummary {
  id: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
}

export interface StudentDocumentSummary {
  id: string;
  type: StudentDocumentType;
  number: string;
  issuingAuthority: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
}

export interface StudentNoteSummary {
  id: string;
  content: string;
  createdAt: string;
}

export interface StudentProcessSummary {
  id: string;
  category: string;
  renach: string | null;
  status: StudentProcessStatus;
  openedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface StudentSummary {
  id: string;
  name: string;
  socialName: string | null;
  cpf: string;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  status: RegistryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudentDetail extends StudentSummary {
  address: StudentAddressSummary | null;
  documents: StudentDocumentSummary[];
  notes: StudentNoteSummary[];
  processes: StudentProcessSummary[];
}

export interface InstructorSummary {
  id: string;
  name: string;
  cpf: string;
  email: string | null;
  phone: string | null;
  license: string | null;
  licenseCategory: string | null;
  licenseExpiresAt: string | null;
  credentialNumber: string | null;
  status: RegistryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleSummary {
  id: string;
  plate: string;
  brand: string | null;
  model: string;
  year: number | null;
  color: string | null;
  renavam: string | null;
  chassis: string | null;
  category: string | null;
  status: RegistryStatus;
  createdAt: string;
  updatedAt: string;
}

export type Weekday =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

export type LessonStatus =
  | "PENDING"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "RESCHEDULED";

export type ScheduleResourceType =
  "INSTRUCTOR" | "VEHICLE" | "CLASSROOM" | "UNIT";

export interface SchoolUnitSummary {
  id: string;
  name: string;
  document: string | null;
  phone: string;
  email: string;
  address: string;
  openingTime: string;
  closingTime: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomSummary {
  id: string;
  unitId: string;
  name: string;
  capacity: number;
  active: boolean;
  unit: Pick<SchoolUnitSummary, "id" | "name">;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEvent {
  id: string;
  type: "PRACTICAL" | "THEORETICAL" | "BLOCK";
  title: string;
  startsAt: string;
  endsAt: string;
  status: LessonStatus | "BLOCKED";
  unit?: Pick<SchoolUnitSummary, "id" | "name"> | null;
}

export interface ScheduleResponse {
  from: string;
  to: string;
  events: ScheduleEvent[];
}

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
}

export interface ScheduleAvailabilityResponse {
  from: string;
  to: string;
  durationMinutes: number;
  slots: AvailabilitySlot[];
}

export type LicenseProcessType =
  | "FIRST_LICENSE"
  | "CATEGORY_ADDITION"
  | "CATEGORY_CHANGE"
  | "RENEWAL"
  | "REHABILITATION"
  | "REFRESHER";

export type LicenseProcessStatus =
  | "DRAFT"
  | "PENDING_DOCUMENTS"
  | "IN_PROGRESS"
  | "SUSPENDED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export type ExamType =
  "MEDICAL" | "PSYCHOLOGICAL" | "THEORETICAL" | "PRACTICAL";

export type ExamStatus =
  | "REQUESTED"
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "RESCHEDULED";

export type ExamResult =
  "PENDING" | "APPROVED" | "FAILED" | "ABSENT" | "INCONCLUSIVE";

export type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type NotificationChannel = "IN_APP" | "EMAIL" | "PUSH" | "SMS";
export type NotificationDeliveryStatus =
  | "PENDING"
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED"
  | "SUPPRESSED";

export interface NotificationSummary {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string | null;
  priority: NotificationPriority;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface NotificationPreferenceSummary {
  eventType: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  reminderMinutesBefore: number | null;
}

export interface CommunicationSettingsSummary {
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  language: string;
}

export interface NotificationTemplateSummary {
  id: string;
  tenantId: string | null;
  code: string;
  channel: NotificationChannel;
  subject: string | null;
  title: string | null;
  body: string;
  active: boolean;
  version: number;
  allowedVariables: string[];
  createdAt: string;
  updatedAt: string;
}

export type MobileProfileRole = "STUDENT" | "INSTRUCTOR";
export type MobileScheduleKind =
  "PRACTICAL_LESSON" | "THEORETICAL_CLASS" | "EXAM";
export type LessonEvaluationValue =
  "NEEDS_IMPROVEMENT" | "DEVELOPING" | "SATISFACTORY" | "GOOD" | "EXCELLENT";
export type VehicleOccurrenceType =
  | "VEHICLE_ISSUE"
  | "ACCIDENT"
  | "DAMAGE"
  | "MECHANICAL_PROBLEM"
  | "CLEANING_REQUIRED"
  | "OTHER";

export interface MobileSession {
  user: UserSummary;
  tenantId: string;
  role: MembershipRole;
  permissions: Permission[];
}

export interface MobileScheduleItem {
  id: string;
  kind: MobileScheduleKind;
  title: string;
  startsAt: string;
  endsAt: string;
  status: LessonStatus | ExamStatus;
  unit?: { id: string; name: string; address?: string } | null;
  instructor?: { id: string; name: string } | null;
  student?: { id: string; name: string; socialName?: string | null } | null;
}

export interface MobileLessonEvaluationInput {
  control: LessonEvaluationValue;
  attention: LessonEvaluationValue;
  signaling: LessonEvaluationValue;
  parking: LessonEvaluationValue;
  gearShift: LessonEvaluationValue;
  trafficRules: LessonEvaluationValue;
  confidence: LessonEvaluationValue;
  overallRating: LessonEvaluationValue;
  notes?: string;
  visibleToStudent: boolean;
}

export interface MobileOfflineOperation {
  localOperationId: string;
  tenantId: string;
  userId: string;
  idempotencyKey: string;
  kind:
    | "START_LESSON"
    | "COMPLETE_LESSON"
    | "NO_SHOW"
    | "LESSON_EVALUATION"
    | "THEORETICAL_ATTENDANCE"
    | "VEHICLE_OCCURRENCE";
  resourceId: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
  attempts: number;
  createdAt: string;
  lastError?: string;
}

export interface MobileDocumentUploadTicket {
  uploadUrl: string;
  method: "PUT";
  expiresAt: string;
  maxSizeBytes: number;
  acceptedMimeTypes: string[];
}
