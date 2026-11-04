"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import {
  fieldErrorsOf,
  foundReportSchema,
  lostReportSchema,
} from "@/lib/validation";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  STORAGE_BUCKET,
} from "@/lib/constants";
import {
  processNewReport,
  processReportAI,
  runMatchingForReport,
} from "@/lib/matching/run";
import {
  addStatusHistory,
  getFoundReport,
  getLostReport,
  setReportStatus,
} from "@/lib/reports";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionResult, ReportType } from "@/lib/types";

function validateImageFile(file: File): string | null {
  if (file.size > MAX_IMAGE_BYTES) return "Ukuran foto maksimal 5MB.";
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return "Format foto harus JPG, PNG, atau WebP.";
  return null;
}

async function uploadImage(
  file: File,
  type: ReportType,
  reportId: string,
): Promise<{ path: string } | { error: string }> {
  const invalid = validateImageFile(file);
  if (invalid) return { error: invalid };
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${type.toLowerCase()}/${reportId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[upload] gagal:", error);
    return { error: "Upload foto gagal. Coba lagi atau kirim tanpa foto." };
  }
  return { path };
}

function pickReportFields(
  formData: FormData,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = formData.get(key) ?? undefined;
  return out;
}

const BASE_KEYS = [
  "item_name",
  "category",
  "color",
  "brand",
  "model",
  "material",
  "description",
  "unique_features",
  "location_name",
  "latitude",
  "longitude",
];

export async function createLostReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!rateLimit(`report:${user.id}`, 10, 10 * 60_000)) {
    return {
      ok: false,
      error:
        "Terlalu banyak laporan dalam waktu singkat. Tunggu beberapa menit.",
    };
  }

  const parsed = lostReportSchema.safeParse({
    ...pickReportFields(formData, BASE_KEYS),
    lost_date: formData.get("lost_date"),
    lost_time: formData.get("lost_time") ?? undefined,
  });
  if (!parsed.success)
    return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const db = supabaseAdmin();
  const { data: inserted, error } = await db
    .from("lost_reports")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[report] insert lost gagal:", error);
    return { ok: false, error: "Gagal menyimpan laporan. Coba lagi." };
  }
  const reportId = inserted.id as string;
  await addStatusHistory(
    "LOST",
    reportId,
    "ACTIVE",
    "Laporan kehilangan dibuat",
  );

  // Foto opsional — kegagalan upload tidak menggagalkan laporan.
  let imageWarning: string | undefined;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const result = await uploadImage(file, "LOST", reportId);
    if ("path" in result) {
      await db
        .from("lost_reports")
        .update({ image_url: result.path })
        .eq("id", reportId);
      await db.from("report_images").insert({
        lost_report_id: reportId,
        storage_path: result.path,
        mime_type: file.type,
      });
    } else {
      imageWarning = result.error;
    }
  }

  // AI + matching berjalan SETELAH response terkirim (non-blocking untuk user).
  // Baris ai_analysis PENDING dibuat dulu agar halaman detail menampilkan
  // status "sedang dianalisis" dan tombol Retry tetap berfungsi.
  await db
    .from("ai_analysis")
    .insert({ lost_report_id: reportId, status: "PENDING" })
    .select("id")
    .maybeSingle();
  after(async () => {
    try {
      await processNewReport("LOST", reportId);
    } catch (err) {
      console.error("[report] AI pipeline gagal:", err);
    }
  });

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  redirect(
    `/reports/${reportId}?t=lost&created=1${imageWarning ? "&imgfail=1" : ""}`,
  );
}

export async function createFoundReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!rateLimit(`report:${user.id}`, 10, 10 * 60_000)) {
    return {
      ok: false,
      error:
        "Terlalu banyak laporan dalam waktu singkat. Tunggu beberapa menit.",
    };
  }

  const parsed = foundReportSchema.safeParse({
    ...pickReportFields(formData, BASE_KEYS),
    found_date: formData.get("found_date"),
    found_time: formData.get("found_time") ?? undefined,
    private_verification_info: formData.get("private_verification_info"),
  });
  const file = formData.get("image");
  const photo = file instanceof File && file.size > 0 ? file : null;
  const photoError = photo
    ? validateImageFile(photo)
    : "Foto barang wajib untuk laporan penemuan.";
  if (!parsed.success || !photo || photoError) {
    const fieldErrors = parsed.success ? {} : fieldErrorsOf(parsed.error);
    if (photoError) fieldErrors.image = photoError;
    return { ok: false, fieldErrors };
  }

  const db = supabaseAdmin();
  const { data: inserted, error } = await db
    .from("found_reports")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[report] insert found gagal:", error);
    return { ok: false, error: "Gagal menyimpan laporan. Coba lagi." };
  }
  const reportId = inserted.id as string;
  await addStatusHistory(
    "FOUND",
    reportId,
    "ACTIVE",
    "Laporan penemuan dibuat",
  );

  // Foto wajib & sudah divalidasi — kegagalan upload storage tetap tidak
  // menggagalkan laporan (ditandai lewat imgfail).
  let imageWarning: string | undefined;
  {
    const result = await uploadImage(photo, "FOUND", reportId);
    if ("path" in result) {
      await db
        .from("found_reports")
        .update({ image_url: result.path })
        .eq("id", reportId);
      await db.from("report_images").insert({
        found_report_id: reportId,
        storage_path: result.path,
        mime_type: photo.type,
      });
    } else {
      imageWarning = result.error;
    }
  }

  // AI + matching berjalan SETELAH response terkirim (non-blocking untuk user).
  await db
    .from("ai_analysis")
    .insert({ found_report_id: reportId, status: "PENDING" })
    .select("id")
    .maybeSingle();
  after(async () => {
    try {
      await processNewReport("FOUND", reportId);
    } catch (err) {
      console.error("[report] AI pipeline gagal:", err);
    }
  });

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  redirect(
    `/reports/${reportId}?t=found&created=1${imageWarning ? "&imgfail=1" : ""}`,
  );
}

/** Jalankan ulang AI analysis + matching (mis. saat Gemini sempat gagal). */
export async function retryAiAction(
  type: ReportType,
  reportId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!rateLimit(`retry-ai:${user.id}`, 6, 5 * 60_000)) {
    return {
      ok: false,
      error: "Terlalu sering. Tunggu sebentar lalu coba lagi.",
    };
  }
  const report =
    type === "LOST"
      ? await getLostReport(reportId)
      : await getFoundReport(reportId);
  if (!report || report.user_id !== user.id) {
    return { ok: false, error: "Laporan tidak ditemukan." };
  }
  await processReportAI(type, reportId);
  const summary = await runMatchingForReport(type, reportId);
  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/matches");
  return {
    ok: true,
    message:
      summary.saved > 0
        ? `Analisis selesai — ${summary.saved} potential match ditemukan.`
        : "Analisis selesai — belum ada match. Kami akan terus memantau laporan baru.",
  };
}

/** Tutup laporan (mis. barang sudah ketemu sendiri). */
export async function closeReportAction(
  type: ReportType,
  reportId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const report =
    type === "LOST"
      ? await getLostReport(reportId)
      : await getFoundReport(reportId);
  if (!report || report.user_id !== user.id) {
    return { ok: false, error: "Laporan tidak ditemukan." };
  }
  if (report.status === "RETURNED" || report.status === "CLOSED") {
    return { ok: false, error: "Laporan sudah selesai." };
  }
  await setReportStatus(type, reportId, "CLOSED", "Ditutup oleh pelapor");
  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
  return { ok: true };
}
