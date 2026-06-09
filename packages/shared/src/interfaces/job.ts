export type ApplyMethod = 'greenhouse_api' | 'lever_api' | 'ashby_api' | 'workday_form' | 'external';

export type RemoteType = 'fully' | 'hybrid' | 'onsite' | 'unknown';

export type AuthenticityStatus = 'verified' | 'suspicious' | 'scam';

export type DraftStatus =
  | 'pending_review'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'submitted'
  | 'submission_failed'
  | 'manual_required'
  | 'expired';

export type InboxClassification =
  | 'interview_invite'
  | 'rejection'
  | 'offer'
  | 'recruiter_outreach'
  | 'application_confirmation'
  | 'screening_required'
  | 'reference_check'
  | 'noise';

export interface CompRange {
  min: number;
  max: number;
  currency: string;
}

export interface JobPosting {
  id?: string;
  source: string;
  source_id: string;
  canonical_key?: string;
  company: string;
  company_domain: string | null;
  role_title: string;
  location: string;
  remote: RemoteType;
  posted_at: Date;
  apply_url: string;
  apply_method: ApplyMethod;
  description_md: string;
  comp_range: CompRange | null;
  authenticity?: AuthenticityStatus;
  authenticity_signals?: Record<string, unknown>;
  discovered_at?: Date;
  raw?: unknown;
}

export interface MatchBreakdown {
  role_match: number;
  stack_match: number;
  seniority: number;
  location: number;
  comp: number;
  company_quality: number;
}

export interface ScreeningAnswer {
  question: string;
  answer: string;
  needs_review: boolean;
}

export interface ApplicationDraft {
  id?: string;
  user_id: string;
  posting_id: string;
  match_score: number;
  match_breakdown: MatchBreakdown | null;
  resume_variant_id?: string | null;
  cover_letter?: string | null;
  screening_answers?: ScreeningAnswer[] | null;
  status: DraftStatus;
  user_feedback?: string | null;
  approved_at?: Date | null;
  submitted_at?: Date | null;
  submission_receipt?: Record<string, unknown> | null;
  created_at?: Date;
}

export interface InboxEvent {
  id?: string;
  user_id: string;
  email_id: string;
  classified_as?: InboxClassification;
  related_draft_id?: string;
  parsed_data?: Record<string, unknown>;
  raw_subject?: string;
  raw_from?: string;
  received_at: Date;
  created_at?: Date;
}

export interface CalendarEvent {
  id?: string;
  user_id: string;
  inbox_event_id?: string;
  google_event_id?: string;
  scheduled_at: Date;
  title: string;
  prep_notes?: string;
  created_at?: Date;
}
