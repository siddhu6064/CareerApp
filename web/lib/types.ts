// Mirrors backend Pydantic response shapes. Keep in sync with backend/main.py.

export type RemoteType = "remote" | "hybrid" | "onsite" | "any";
export type Level = "intern" | "entry" | "mid" | "senior" | "staff" | "principal" | "any";
export type Field =
  | "Engineering" | "Data" | "Design" | "Product"
  | "Marketing" | "Sales" | "Operations" | "Finance" | "Other";

export type ApplicationStatus =
  | "saved" | "applied" | "phone_screen" | "technical"
  | "onsite" | "offer" | "accepted" | "rejected";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "saved", "applied", "phone_screen", "technical",
  "onsite", "offer", "accepted", "rejected",
];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  phone_screen: "Phone Screen",
  technical: "Technical",
  onsite: "Onsite",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
};

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote_type: RemoteType | null;
  field: Field | null;
  level: Level | null;
  tech_stack: string[];
  salary_min: number | null;
  salary_max: number | null;
  posted_at: string | null;
  apply_url: string | null;
  jd_raw: string | null;
  source: string;
  quality_score: number | null;
}

export interface JobsPage {
  items: Job[];
  total: number;
  page: number;
  page_size: number;
}

export interface ContactInfo {
  name: string; email: string; phone: string;
  location: string; linkedin: string; github: string; website: string;
}
export interface ExperienceItem {
  role: string; company: string; period: string;
  description: string; location: string;
}
export interface EducationItem {
  school: string; degree: string; period: string; notes: string;
}
export interface ProjectItem {
  title: string; stack: string; description: string; url: string;
}

