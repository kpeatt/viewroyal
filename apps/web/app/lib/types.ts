export interface Municipality {
  id: number;
  slug: string;
  name: string;
  short_name: string;
  province?: string;
  classification?: string;
  website_url?: string;
  rss_url?: string;
  contact_email?: string;
  map_center_lat?: number;
  map_center_lng?: number;
  ocd_id?: string;
  meta?: any;
  created_at: string;
  updated_at: string;
}

export type MeetingType =
  | "Regular Council"
  | "Special Council"
  | "Committee of the Whole"
  | "Public Hearing"
  | "Board of Variance"
  | "Standing Committee"
  | "Advisory Committee";

export type OrgClassification =
  | "Council"
  | "Committee"
  | "Board"
  | "Advisory Committee"
  | "Staff"
  | "Other";

export interface Organization {
  id: number;
  name: string;
  classification?: OrgClassification;
  meta?: any;
  created_at: string;
}

export interface Person {
  id: number;
  name: string;
  is_councillor: boolean;
  email?: string;
  image_url?: string;
  bio?: string;
  voice_fingerprint_id?: string;
  meta?: any;
  created_at: string;
  memberships?: Membership[];
}

export interface Membership {
  id: number;
  person_id: number;
  organization_id: number;
  role: string;
  start_date?: string;
  end_date?: string;
  created_at: string;
  organization?: Organization;
}

export interface Meeting {
  id: number;
  organization_id: number | null;
  title: string;
  meeting_date: string;
  type?: MeetingType;
  status?: string;
  has_agenda?: boolean;
  has_minutes?: boolean;
  has_transcript?: boolean;
  video_url?: string;
  minutes_url?: string;
  agenda_url?: string;
  video_duration_seconds?: number;
  archive_path?: string;
  chair_person_id?: number;
  summary?: string;
  meta?: any;
  created_at: string;
  organization?: Organization;
  chair?: Person;
}

export interface AgendaItem {
  id: number;
  meeting_id: number;
  matter_id: number | null;
  parent_id?: number;
  item_order?: string;
  title: string;
  description?: string;
  category?: string;
  debate_summary?: string;
  plain_english_summary?: string;
  is_controversial: boolean;
  is_consent_agenda: boolean;
  discussion_start_time?: number;
  discussion_end_time?: number;
  financial_cost?: number;
  funding_source?: string;
  neighborhood?: string;
  related_address?: string[];
  matter_status_snapshot?: string;
  keywords?: string[];
  geo_location?: any;
  source_file?: string;
  meta?: any;
  created_at: string;
  motions?: Motion[];
  meetings?: Meeting;
}

export interface Motion {
  id: number;
  meeting_id: number;
  agenda_item_id: number;
  motion_code?: string;
  mover?: string;
  seconder?: string;
  mover_id?: number;
  seconder_id?: number;
  text_content: string;
  plain_english_summary?: string;
  result?: string;
  disposition?: string;
  time_offset_seconds?: number;
  financial_cost?: number;
  funding_source?: string;
  recipient?: string;
  yes_votes: number;
  no_votes: number;
  abstain_votes: number;
  absent_votes: number;
  meta?: any;
  created_at: string;
  votes?: Vote[];
  mover_person?: Person;
  seconder_person?: Person;
}

export interface Vote {
  id: number;
  motion_id: number;
  person_id: number;
  vote: "Yes" | "No" | "Abstain" | "Recused";
  recusal_reason?: string;
  created_at: string;
  person?: Person;
}

export interface Attendance {
  id: number;
  meeting_id: number;
  person_id: number;
  attendance_mode: string;
  notes?: string;
  created_at: string;
  person?: Person;
}

export interface TranscriptSegment {
  id: number;
  meeting_id: number;
  speaker_name?: string;
  speaker_role?: string;
  person_id: number | null;
  agenda_item_id: number | null;
  matter_id: number | null;
  motion_id: number | null;
  attribution_source: string;
  is_verified: boolean;
  is_procedural: boolean;
  sentiment_score?: number;
  start_time: number;
  end_time: number;
  text_content: string;
  created_at: string;
  person?: Person;
}

