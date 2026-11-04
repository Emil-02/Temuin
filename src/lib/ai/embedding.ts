// Kalibrasi cosine similarity per model embedding → skor 0..1.
// Tiap model punya sebaran cosine berbeda, jadi ambang harus per model.
//
// bge-m3 (diukur 2026-11): pasangan barang sama ~0.78-0.85, barang beda
// kategori sama ~0.59, beda kategori ~0.45-0.55.

import { GEMINI_EMBEDDING_MODEL } from "./gemini";

const CALIBRATION: Array<{ prefix: string; floor: number; span: number }> = [
  { prefix: "bge-m3", floor: 0.55, span: 0.3 },
  { prefix: GEMINI_EMBEDDING_MODEL, floor: 0.55, span: 0.37 },
];

const DEFAULT_CALIBRATION = { floor: 0.55, span: 0.37 };

/** Embedding lama (sebelum kolom embedding_model ada) dibuat oleh Gemini. */
export function embeddingModelOf(model: string | null | undefined): string {
  return model || GEMINI_EMBEDDING_MODEL;
}

export function calibrateCosine(cos: number, model: string): number {
  const c =
    CALIBRATION.find((x) => model.startsWith(x.prefix)) ?? DEFAULT_CALIBRATION;
  return Math.min(1, Math.max(0, (cos - c.floor) / c.span));
}
