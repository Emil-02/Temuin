import type {
  AiSource,
  ClaimStatus,
  MatchLevel,
  ReportStatus,
} from "./types";

export const APP_NAME = "Temuin";
export const APP_TAGLINE = "Yang Hilang, Bisa Ditemuin.";

export const CATEGORIES = [
  { value: "wallet", label: "Dompet" },
  { value: "phone", label: "Handphone / Smartphone" },
  { value: "keys", label: "Kunci" },
  { value: "bag", label: "Tas / Ransel" },
  { value: "laptop", label: "Laptop / Tablet" },
  { value: "watch", label: "Jam Tangan" },
  { value: "jewelry", label: "Perhiasan / Aksesori" },
  { value: "glasses", label: "Kacamata" },
  { value: "card", label: "Kartu / Dokumen Identitas" },
  { value: "clothing", label: "Pakaian / Jaket / Topi" },
  { value: "umbrella", label: "Payung" },
  { value: "book", label: "Buku / Dokumen" },
  { value: "electronics", label: "Elektronik Lainnya" },
  { value: "other", label: "Lainnya" },
] as const;

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "Lainnya";
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function aiSourceLabel(source: AiSource | null | undefined): string {
  if (source === "ollama") return "AI Kampus (Ollama)";
  if (source === "gemini") return "Gemini AI";
  return "Heuristik lokal";
}

export const REPORT_STATUS_META: Record<
  ReportStatus,
  { lostLabel: string; foundLabel: string; className: string }
> = {
  ACTIVE: {
    lostLabel: "Searching",
    foundLabel: "Aktif",
    className: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  MATCH_FOUND: {
    lostLabel: "Match Found",
    foundLabel: "Match Found",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  CLAIMED: {
    lostLabel: "Claimed",
    foundLabel: "Diklaim",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  VERIFICATION: {
    lostLabel: "Verifikasi",
    foundLabel: "Verifikasi",
    className: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  HANDOVER: {
    lostLabel: "Serah Terima",
    foundLabel: "Serah Terima",
    className: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  },
  RETURNED: {
    lostLabel: "Returned",
    foundLabel: "Returned",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  CLOSED: {
    lostLabel: "Ditutup",
    foundLabel: "Ditutup",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
  },
};

export function reportStatusLabel(
  status: ReportStatus,
  type: "LOST" | "FOUND",
): string {
  const meta = REPORT_STATUS_META[status];
  return type === "LOST" ? meta.lostLabel : meta.foundLabel;
}

export const CLAIM_STATUS_META: Record<
  ClaimStatus,
  { label: string; className: string }
> = {
  SUBMITTED: {
    label: "Submitted",
    className: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  UNDER_VERIFICATION: {
    label: "Under Verification",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  APPROVED: {
    label: "Approved",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  HANDOVER: {
    label: "Serah Terima",
    className: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
};

export const MATCH_LEVEL_META: Record<
  MatchLevel,
  { label: string; className: string; barClass: string }
> = {
  LOW: {
    label: "Low Match",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
    barClass: "bg-slate-400",
  },
  POSSIBLE: {
    label: "Possible Match",
    className: "bg-sky-50 text-sky-700 ring-sky-200",
    barClass: "bg-sky-500",
  },
  GOOD: {
    label: "Good Match",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
    barClass: "bg-amber-500",
  },
  HIGH: {
    label: "High Match",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    barClass: "bg-emerald-500",
  },
};

export function matchLevelFromScore(score: number): MatchLevel {
  if (score >= 85) return "HIGH";
  if (score >= 70) return "GOOD";
  if (score >= 50) return "POSSIBLE";
  return "LOW";
}

/** Skor minimal agar kandidat disimpan sebagai match. */
export const MATCH_SAVE_THRESHOLD = 40;
/** Skor minimal untuk notifikasi ke pemilik laporan hilang. */
export const MATCH_NOTIFY_OWNER_THRESHOLD = 50;
/** Skor minimal untuk notifikasi ke penemu. */
export const MATCH_NOTIFY_FINDER_THRESHOLD = 70;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const STORAGE_BUCKET = "report-images";
