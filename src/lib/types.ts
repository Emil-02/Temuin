// Tipe data inti TEMUIN — merefleksikan schema database.

export type ReportType = "LOST" | "FOUND";

export type ReportStatus =
  | "ACTIVE"
  | "MATCH_FOUND"
  | "CLAIMED"
  | "VERIFICATION"
  | "HANDOVER"
  | "RETURNED"
  | "CLOSED";

export type ClaimStatus =
  | "SUBMITTED"
  | "UNDER_VERIFICATION"
  | "APPROVED"
  | "REJECTED"
  | "HANDOVER"
  | "COMPLETED";

export type MatchLevel = "LOW" | "POSSIBLE" | "GOOD" | "HIGH";

export type AiStatus = "PENDING" | "COMPLETED" | "PARTIAL" | "FAILED";

/** Asal hasil AI: provider LLM yang dipakai, atau heuristik lokal. */
export type AiSource = "ollama" | "gemini" | "fallback";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: "user" | "admin";
  created_at: string;
  updated_at: string;
}

interface ReportBase {
  id: string;
  user_id: string;
  item_name: string;
  category: string;
  color: string | null;
  brand: string | null;
  model: string | null;
  material: string | null;
  description: string;
  unique_features: string | null;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  status: ReportStatus;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface LostReport extends ReportBase {
  lost_date: string;
  lost_time: string | null;
}

export interface FoundReport extends ReportBase {
  /** RAHASIA — tidak boleh dikirim ke user selain penemunya sendiri. */
  private_verification_info: string;
  found_date: string;
  found_time: string | null;
}

/** Structured attributes hasil AI information extraction (canonical english lowercase). */
export interface Extraction {
  item_type: string | null;
  category: string | null;
  color: string | null;
  color_secondary: string | null;
  brand: string | null;
  model: string | null;
  material: string | null;
  unique_features: string[];
  keywords: string[];
  normalized_description: string | null;
}

export interface ImageAnalysis {
  object: string | null;
  category: string | null;
  color: string | null;
  brand: string | null;
  material: string | null;
  distinctive_features: string[];
  description: string | null;
}

export interface AiAnalysis {
  id: string;
  lost_report_id: string | null;
  found_report_id: string | null;
  extraction: Extraction | null;
  image_analysis: ImageAnalysis | null;
  embedding: number[] | null;
  /** Model pembuat embedding; null = data lama (Gemini). */
  embedding_model: string | null;
  source: AiSource;
  status: AiStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Satu komponen skor dalam explainable match score. */
export interface MatchComponent {
  key: string;
  label: string;
  /** Bobot ternormalisasi (persen) yang benar-benar dipakai. 0 jika tidak tersedia. */
  weight: number;
  /** 0..1, atau null jika data tidak tersedia. */
  score: number | null;
  detail: string;
  available: boolean;
}

export interface Match {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  category_score: number | null;
  semantic_score: number | null;
  attribute_score: number | null;
  unique_feature_score: number | null;
  location_score: number | null;
  time_score: number | null;
  image_score: number | null;
  final_score: number;
  match_level: MatchLevel;
  explanation: MatchComponent[];
  created_at: string;
  updated_at: string;
}

export interface Claim {
  id: string;
  match_id: string;
  claimant_id: string;
  status: ClaimStatus;
  verification_score: number | null;
  finder_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface VerificationCheck {
  key: string;
  label: string;
  weight: number;
  verdict: "match" | "partial" | "no_match" | "unknown";
  note: string;
}

export interface ClaimVerification {
  id: string;
  claim_id: string;
  answers: Record<string, string>;
  checks: VerificationCheck[];
  score: number | null;
  evaluated_by: AiSource | null;
  created_at: string;
  updated_at: string;
}

export type NotificationType =
  | "MATCH_FOUND"
  | "CLAIM_SUBMITTED"
  | "CLAIM_VERIFIED"
  | "CLAIM_APPROVED"
  | "CLAIM_REJECTED"
  | "NEW_MESSAGE"
  | "ITEM_RETURNED"
  | "SYSTEM";

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  claim_id: string;
  owner_id: string;
  finder_id: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface StatusHistory {
  id: string;
  lost_report_id: string | null;
  found_report_id: string | null;
  status: ReportStatus;
  note: string | null;
  created_at: string;
}

/** Bentuk balikan standar server action untuk form. */
export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  redirectTo?: string;
}
