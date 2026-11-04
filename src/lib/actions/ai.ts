"use server";

import { requireUser } from "@/lib/auth";
import { aiEnabled, describeItemForForm, type PhotoFormDraft } from "@/lib/ai";
import {
  ALLOWED_IMAGE_TYPES,
  CATEGORIES,
  MAX_IMAGE_BYTES,
} from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";

export type PhotoAnalysisResult =
  | { ok: true; draft: PhotoFormDraft }
  | { ok: false; error: string };

/** Analisis foto barang untuk mengisi otomatis formulir laporan.
 *  Tidak menyimpan apa pun — foto hanya dikirim ke Gemini lalu dibuang. */
export async function analyzeItemPhotoAction(
  formData: FormData,
): Promise<PhotoAnalysisResult> {
  const user = await requireUser();
  if (!rateLimit(`photo-ai:${user.id}`, 15, 10 * 60_000)) {
    return {
      ok: false,
      error: "Terlalu sering menganalisis foto. Tunggu beberapa menit.",
    };
  }
  if (!aiEnabled()) {
    return {
      ok: false,
      error: "Fitur isi otomatis AI sedang tidak tersedia. Silakan isi manual.",
    };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Foto tidak ditemukan." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Ukuran foto maksimal 5MB." };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "Format foto harus JPG, PNG, atau WebP." };
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await describeItemForForm(
    { base64, mimeType: file.type },
    CATEGORIES.map((c) => c.value),
  );
  if (!result) {
    return {
      ok: false,
      error:
        "Server AI sedang sibuk atau tidak merespons. Coba lagi sebentar, atau isi manual.",
    };
  }
  const draft = result.value;
  if (!draft.is_item) {
    return {
      ok: false,
      error:
        "AI tidak menemukan barang yang jelas di foto. Coba foto ulang lebih dekat dengan pencahayaan cukup.",
    };
  }
  return { ok: true, draft };
}
