// Mobile API client. Same surface as web/lib/api.ts but token comes from
// expo-secure-store and base URL from app.json's `extra.apiUrl` (override
// per-build via EAS env vars or a .env.local).
import Constants from "expo-constants";
import { getToken } from "./auth";
import type {
  Application,
  ApplicationStatus,
  Interview,
  Job,
  JobsPage,
  MasterResume,
  RecruiterContact,
  SalaryDetails,
  TailoredResume,
  TailorQuota,
  TailorResponse,
} from "./types";

export const BASE: string =
  (Constants.expoConfig?.extra?.apiUrl as string) ||
  process.env.EXPO_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    !headers.has("Content-Type") &&
    opts.body &&
    !(opts.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...opts, headers });
  } catch (err) {
    throw new ApiError(0, null, `Network error: ${(err as Error).message}`);
  }

  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : res.statusText;
    throw new ApiError(res.status, body, `${res.status}: ${detail}`);
  }
  return body as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function _uploadResume(uri: string, name: string, mimeType: string) {
  const fd = new FormData();
  // RN FormData expects { uri, name, type } — the platform layer does the rest.
  // @ts-expect-error — react-native FormData type quirk
  fd.append("file", { uri, name, type: mimeType });
  return request<{
    id: string;
    parse_method: string;
    contact_info: Record<string, string>;
    skills_count: number;
    experience_count: number;
  }>("/api/resume/upload", { method: "POST", body: fd });
}

export const api = {
  baseUrl: () => BASE,

  health: () => request<{ status: string; mode: string }>("/health"),
  me: () => request<{ id: string; email: string; plan: string }>("/api/me"),
  tailorQuota: () => request<TailorQuota>("/api/me/tailor-quota"),

  // ── Jobs ──────────────────────────────────────────────────────────
  jobs: (params: {
    field?: string;
    level?: string;
    remote_type?: string;
    salary_min?: number;
    quality_min?: number;
    page?: number;
    page_size?: number;
  } = {}) => request<JobsPage>(`/api/jobs${qs(params)}`),
  jobFields: () => request<{ fields: string[] }>("/api/jobs/fields"),
  job: (id: string) => request<Job>(`/api/jobs/${id}`),
  ingestJobs: (queries: string[] = ["software engineer"]) =>
    request<{ fetched: number; gated: number; inserted: number }>(
      "/internal/jobs/fetch",
      { method: "POST", body: JSON.stringify({ queries }) },
    ),

  // ── Resume ────────────────────────────────────────────────────────
  uploadResume: _uploadResume,
  uploadResumeFromUri: _uploadResume,
  masterResume: () => request<MasterResume>("/api/me/master-resume"),
  putMasterResume: (body: Partial<MasterResume>) =>
    request<MasterResume>("/api/me/master-resume", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // ── Applications ──────────────────────────────────────────────────
  applications: (params: { status?: ApplicationStatus; starred?: boolean } = {}) =>
    request<Application[]>(
      `/api/applications${qs({
        status: params.status,
        starred: params.starred !== undefined ? String(params.starred) : undefined,
      })}`,
    ),
  application: (id: string) => request<Application>(`/api/applications/${id}`),
  createApplication: (body: {
    job_id?: string;
    title: string;
    company: string;
    platform?: string;
    status?: ApplicationStatus;
    notes?: string;
  }) =>
    request<Application>("/api/applications", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateApplication: (
    id: string,
    patch: Partial<{
      title: string;
      company: string;
      platform: string;
      status: ApplicationStatus;
      status_note: string;
      starred: boolean;
      applied_at: string;
      follow_up_date: string;
      follow_up_notified: boolean;
      notes: string;
      tailored_resume_id: string;
    }>,
  ) =>
    request<Application>(`/api/applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteApplication: (id: string) =>
    request<void>(`/api/applications/${id}`, { method: "DELETE" }),

  // ── Sub-resources ─────────────────────────────────────────────────
  contacts: (appId: string) =>
    request<RecruiterContact[]>(`/api/applications/${appId}/contacts`),
  addContact: (appId: string, body: Partial<RecruiterContact> & { name: string }) =>
    request<RecruiterContact>(`/api/applications/${appId}/contacts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  interviews: (appId: string) =>
    request<Interview[]>(`/api/applications/${appId}/interviews`),
  addInterview: (appId: string, body: Partial<Interview> & { round: string }) =>
    request<Interview>(`/api/applications/${appId}/interviews`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateInterview: (
    appId: string,
    interviewId: string,
    patch: Partial<{
      round: string;
      scheduled_at: string;
      duration_min: number;
      interviewer_names: string[];
      location: string;
      notes: string;
      outcome: string;
    }>,
  ) =>
    request<Interview>(`/api/applications/${appId}/interviews/${interviewId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  salary: (appId: string) =>
    request<SalaryDetails[]>(`/api/applications/${appId}/salary`),
  addSalary: (appId: string, body: Partial<SalaryDetails>) =>
    request<SalaryDetails>(`/api/applications/${appId}/salary`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Tailor ────────────────────────────────────────────────────────
  tailor: (jobId: string) =>
    request<TailorResponse>("/api/resume/tailor", {
      method: "POST",
      body: JSON.stringify({ job_id: jobId }),
    }),
  tailoredResumes: (jobId?: string) =>
    request<TailoredResume[]>(`/api/tailored-resumes${qs({ job_id: jobId })}`),
  tailoredResume: (id: string) =>
    request<TailoredResume>(`/api/tailored-resumes/${id}`),
  tailoredPdfPath: (id: string) => `/api/tailored-resumes/${id}/pdf`,
  /** Returns an authenticated URL the device can fetch via expo-file-system. */
  fetchTailoredPdfBytes: async (id: string): Promise<{ url: string; token: string | null }> => {
    return { url: `${BASE}/api/tailored-resumes/${id}/pdf`, token: await getToken() };
  },

  // ── Phase 6: push + notifications ─────────────────────────────────
  registerPushToken: (
    expoToken: string,
    opts: { platform?: "ios" | "android" | "web"; deviceName?: string } = {},
  ) =>
    request<{
      id: string; user_id: string; expo_token: string;
      platform: string | null; device_name: string | null;
      enabled: boolean; created_at: string; last_seen_at: string | null;
    }>("/api/me/push-tokens", {
      method: "POST",
      body: JSON.stringify({
        expo_token: expoToken,
        platform: opts.platform,
        device_name: opts.deviceName,
      }),
    }),
  disablePushToken: (expoToken: string) =>
    request<void>(`/api/me/push-tokens/${encodeURIComponent(expoToken)}`, {
      method: "DELETE",
    }),

  notificationPrefs: () =>
    request<{
      user_id: string;
      digest_enabled: boolean;
      push_enabled: boolean;
      digest_count: number;
      digest_hour_utc: number;
      timezone: string;
      updated_at: string;
    }>("/api/me/notification-preferences"),
  updateNotificationPrefs: (
    patch: Partial<{
      digest_enabled: boolean;
      push_enabled: boolean;
      digest_count: number;
      digest_hour_utc: number;
      timezone: string;
    }>,
  ) =>
    request<{
      user_id: string;
      digest_enabled: boolean;
      push_enabled: boolean;
      digest_count: number;
      digest_hour_utc: number;
      timezone: string;
      updated_at: string;
    }>("/api/me/notification-preferences", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
};
