import type {
  MobileDocumentUploadTicket,
  MobileScheduleItem,
} from "@prumo/contracts";
import { idempotencyHeaders, mobileRequest } from "@/lib/http-client";

const json = (method: string, body?: unknown, idempotencyKey?: string): RequestInit => ({
  method,
  headers: idempotencyKey ? idempotencyHeaders(idempotencyKey) : undefined,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const studentApi = {
  home: () => mobileRequest<Record<string, unknown>>("/mobile/student/home"),
  schedule: () =>
    mobileRequest<(MobileScheduleItem & Record<string, unknown>)[]>(
      "/mobile/student/schedule",
    ),
  scheduleItem: (id: string) =>
    mobileRequest<MobileScheduleItem & Record<string, unknown>>(
      `/mobile/student/schedule/${id}`,
    ),
  lessons: () => mobileRequest<Record<string, unknown>[]>("/mobile/student/lessons"),
  lesson: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/student/lessons/${id}`),
  confirmLesson: (id: string) =>
    mobileRequest(`/mobile/student/lessons/${id}/confirm`, json("POST")),
  changeLesson: (id: string, input: unknown) =>
    mobileRequest(`/mobile/student/lessons/${id}/change-requests`, json("POST", input)),
  processes: () => mobileRequest<Record<string, unknown>[]>("/mobile/student/processes"),
  process: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/student/processes/${id}`),
  exams: () => mobileRequest<Record<string, unknown>[]>("/mobile/student/exams"),
  exam: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/student/exams/${id}`),
  financial: () => mobileRequest<Record<string, unknown>>("/mobile/student/financial"),
  contract: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/student/contracts/${id}`),
  installment: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/student/installments/${id}`),
  payment: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/student/payments/${id}`),
  documents: () => mobileRequest<Record<string, unknown>[]>("/mobile/student/documents"),
  document: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/student/documents/${id}`),
  uploadTicket: (input: unknown) =>
    mobileRequest<MobileDocumentUploadTicket>(
      "/mobile/student/documents/upload-url",
      json("POST", input),
    ),
  upload: (url: string, contentBase64: string, signal?: AbortSignal) =>
    mobileRequest(url, {
      ...json("PUT", { contentBase64 }),
      signal,
    }),
  profile: () => mobileRequest<Record<string, unknown>>("/mobile/student/profile"),
};

export const instructorApi = {
  home: () => mobileRequest<Record<string, unknown>>("/mobile/instructor/home"),
  schedule: () =>
    mobileRequest<(MobileScheduleItem & Record<string, unknown>)[]>(
      "/mobile/instructor/schedule",
    ),
  scheduleItem: (id: string) =>
    mobileRequest<MobileScheduleItem & Record<string, unknown>>(
      `/mobile/instructor/schedule/${id}`,
    ),
  lessons: () => mobileRequest<Record<string, unknown>[]>("/mobile/instructor/lessons"),
  lesson: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/instructor/lessons/${id}`),
  startLesson: (id: string, input: unknown, key: string) =>
    mobileRequest(`/mobile/instructor/lessons/${id}/start`, json("POST", input, key)),
  completeLesson: (id: string, input: unknown, key: string) =>
    mobileRequest(`/mobile/instructor/lessons/${id}/complete`, json("POST", input, key)),
  noShow: (id: string, key: string) =>
    mobileRequest(`/mobile/instructor/lessons/${id}/no-show`, json("POST", undefined, key)),
  evaluate: (id: string, input: unknown, key: string) =>
    mobileRequest(`/mobile/instructor/lessons/${id}/evaluation`, json("PUT", input, key)),
  theoretical: () =>
    mobileRequest<Record<string, unknown>[]>("/mobile/instructor/theoretical-classes"),
  theoreticalClass: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/instructor/theoretical-classes/${id}`),
  startTheoretical: (id: string, key: string) =>
    mobileRequest(`/mobile/instructor/theoretical-classes/${id}/start`, json("POST", undefined, key)),
  attendance: (id: string, input: unknown, key: string) =>
    mobileRequest(`/mobile/instructor/theoretical-classes/${id}/attendance`, json("PUT", input, key)),
  completeTheoretical: (id: string, key: string) =>
    mobileRequest(`/mobile/instructor/theoretical-classes/${id}/complete`, json("POST", undefined, key)),
  students: () => mobileRequest<Record<string, unknown>[]>("/mobile/instructor/students"),
  student: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/instructor/students/${id}`),
  vehicles: () => mobileRequest<Record<string, unknown>[]>("/mobile/instructor/vehicles"),
  vehicle: (id: string) =>
    mobileRequest<Record<string, unknown>>(`/mobile/instructor/vehicles/${id}`),
  occurrence: (id: string, input: unknown, key: string) =>
    mobileRequest(`/mobile/instructor/vehicles/${id}/occurrences`, json("POST", input, key)),
  profile: () => mobileRequest<Record<string, unknown>>("/mobile/instructor/profile"),
};

export const notificationsApi = {
  list: () => mobileRequest<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>("/notifications"),
  read: (id: string) => mobileRequest(`/notifications/${id}/read`, json("POST")),
  readAll: () => mobileRequest("/notifications/read-all", json("POST")),
  settings: () => mobileRequest<Record<string, unknown>>("/communication/settings"),
  updateSettings: (input: unknown) =>
    mobileRequest("/communication/settings", json("PUT", input)),
  preferences: () =>
    mobileRequest<Record<string, unknown>[]>("/communication/preferences"),
  updatePreferences: (preferences: Record<string, unknown>[]) =>
    mobileRequest(
      "/communication/preferences",
      json("PUT", { preferences }),
    ),
};

export const devicesApi = {
  register: (input: unknown) =>
    mobileRequest("/devices/push-token", json("POST", input)),
  remove: (id: string) => mobileRequest(`/devices/${id}`, json("DELETE")),
};