export interface SpeakerAlias {
  id: number;
  meeting_id: number;
  speaker_label: string;
  person_id: number;
  person?: Person;
}

export interface Topic {
  id: number;
  name: string;
  description?: string;
  created_at: string;
}

export interface DocumentSection {
  id: number;
  document_id: number;
  agenda_item_id: number | null;
  section_title: string | null;
  section_text: string;
  section_order: number;
  page_start: number | null;
  page_end: number | null;
  token_count: number | null;
}

export interface Matter {
  id: number;
  title: string;
  identifier?: string;
  description?: string;
  category?: string;
  plain_english_summary?: string;
  status: string;
  first_seen?: string;
  last_seen?: string;
  bylaw_id?: number;
  bylaw?: Bylaw;
  meta?: any;
  created_at: string;
  agenda_items?: AgendaItem[];
  addresses?: string[];
  locations?: any[];
}

export interface Bylaw {
  id: number;
  title: string;
  bylaw_number?: string;
  year?: number;
  category?: string;
  status: string;
  file_path?: string;
  source_url?: string;
  full_text?: string;
  plain_english_summary?: string;
  outline?: string;
  created_at: string;
  matters?: Matter[];
}

export interface Election {
  id: number;
  name: string;
  election_date: string;
  classification?: string;
  term_length_years?: number;
  notes?: string;
  source_id?: number;
  meta?: any;
  created_at: string;
}

export interface ElectionOffice {
  id: number;
  election_id: number;
  office: string;
  seats_available?: number;
  created_at: string;
}

export interface Candidacy {
  id: number;
  election_office_id: number;
  person_id: number;
  is_elected: boolean;
  is_acclaimed: boolean;
  votes_received?: number;
  meta?: any;
  created_at: string;
}

// ── User Subscriptions & Alerts ──

export type SubscriptionType =
  | "matter"
  | "topic"
  | "person"
  | "neighborhood"
  | "digest";

export type DigestFrequency = "each_meeting" | "weekly";

export interface UserProfile {
  id: string; // uuid from auth.users
  display_name?: string;
  address?: string;
  neighborhood?: string;
  notification_email?: string;
  email_verified: boolean;
  digest_frequency: DigestFrequency;
  digest_enabled: boolean;
  onboarding_completed?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: number;
  user_id: string;
  type: SubscriptionType;
  matter_id?: number;
  topic_id?: number;
  person_id?: number;
  neighborhood?: string;
  proximity_radius_m: number;
  keyword?: string;
  keyword_embedding?: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  matter?: Matter;
  topic?: Topic;
  person?: Person;
}

export interface AlertLogEntry {
  id: number;
  user_id: string;
  subscription_id?: number;
  meeting_id?: number;
  agenda_item_id?: number;
  motion_id?: number;
  alert_type: string;
  email_sent: boolean;
  sent_at?: string;
  error_message?: string;
  created_at: string;
}

export interface MeetingDigest {
  meeting: {
    id: number;
    title: string;
    meeting_date: string;
    type: string;
    summary: string;
    has_minutes: boolean;
    has_transcript: boolean;
  };
  key_decisions: {
    motion_id: number;
    agenda_item_title: string;
    motion_text: string;
    result: string;
    yes_votes: number;
    no_votes: number;
    is_divided: boolean;
    financial_cost?: number;
    neighborhood?: string;
    related_address?: string;
  }[];
  controversial_items: {
    id: number;
    title: string;
    summary: string;
    debate_summary: string;
    neighborhood?: string;
    related_address?: string;
  }[];
  attendance: {
    person_name: string;
    mode: string;
  }[];
}

export interface NearbyMatter {
  id: number;
  title: string;
  identifier?: string;
  category?: string;
  status: string;
  distance_m: number;
  related_address?: string;
}
