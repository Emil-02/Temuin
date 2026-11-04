// Pipeline otomatis: AI analysis per laporan + pencarian match.
// Dipanggil setelah laporan dibuat (dan bisa diulang manual bila AI gagal).

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  analyzeItemImage,
  embedForMatching,
  extractReportAttributes,
} from "@/lib/ai";
import { fallbackExtraction } from "@/lib/ai/fallback";
import { computeMatch } from "./engine";
import {
  MATCH_NOTIFY_FINDER_THRESHOLD,
  MATCH_NOTIFY_OWNER_THRESHOLD,
  MATCH_SAVE_THRESHOLD,
  STORAGE_BUCKET,
} from "@/lib/constants";
import { notify } from "@/lib/notifications";
import {
  getAnalysis,
  getFoundReport,
  getLostReport,
  reportFkColumn,
  setReportStatus,
} from "@/lib/reports";
import type {
  AiAnalysis,
  Extraction,
  FoundReport,
  ImageAnalysis,
  LostReport,
  ReportType,
} from "@/lib/types";
import { haversineKm } from "@/lib/utils";

// ---------------------------------------------------------------
// AI PROCESSING PER LAPORAN
// ---------------------------------------------------------------

async function downloadImageBase64(
  path: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .download(path);
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    if (buffer.byteLength === 0) return null;
    const ext = path.split(".").pop()?.toLowerCase();
    const mimeType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
    return { base64: buffer.toString("base64"), mimeType };
  } catch {
    return null;
  }
}

function embeddingText(
  extraction: Extraction,
  image: ImageAnalysis | null,
): string {
  const parts = [
    extraction.item_type,
    extraction.normalized_description,
    extraction.color && `color: ${extraction.color}`,
    extraction.brand && `brand: ${extraction.brand}`,
    extraction.material && `material: ${extraction.material}`,
    extraction.unique_features.length > 0 &&
      `distinctive features: ${extraction.unique_features.join(", ")}`,
    image?.description,
  ].filter(Boolean);
  return parts.join(". ");
}

/** Jalankan AI analysis untuk satu laporan. Tidak pernah throw — laporan tetap tersimpan. */
export async function processReportAI(
  type: ReportType,
  reportId: string,
): Promise<void> {
  const db = supabaseAdmin();
  const fk = reportFkColumn(type);
  const report =
    type === "LOST"
      ? await getLostReport(reportId)
      : await getFoundReport(reportId);
  if (!report) return;

  // Upsert manual: onConflict tidak bisa memakai partial unique index.
  const { data: existingAnalysis } = await db
    .from("ai_analysis")
    .select("id")
    .eq(fk, reportId)
    .maybeSingle();
  let analysisId = existingAnalysis?.id as string | undefined;
  if (analysisId) {
    await db
      .from("ai_analysis")
      .update({ status: "PENDING", error: null })
      .eq("id", analysisId);
  } else {
    const { data: insertedAnalysis, error: insertError } = await db
      .from("ai_analysis")
      .insert({ [fk]: reportId, status: "PENDING", error: null })
      .select("id")
      .single();
    if (insertError || !insertedAnalysis) {
      console.error("[ai] gagal membuat baris ai_analysis:", insertError);
      return;
    }
    analysisId = insertedAnalysis.id as string;
  }

  try {
    const input = {
      item_name: report.item_name,
      category: report.category,
      color: report.color,
      brand: report.brand,
      model: report.model,
      material: report.material,
      description: report.description,
      unique_features: report.unique_features,
      location_name: report.location_name,
    };

    const aiExtraction = await extractReportAttributes(input);
    const extraction = aiExtraction?.value ?? fallbackExtraction(input);

    let imageAnalysis: ImageAnalysis | null = null;
    if (report.image_url) {
      const img = await downloadImageBase64(report.image_url);
      if (img) imageAnalysis = (await analyzeItemImage(img))?.value ?? null;
    }

    const embedding = await embedForMatching(
      embeddingText(extraction, imageAnalysis),
    );

    const fullyDone =
      !!aiExtraction &&
      (!report.image_url || imageAnalysis !== null) &&
      !!embedding;
    const { error: saveError } = await db
      .from("ai_analysis")
      .update({
        extraction,
        image_analysis: imageAnalysis,
        embedding: embedding?.vector ?? null,
        embedding_model: embedding?.model ?? null,
        source: aiExtraction?.provider ?? "fallback",
        status: fullyDone ? "COMPLETED" : "PARTIAL",
        error: null,
      })
      .eq("id", analysisId);
    if (saveError) {
      console.error(
        "[ai] gagal menyimpan hasil analysis — pastikan migration supabase/migrations/0003_ollama_provider.sql sudah dijalankan:",
        saveError,
      );
      await db
        .from("ai_analysis")
        .update({ status: "FAILED", error: "Gagal menyimpan hasil analisis" })
        .eq("id", analysisId);
    }
  } catch (err) {
    console.error("[ai] processReportAI gagal:", err);
    const input = {
      item_name: report.item_name,
      category: report.category,
      color: report.color,
      brand: report.brand,
      model: report.model,
      material: report.material,
      description: report.description,
      unique_features: report.unique_features,
    };
    await db
      .from("ai_analysis")
      .update({
        extraction: fallbackExtraction(input),
        source: "fallback",
        status: "FAILED",
        error: err instanceof Error ? err.message : "AI processing gagal",
      })
      .eq("id", analysisId);
  }
}

