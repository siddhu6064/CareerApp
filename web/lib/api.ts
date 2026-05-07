// Typed API client. Reads bearer token from localStorage (set on /signin).
// In SaaS mode this token will be a Supabase JWT; in desktop dev it's the
// per-launch token printed to the FastAPI stdout.
"use client";

import type {
  Application,
  ApplicationStatus,
  AnalyticsAtsCorrelation,
  AnalyticsDigest,
  AnalyticsFunnel,
  AnalyticsSummary,
  BulkTailorResponse,
  CoachBranding,
  CoachClient,
  CoachClientAnalytics,
  FetchNowResult,
  Interview,
  Job,
  JobsPage,
  MasterResume,
  RecruiterContact,
  SalaryDetails,
  SettingsKeys,
  SettingsValidateResult,
  TailoredResume,
  TailorQuota,
  TailorResponse,
} from "./types";

const TOKEN_KEY = "appname_token";
const URL_KEY = "appname_api_url";

function resolveBase(): string {
  // Desktop mode: Tauri injects api_url into localStorage on boot.
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(URL_KEY);
    if (stored) return stored;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  window.localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(URL_KEY);
}

class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && opts.body && !(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${resolveBase()}${path}`, { ...opts, headers });
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

// ── Health & me ─────────────────────────────────────────────────────
export const api = {
  health: () => request<{ status: string; mode: string }>("/health"),
  me: () => request<{ id: string; email: string; plan: string; field: string | null; level: string | null; location: string | null; remote_pref: string | null }>("/api/me"),
  updatePreferences: (body: { field?: string | null; level?: string | null; location?: string | null; remote_pref?: string | null }) =>
    request<{ id: string; email: string; plan: string; field: string | null; level: string | null; location: string | null; remote_pref: string | null }>(
      "/api/me/preferences",
      { method: "PUT", body: JSON.stringify(body) },
    ),
  tailorQuota: () => request<TailorQuota>("/api/me/tailor-quota"),

  // ── Jobs ──────────────────────────────────────────────────────────
  jobs: (params: {
    field?: string; level?: string; remote_type?: string;
    salary_min?: number; quality_min?: number;
    page?: number; page_size?: number;
  } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    });
    const qs = q.toString();
    return request<JobsPage>(`/api/jobs${qs ? `?${qs}` : ""}`);
  },
  jobFields: () => request<{ fields: string[] }>("/api/jobs/fields"),
  job: (id: string) => request<Job>(`/api/jobs/${id}`),
  ingestJobs: (queries: string[] = ["software engineer"]) =>
    request<{
      fetched: number;
      gated: number;
      tagged: number;
      inserted: number;
      skipped: number;
      expired_marked: number;
    }>(
      "/internal/jobs/fetch",
      { method: "POST", body: JSON.stringify({ queries }) },
    ),

  // ── Resume ────────────────────────────────────────────────────────
  uploadResume: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{
      id: string; parse_method: string;
      contact_info: Record<string, string>;
      skills_count: number; experience_count: number;
    }>("/api/resume/upload", { method: "POST", body: fd });
  },
  masterResume: () => request<MasterResume>("/api/me/master-resume"),
  putMasterResume: (body: Partial<MasterResume>) =>
    request<MasterResume>("/api/me/master-resume", {
      method: "PUT", body: JSON.stringify(body),
    }),

  // ── Applications ──────────────────────────────────────────────────
  applications: (params: { status?: ApplicationStatus; starred?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.starred !== undefined) q.set("starred", String(params.starred));
    const qs = q.toString();
    return request<Application[]>(`/api/applications${qs ? `?${qs}` : ""}`);
  },
  application: (id: string) => request<Application>(`/api/applications/${id}`),
  createApplication: (body: {
    job_id?: string; title: string; company: string;
    platform?: string; status?: ApplicationStatus; notes?: string; starred?: boolean;
  }) => request<Application>("/api/applications", {
    method: "POST", body: JSON.stringify(body),
  }),
  updateApplication: (id: string, patch: Partial<{
    title: string; company: string; platform: string;
    status: ApplicationStatus; status_note: string;
    starred: boolean; applied_at: string; follow_up_date: string;
    follow_up_notified: boolean; notes: string; tailored_resume_id: string;
  }>) => request<Application>(`/api/applications/${id}`, {
    method: "PATCH", body: JSON.stringify(patch),
  }),
  deleteApplication: (id: string) => request<void>(`/api/applications/${id}`, { method: "DELETE" }),

  // ── Sub-resources ─────────────────────────────────────────────────
  contacts: (appId: string) =>
    request<RecruiterContact[]>(`/api/applications/${appId}/contacts`),
  addContact: (appId: string, body: Partial<RecruiterContact> & { name: string }) =>
    request<RecruiterContact>(`/api/applications/${appId}/contacts`, {
      method: "POST", body: JSON.stringify(body),
    }),
  interviews: (appId: string) =>
    request<Interview[]>(`/api/applications/${appId}/interviews`),
  addInterview: (appId: string, body: Partial<Interview> & { round: string }) =>
    request<Interview>(`/api/applications/${appId}/interviews`, {
      method: "POST", body: JSON.stringify(body),
    }),
  updateInterview: (
    appId: string,
    interviewId: string,
    patch: Partial<{
      round: string; scheduled_at: string; duration_min: number;
      interviewer_names: string[]; location: string; notes: string;
      outcome: string;
    }>,
  ) =>
    request<Interview>(`/api/applications/${appId}/interviews/${interviewId}`, {
      method: "PATCH", body: JSON.stringify(patch),
    }),
  salary: (appId: string) =>
    request<SalaryDetails[]>(`/api/applications/${appId}/salary`),
  addSalary: (appId: string, body: Partial<SalaryDetails>) =>
    request<SalaryDetails>(`/api/applications/${appId}/salary`, {
      method: "POST", body: JSON.stringify(body),
    }),

  // ── Tailor ────────────────────────────────────────────────────────
  tailor: (jobId: string) =>
    request<TailorResponse>("/api/resume/tailor", {
      method: "POST", body: JSON.stringify({ job_id: jobId }),
    }),
  tailoredResumes: (job_id?: string) => {
    const q = job_id ? `?job_id=${encodeURIComponent(job_id)}` : "";
    return request<TailoredResume[]>(`/api/tailored-resumes${q}`);
  },
  tailoredResume: (id: string) =>
    request<TailoredResume>(`/api/tailored-resumes/${id}`),
  tailoredPdfUrl: (id: string) => {
    const token = getToken() || "";
    // Bearer-protected — caller should fetch with auth, then create a blob URL.
    return `${resolveBase()}/api/tailored-resumes/${id}/pdf?_t=${token.slice(0, 8)}`;
  },
  fetchTailoredPdf: async (id: string): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${resolveBase()}/api/tailored-resumes/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
    return res.blob();
  },

  // ── Phase 6: notification preferences ─────────────────────────────
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

  // ── Phase 8: Analytics (Pro+ only — 402 for Free) ─────────────────
  analyticsSummary: (days = 90) =>
    request<AnalyticsSummary>(`/api/analytics/summary?days=${days}`),
  analyticsFunnel: (days = 90) =>
    request<AnalyticsFunnel>(`/api/analytics/funnel?days=${days}`),
  analyticsAtsCorrelation: (days = 90) =>
    request<AnalyticsAtsCorrelation>(`/api/analytics/ats-correlation?days=${days}`),
  analyticsDigest: (days = 90) =>
    request<AnalyticsDigest>(`/api/analytics/digest?days=${days}`),

  // ── Phase 9: Coach Tier (Coach plan only — 402 for everyone else) ──
  coachListClients: (status?: "pending" | "active" | "inactive") => {
    const q = status ? `?status=${status}` : "";
    return request<CoachClient[]>(`/api/coach/clients${q}`);
  },
  coachGetClient: (id: string) =>
    request<CoachClient>(`/api/coach/clients/${id}`),
  coachInviteClient: (body: { email: string; name?: string; notes?: string }) =>
    request<CoachClient>("/api/coach/clients", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  coachUpdateClient: (id: string, patch: Partial<{
    notes: string; invited_name: string; status: "active" | "inactive";
  }>) =>
    request<CoachClient>(`/api/coach/clients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  coachRemoveClient: (id: string) =>
    request<void>(`/api/coach/clients/${id}`, { method: "DELETE" }),
  coachLookupInvite: (token: string) =>
    request<CoachClient>(`/api/coach/invite/${encodeURIComponent(token)}`),
  coachAcceptInvite: (invite_token: string) =>
    request<CoachClient>("/api/coach/accept-invite", {
      method: "POST",
      body: JSON.stringify({ invite_token }),
    }),
  coachClientTracker: (id: string) =>
    request<Application[]>(`/api/coach/clients/${id}/tracker`),
  coachClientAnalytics: (id: string, days = 90) =>
    request<CoachClientAnalytics>(`/api/coach/clients/${id}/analytics?days=${days}`),
  coachClientTailored: (id: string, limit = 50) =>
    request<TailoredResume[]>(`/api/coach/clients/${id}/tailored?limit=${limit}`),
  coachTailorForClient: (id: string, job_id: string) =>
    request<{ ok: boolean; tailored_id: string; ats_score: number }>(
      `/api/coach/clients/${id}/tailor`,
      { method: "POST", body: JSON.stringify({ job_id }) },
    ),
  coachBulkTailor: (coach_client_ids: string[], job_id: string) =>
    request<BulkTailorResponse>("/api/coach/bulk-tailor", {
      method: "POST",
      body: JSON.stringify({ coach_client_ids, job_id }),
    }),
  coachGetBranding: () => request<CoachBranding>("/api/coach/branding"),
  coachPutBranding: (body: Partial<{ logo_path: string | null; brand_color: string | null }>) =>
    request<CoachBranding>("/api/coach/branding", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  coachUploadLogo: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ logo_path: string }>("/api/coach/branding/logo", {
      method: "POST",
      body: fd,
    });
  },

  // ── Phase 10: Desktop BYOK + manual fetch (404 in SaaS) ──────────
  settingsKeys: () => request<SettingsKeys>("/api/settings/keys"),
  putAnthropicKey: (api_key: string) =>
    request<{ set: boolean; key_preview: string | null }>(
      "/api/settings/keys/anthropic",
      { method: "PUT", body: JSON.stringify({ api_key }) },
    ),
  deleteAnthropicKey: () =>
    request<void>("/api/settings/keys/anthropic", { method: "DELETE" }),
  putGithubToken: (api_key: string) =>
    request<{ set: boolean; key_preview: string | null }>(
      "/api/settings/keys/github",
      { method: "PUT", body: JSON.stringify({ api_key }) },
    ),
  deleteGithubToken: () =>
    request<void>("/api/settings/keys/github", { method: "DELETE" }),
  validateKeys: () =>
    request<SettingsValidateResult>("/api/settings/keys/validate", {
      method: "POST",
    }),
  fetchJobsNow: (queries: string[] = []) =>
    request<FetchNowResult>("/api/jobs/fetch-now", {
      method: "POST",
      body: JSON.stringify(queries),
    }),
};

export { ApiError };
