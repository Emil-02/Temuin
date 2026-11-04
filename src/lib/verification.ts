// SMART OWNERSHIP VERIFICATION
// Jawaban claimant dibandingkan dengan data laporan penemu (termasuk
// private_verification_info). Referensi TIDAK pernah dikirim ke claimant.

import {
  judgeVerificationAnswers,
  type VerificationJudgeInput,
} from "@/lib/ai";
import { translateTokens } from "@/lib/ai/fallback";
import type { AiSource, FoundReport, VerificationCheck } from "@/lib/types";
import { formatDate, formatTime, textSimilarity } from "@/lib/utils";

export interface VerificationQuestion {
  key: string;
  label: string;
  question: string;
  placeholder: string;
  weight: number;
}

/** Pertanyaan verifikasi. Bobot dinormalisasi ulang terhadap pertanyaan yang tampil. */
export function buildVerificationQuestions(
  found: FoundReport,
): VerificationQuestion[] {
  const questions: VerificationQuestion[] = [];

  if (found.brand || found.model) {
    questions.push({
      key: "brand",
      label: "Merek / Model",
      question: "Apa merek (dan model, jika ada) barang Anda?",
      placeholder: "Contoh: Eiger, model dompet lipat",
      weight: 15,
    });
  }

  questions.push(
    {
      key: "features",
      label: "Ciri Khusus",
      question:
        "Sebutkan ciri khusus barang tersebut yang membedakannya dari barang serupa.",
      placeholder: "Contoh: ada gantungan huruf A, goresan di pojok kanan",
      weight: 25,
    },
    {
      key: "private_detail",
      label: "Detail Privat",
      question:
        "Sebutkan detail yang hanya diketahui pemilik — misalnya isi di dalamnya, tulisan/kode tertentu, stiker, wallpaper, atau tanda unik lain.",
      placeholder: "Contoh: ada kartu pelajar atas nama saya dan foto keluarga",
      weight: 35,
    },
    {
      key: "location",
      label: "Lokasi",
      question: "Di lokasi mana Anda terakhir melihat / kehilangan barang ini?",
      placeholder: "Contoh: sekitar food court Mall Panakkukang",
      weight: 15,
    },
    {
      key: "time",
      label: "Waktu",
      question: "Kapan (tanggal dan perkiraan jam) barang tersebut hilang?",
      placeholder: "Contoh: 8 Agustus sekitar jam 7 malam",
      weight: 10,
    },
  );

  return questions;
}

function referenceFor(found: FoundReport, key: string): string {
  switch (key) {
    case "brand":
      return [found.brand, found.model].filter(Boolean).join(" ") || "";
    case "features":
      return [found.unique_features, found.description]
        .filter(Boolean)
        .join(". ");
    case "private_detail":
      return found.private_verification_info;
    case "location":
      return found.location_name;
    case "time":
      return `${formatDate(found.found_date)} ${formatTime(found.found_time) || ""} (waktu barang ditemukan)`;
    default:
      return "";
  }
}

function fallbackVerdict(
  answer: string,
  reference: string,
): VerificationCheck["verdict"] {
  if (!reference.trim()) return "unknown";
  if (!answer.trim()) return "no_match";
  const sim = textSimilarity(
    translateTokens(answer),
    translateTokens(reference),
  );
  if (sim >= 0.45) return "match";
  if (sim >= 0.2) return "partial";
  return "no_match";
}

const VERDICT_VALUE: Record<VerificationCheck["verdict"], number> = {
  match: 1,
  partial: 0.5,
  no_match: 0,
  unknown: 0.35, // referensi tidak cukup — netral, jangan menghukum claimant
};

export interface VerificationEvaluation {
  checks: VerificationCheck[];
  score: number;
  evaluatedBy: AiSource;
}

export async function evaluateVerificationAnswers(
  found: FoundReport,
  questions: VerificationQuestion[],
  answers: Record<string, string>,
): Promise<VerificationEvaluation> {
  const judgeInputs: VerificationJudgeInput[] = questions.map((q) => ({
    key: q.key,
    question: q.question,
    claimantAnswer: answers[q.key] ?? "",
    reference: referenceFor(found, q.key),
  }));

  const result = await judgeVerificationAnswers(judgeInputs);
  const judged = result?.value ?? null;
  const evaluatedBy: AiSource = result?.provider ?? "fallback";

  const checks: VerificationCheck[] = questions.map((q) => {
    const fromJudge = judged?.find((r) => r.key === q.key);
    const verdict =
      fromJudge?.verdict ??
      fallbackVerdict(answers[q.key] ?? "", referenceFor(found, q.key));
    const note =
      fromJudge?.note ??
      (verdict === "match"
        ? "Jawaban sesuai dengan informasi penemu."
        : verdict === "partial"
          ? "Jawaban sebagian sesuai."
          : verdict === "unknown"
            ? "Informasi pembanding tidak cukup."
            : "Jawaban tidak sesuai dengan informasi penemu.");
    return { key: q.key, label: q.label, weight: q.weight, verdict, note };
  });

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const score =
    totalWeight === 0
      ? 0
      : Math.round(
          (checks.reduce((s, c) => s + VERDICT_VALUE[c.verdict] * c.weight, 0) /
            totalWeight) *
            1000,
        ) / 10;

  return { checks, score, evaluatedBy };
}

export function verificationRecommendation(score: number): {
  label: string;
  className: string;
  hint: string;
} {
  if (score >= 70)
    return {
      label: "Kemungkinan besar pemilik sah",
      className: "text-emerald-700 bg-emerald-50 ring-emerald-200",
      hint: "Jawaban claimant sangat sesuai dengan informasi privat Anda.",
    };
  if (score >= 40)
    return {
      label: "Perlu peninjauan manual",
      className: "text-amber-700 bg-amber-50 ring-amber-200",
      hint: "Sebagian jawaban sesuai. Pertimbangkan bertanya lebih lanjut sebelum menyetujui.",
    };
  return {
    label: "Kecocokan rendah",
    className: "text-rose-700 bg-rose-50 ring-rose-200",
    hint: "Jawaban claimant kurang sesuai. Berhati-hatilah terhadap klaim palsu.",
  };
}