// ---------------------------------------------------------------
// MATCHING RUNNER
// ---------------------------------------------------------------

export interface MatchingRunSummary {
  candidates: number;
  saved: number;
  bestScore: number | null;
}

const ACTIVE_STATUSES = ["ACTIVE", "MATCH_FOUND"];
const MAX_CANDIDATES = 100;
const MAX_DISTANCE_KM = 100;
const DATE_WINDOW_DAYS = 60;

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Cari & simpan match untuk satu laporan.
 * Pre-filter deterministik (kategori, rentang tanggal, radius) dilakukan dulu
 * agar perbandingan AI tidak menyapu seluruh database.
 */
export async function runMatchingForReport(
  type: ReportType,
  reportId: string,
): Promise<MatchingRunSummary> {
  const db = supabaseAdmin();
  const report =
    type === "LOST"
      ? await getLostReport(reportId)
      : await getFoundReport(reportId);
  if (!report) return { candidates: 0, saved: 0, bestScore: null };
  const analysis = await getAnalysis(type, reportId);

  const otherTable = type === "LOST" ? "found_reports" : "lost_reports";
  const otherDateCol = type === "LOST" ? "found_date" : "lost_date";
  const myDate =
    type === "LOST"
      ? (report as LostReport).lost_date
      : (report as FoundReport).found_date;

  // Barang ditemukan biasanya SETELAH hilang → window asimetris.
  const minDate =
    type === "LOST"
      ? shiftDate(myDate, -2)
      : shiftDate(myDate, -DATE_WINDOW_DAYS);
  const maxDate =
    type === "LOST"
      ? shiftDate(myDate, DATE_WINDOW_DAYS)
      : shiftDate(myDate, 2);

  let query = db
    .from(otherTable)
    .select("*")
    .in("status", ACTIVE_STATUSES)
    .neq("user_id", report.user_id)
    .gte(otherDateCol, minDate)
    .lte(otherDateCol, maxDate)
    .limit(MAX_CANDIDATES);

  if (report.category !== "other") {
    query = query.in("category", [report.category, "other"]);
  }

  const { data: candidatesRaw } = await query;
  let candidates = (candidatesRaw ?? []) as Array<LostReport | FoundReport>;

  // Filter radius bila kedua sisi punya koordinat.
  if (report.latitude != null && report.longitude != null) {
    candidates = candidates.filter(
      (c) =>
        c.latitude == null ||
        c.longitude == null ||
        haversineKm(
          report.latitude!,
          report.longitude!,
          c.latitude,
          c.longitude,
        ) <= MAX_DISTANCE_KM,
    );
  }

  if (candidates.length === 0)
    return { candidates: 0, saved: 0, bestScore: null };

  // Ambil semua analisis kandidat sekaligus.
  const otherFk = reportFkColumn(type === "LOST" ? "FOUND" : "LOST");
  const { data: analysesRaw } = await db
    .from("ai_analysis")
    .select("*")
    .in(
      otherFk,
      candidates.map((c) => c.id),
    );
  const analysisByReport = new Map<string, AiAnalysis>();
  for (const a of (analysesRaw ?? []) as AiAnalysis[]) {
    const key = (
      type === "LOST" ? a.found_report_id : a.lost_report_id
    ) as string;
    analysisByReport.set(key, a);
  }

  // Match yang sudah ada (untuk membedakan match baru vs update skor).
  const myFk = reportFkColumn(type);
  const { data: existingRaw } = await db
    .from("matches")
    .select("id, lost_report_id, found_report_id")
    .eq(myFk, reportId);
  const existingPairs = new Set(
    (
      (existingRaw ?? []) as Array<{
        lost_report_id: string;
        found_report_id: string;
      }>
    ).map((m) => `${m.lost_report_id}:${m.found_report_id}`),
  );

  let saved = 0;
  let bestScore: number | null = null;

  for (const candidate of candidates) {
    const lost = (type === "LOST" ? report : candidate) as LostReport;
    const found = (type === "LOST" ? candidate : report) as FoundReport;
    const lostAnalysis =
      type === "LOST" ? analysis : (analysisByReport.get(candidate.id) ?? null);
    const foundAnalysis =
      type === "LOST" ? (analysisByReport.get(candidate.id) ?? null) : analysis;

    const result = computeMatch(lost, lostAnalysis, found, foundAnalysis);
    if (bestScore === null || result.finalScore > bestScore)
      bestScore = result.finalScore;
    if (result.finalScore < MATCH_SAVE_THRESHOLD) continue;

    const { data: upserted } = await db
      .from("matches")
      .upsert(
        {
          lost_report_id: lost.id,
          found_report_id: found.id,
          ...result.scores,
          final_score: result.finalScore,
          match_level: result.level,
          explanation: result.components,
        },
        { onConflict: "lost_report_id,found_report_id" },
      )
      .select("id")
      .maybeSingle();

    saved++;
    const matchId = upserted?.id as string | undefined;
    const isNew = !existingPairs.has(`${lost.id}:${found.id}`);

    if (isNew && matchId) {
      const rounded = Math.round(result.finalScore);
      if (result.finalScore >= MATCH_NOTIFY_OWNER_THRESHOLD) {
        await notify(
          lost.user_id,
          "MATCH_FOUND",
          "Potential Match Found",
          `Kami menemukan barang dengan tingkat kecocokan ${rounded}% terhadap laporan kehilangan "${lost.item_name}".`,
          `/matches/${matchId}`,
        );
        await setReportStatus(
          "LOST",
          lost.id,
          "MATCH_FOUND",
          `Potential match ${rounded}%`,
        );
      }
      if (result.finalScore >= MATCH_NOTIFY_FINDER_THRESHOLD) {
        await notify(
          found.user_id,
          "MATCH_FOUND",
          "Kemungkinan pemilik ditemukan",
          `Seseorang mungkin pemilik barang yang Anda temukan (kecocokan ${rounded}%).`,
          `/matches/${matchId}`,
        );
        await setReportStatus(
          "FOUND",
          found.id,
          "MATCH_FOUND",
          `Potential match ${rounded}%`,
        );
      }
    }
  }

  return { candidates: candidates.length, saved, bestScore };
}

/** Pipeline lengkap setelah laporan dibuat: AI analysis → matching. */
export async function processNewReport(
  type: ReportType,
  reportId: string,
): Promise<MatchingRunSummary> {
  await processReportAI(type, reportId);
  return runMatchingForReport(type, reportId);
}