export interface MasterResume {
  id: string;
  user_id: string;
  contact_info: ContactInfo | null;
  summary: string | null;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  projects: ProjectItem[];
  certifications: string[];
  pdf_path: string | null;
  source: string;
  parse_method: string | null;
  raw_filename: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatusHistoryEntry {
  status: ApplicationStatus;
  changed_at: string;
  note: string | null;
}

export interface Application {
  id: string;
  user_id: string;
  job_id: string | null;
  tailored_resume_id: string | null;
  title: string;
  company: string;
  platform: string | null;
  status: ApplicationStatus;
  status_history: StatusHistoryEntry[];
  starred: boolean;
  applied_at: string | null;
  follow_up_date: string | null;
  follow_up_notified: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecruiterContact {
  id: string; application_id: string;
  name: string; role: string | null; email: string | null;
  phone: string | null; linkedin_url: string | null;
  notes: string | null; created_at: string;
}

export interface Interview {
  id: string; application_id: string;
  round: string;
  scheduled_at: string | null;
  duration_min: number | null;
  interviewer_names: string[];
  location: string | null;
  notes: string | null;
  outcome: string | null;
  created_at: string;
}

export interface SalaryDetails {
  id: string; application_id: string;
  base_min: number | null; base_max: number | null;
  bonus: number | null; equity_value: number | null;
  equity_vesting: string | null;
  currency: string;
  notes: string | null;
  created_at: string;
}

export interface TailorResponse {
  id: string;
  ats_score: number;
  match_points: string[];
  gaps: string[];
  keywords_added: string[];
  content_markdown: string;
  pdf_url: string;
  pdf_extension: string;
  sonnet_method: string;
  tailor_count_month: number;
  tailor_limit: number;
}

export interface TailoredResume {
  id: string;
  user_id: string;
  job_id: string | null;
  master_resume_id: string;
  content_markdown: string | null;
  ats_score: number | null;
  match_points: string[];
  gaps: string[];
  keywords_added: string[];
  pdf_path: string | null;
  source: string;
  sonnet_method: string | null;
  created_at: string;
}

export interface TailorQuota {
  plan: string;
  tailor_count_month: number;
  tailor_limit: number;
}

// ── Phase 8: Analytics ────────────────────────────────────────────────
export interface AnalyticsWindow {
  days: number;
  since_iso: string;
  plan: string;
}

export interface AnalyticsSummary {
  window: AnalyticsWindow;
  total_applications: number;
  applied_count: number;
  responded_count: number;
  interviewed_count: number;
  offered_count: number;
  response_rate: number;
  interview_rate: number;
  offer_rate: number;
  avg_days_to_response: number | null;
  response_sample_size: number;
}

export interface FunnelStage {
  status: ApplicationStatus;
  count: number;
}

export interface FieldBreakdown {
  field: string;
  applied: number;
  responded: number;
  response_rate: number;
}

export interface AnalyticsFunnel {
  window: AnalyticsWindow;
  total_applications: number;
  stages: FunnelStage[];
  by_field: FieldBreakdown[];
}

export interface AtsBucket {
  count: number;
  avg_ats: number | null;
}

export interface AtsPoint {
  application_id: string;
  ats_score: number;
  responded: boolean;
  company: string | null;
  title: string | null;
}

export interface AnalyticsAtsCorrelation {
  window: AnalyticsWindow;
  responded: AtsBucket;
  not_responded: AtsBucket;
  delta: number | null;
  low_data: boolean;
  min_per_bucket: number;
  points: AtsPoint[];
}

export interface AnalyticsDigest {
  window: AnalyticsWindow;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  tailor_conversions: number;
  tailor_count_total: number;
  open_rate: number;
  click_rate: number;
  click_through_rate: number;
  conversion_rate: number;
}

// ── Phase 9: Coach Tier ───────────────────────────────────────────────
export type CoachClientStatus = "pending" | "active" | "inactive";

export interface CoachClient {
  id: string;
  coach_id: string;
  client_id: string | null;
  invited_email: string;
  invited_name: string | null;
  status: CoachClientStatus;
  invite_token?: string | null;  // only present right after invite creation
  invited_at: string;
  accepted_at: string | null;
  notes: string | null;
  client_email_actual: string | null;
  client_name_actual: string | null;
  // Summary fields (present on /api/coach/clients list)
  applied_count?: number | null;
  response_rate?: number | null;
  last_activity_at?: string | null;
}

export interface CoachBranding {
  logo_path: string | null;
  logo_url: string | null;
  brand_color: string | null;
}

export interface BulkTailorResult {
  coach_client_id: string;
  client_id: string | null;
  ok: boolean;
  tailored_id: string | null;
  ats_score: number | null;
  error: string | null;
}

export interface BulkTailorResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: BulkTailorResult[];
}

export interface CoachClientAnalytics {
  summary: AnalyticsSummary;
  funnel: AnalyticsFunnel;
  window_days: number;
}

// ── Phase 8: Cover Letter ─────────────────────────────────────────
export interface CoverLetterResponse {
  id: string;
  job_id: string;
  tailored_resume_id: string | null;
  content_markdown: string;
  tone: string;
  pdf_url: string;
  pdf_extension: string;
  sonnet_method: string;
  notes: string;
  created_at: string;
}

export interface CoverLetterOut {
  id: string;
  user_id: string;
  job_id: string;
  tailored_resume_id: string | null;
  content_markdown: string;
  tone: string;
  pdf_path: string | null;
  sonnet_method: string | null;
  created_at: string;
}

// ── Phase 8: Interview Prep ───────────────────────────────────────
export interface InterviewQuestionOut {
  type: string;
  question: string;
  why_asked: string;
  suggested_approach: string;
}

export interface InterviewPrepOut {
  id: string;
  user_id: string;
  job_id: string;
  questions: InterviewQuestionOut[];
  strengths: string[];
  gaps_to_address: string[];
  talking_points: string[];
  haiku_method: string | null;
  created_at: string;
}

// ── Phase 10: Desktop BYOK ────────────────────────────────────────────
export interface ApiKeyOut {
  set: boolean;
  key_preview: string | null;
}
export interface SettingsKeys {
  anthropic: ApiKeyOut;
  github: ApiKeyOut;
}
export interface KeyValidateOut {
  ok: boolean;
  model?: string | null;
  login?: string | null;
  error?: string | null;
}
export interface SettingsValidateResult {
  anthropic: KeyValidateOut;
  github: KeyValidateOut;
}
export interface FetchNowResult {
  fetched: number;
  gated: number;
  tagged: number;
  inserted: number;
  skipped: number;
  expired_marked: number;
}
