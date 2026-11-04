// Layanan AI Temuin — SERVER-SIDE ONLY.
// Provider utama: Ollama (server AI kampus, mis. Gemma). Cadangan: Gemini
// (bila GEMINI_API_KEY diisi). Semua fungsi mengembalikan null bila tidak
// ada provider yang berhasil; pemanggil wajib memakai fallback heuristik.

import type { Extraction, ImageAnalysis } from "@/lib/types";
import {
  GEMINI_EMBEDDING_MODEL,
  geminiEmbed,
  geminiEnabled,
  geminiGenerateJson,
} from "./gemini";
import {
  ollamaEmbed,
  ollamaEmbedModel,
  ollamaEnabled,
  ollamaGenerateJson,
  ollamaWarmup,
} from "./ollama";
import type { AiImage, AiProvider, JsonSchema } from "./types";

export type { AiProvider } from "./types";

export interface AiResult<T> {
  value: T;
  provider: AiProvider;
}

export function aiEnabled(): boolean {
  return ollamaEnabled() || geminiEnabled();
}

/** Muat model Ollama lebih awal (mis. saat form laporan dibuka). */
export function warmupAi(): Promise<void> {
  return ollamaWarmup();
}

// Circuit breaker sederhana: bila server kampus gagal/timeout, lewati Ollama
// sementara agar request berikutnya langsung ke cadangan (tidak menunggu lagi).
const OLLAMA_COOLDOWN_MS = 60_000;
let ollamaDownUntil = 0;

function ollamaAvailable(): boolean {
  return ollamaEnabled() && Date.now() >= ollamaDownUntil;
}

function markOllamaDown(): void {
  ollamaDownUntil = Date.now() + OLLAMA_COOLDOWN_MS;
}

/** interactive = user sedang menunggu (timeout lebih pendek). */
async function generateJson<T>(
  prompt: string,
  schema: JsonSchema,
  opts: { image?: AiImage; interactive?: boolean } = {},
): Promise<AiResult<T> | null> {
  if (ollamaAvailable()) {
    const value = await ollamaGenerateJson<T>(prompt, schema, {
      image: opts.image,
      timeoutMs: opts.interactive ? 75_000 : 150_000,
    });
    if (value) return { value, provider: "ollama" };
    markOllamaDown();
  }
  if (geminiEnabled()) {
    const value = await geminiGenerateJson<T>(prompt, schema, {
      image: opts.image,
      timeoutMs: 30_000,
    });
    if (value) return { value, provider: "gemini" };
  }
  return null;
}

const nullableString = { type: ["string", "null"] };

// ---------------------------------------------------------------
// A. INFORMATION EXTRACTION
// ---------------------------------------------------------------

const EXTRACTION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    item_type: nullableString,
    category: nullableString,
    color: nullableString,
    color_secondary: nullableString,
    brand: nullableString,
    model: nullableString,
    material: nullableString,
    unique_features: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    normalized_description: nullableString,
  },
  required: [
    "item_type",
    "category",
    "color",
    "color_secondary",
    "brand",
    "model",
    "material",
    "unique_features",
    "keywords",
    "normalized_description",
  ],
};

export interface ExtractionInput {
  item_name: string;
  category: string;
  color: string | null;
  brand: string | null;
  model: string | null;
  material: string | null;
  description: string;
  unique_features: string | null;
  location_name: string;
}

export async function extractReportAttributes(
  input: ExtractionInput,
): Promise<AiResult<Extraction> | null> {
  const prompt = `You are an information extraction system for a lost & found platform in Indonesia.
Extract structured attributes about the ITEM from this report. Input may be in Indonesian or English.

RULES:
- Output all values in CANONICAL lowercase ENGLISH (translate Indonesian: "dompet"->"wallet", "hitam"->"black", "kulit"->"leather").
- item_type: single generic noun for the item (wallet, phone, keys, backpack, watch...).
- color: primary color only. color_secondary: second color if any.
- brand/model: only if stated. Do not guess.
- unique_features: short english phrases of distinguishing marks (e.g. "letter A keychain", "cracked screen corner", "batman sticker"). Max 8.
- keywords: 5-12 lowercase english search keywords.
- normalized_description: one clean english sentence describing the item (no location, no dates, no personal data).
- Use null for unknown fields. Never invent details that are not in the input.

REPORT:
item name: ${input.item_name}
category (user selected): ${input.category}
color: ${input.color ?? "-"}
brand: ${input.brand ?? "-"}
model: ${input.model ?? "-"}
material: ${input.material ?? "-"}
description: ${input.description}
unique features: ${input.unique_features ?? "-"}`;

  const result = await generateJson<Extraction>(prompt, EXTRACTION_SCHEMA);
  if (!result) return null;
  const r = result.value;
  return {
    provider: result.provider,
    value: {
      item_type: r.item_type ?? null,
      category: r.category ?? input.category,
      color: r.color ?? null,
      color_secondary: r.color_secondary ?? null,
      brand: r.brand ?? null,
      model: r.model ?? null,
      material: r.material ?? null,
      unique_features: (r.unique_features ?? []).slice(0, 8),
      keywords: (r.keywords ?? []).slice(0, 12),
      normalized_description: r.normalized_description ?? null,
    },
  };
}

// ---------------------------------------------------------------
// B. SEMANTIC EMBEDDING
// ---------------------------------------------------------------

export interface EmbeddingResult {
  vector: number[];
  /** Nama model — embedding hanya dibandingkan dengan model yang sama. */
  model: string;
}

export async function embedForMatching(
  text: string,
): Promise<EmbeddingResult | null> {
  if (!text.trim()) return null;
  if (ollamaAvailable()) {
    const vector = await ollamaEmbed(text);
    if (vector) return { vector, model: ollamaEmbedModel() };
    markOllamaDown();
  }
  if (geminiEnabled()) {
    const vector = await geminiEmbed(text);
    if (vector) return { vector, model: GEMINI_EMBEDDING_MODEL };
  }
  return null;
}

// ---------------------------------------------------------------
// C. IMAGE UNDERSTANDING (untuk matching)
// ---------------------------------------------------------------

const IMAGE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    object: nullableString,
    category: nullableString,
    color: nullableString,
    brand: nullableString,
    material: nullableString,
    distinctive_features: { type: "array", items: { type: "string" } },
    description: nullableString,
  },
  required: [
    "object",
    "category",
    "color",
    "brand",
    "material",
    "distinctive_features",
    "description",
  ],
};

export async function analyzeItemImage(
  image: AiImage,
): Promise<AiResult<ImageAnalysis> | null> {
  const prompt = `Analyze the item in this photo for a lost & found platform.
Return lowercase english values: object (generic noun), category, color (primary), brand (only if visibly readable, prefix "possibly " if uncertain), material, distinctive_features (visible unique marks: stickers, scratches, keychains, engravings; max 8), description (one english sentence).
Use null when not identifiable. Ignore background and hands. Never identify people.`;

  const result = await generateJson<ImageAnalysis>(prompt, IMAGE_SCHEMA, {
    image,
  });
  if (!result) return null;
  const r = result.value;
  return {
    provider: result.provider,
    value: {
      object: r.object ?? null,
      category: r.category ?? null,
      color: r.color ?? null,
      brand: r.brand ?? null,
      material: r.material ?? null,
      distinctive_features: (r.distinctive_features ?? []).slice(0, 8),
      description: r.description ?? null,
    },
  };
}

// ---------------------------------------------------------------
// C2. PHOTO → FORM AUTOFILL
// ---------------------------------------------------------------

export interface PhotoFormDraft {
  is_item: boolean;
  item_name: string | null;
  category: string | null;
  color: string | null;
  brand: string | null;
  model: string | null;
  material: string | null;
  description: string | null;
  unique_features: string[];
}

export async function describeItemForForm(
  image: AiImage,
  categories: readonly string[],
): Promise<AiResult<PhotoFormDraft> | null> {
  const schema: JsonSchema = {
    type: "object",
    properties: {
      is_item: { type: "boolean" },
      item_name: nullableString,
      category: { type: "string", enum: [...categories] },
      color: nullableString,
      brand: nullableString,
      model: nullableString,
      material: nullableString,
      description: nullableString,
      unique_features: { type: "array", items: { type: "string" } },
    },
    required: [
      "is_item",
      "item_name",
      "category",
      "color",
      "brand",
      "model",
      "material",
      "description",
      "unique_features",
    ],
  };

  const prompt = `Kamu membantu pengguna platform lost & found di Indonesia mengisi formulir laporan barang dari sebuah FOTO.
Tulis semua nilai dalam BAHASA INDONESIA yang singkat dan natural.

ATURAN:
- is_item: false jika foto tidak menampilkan barang yang jelas (mis. pemandangan, foto buram, layar kosong, hanya orang).
- item_name: nama barang singkat 2-5 kata, mis. "Dompet kulit hitam", "Kunci motor Honda".
- category: pilih SATU dari daftar: ${categories.join(", ")}. Gunakan "other" bila tidak ada yang cocok.
- color: warna utama (boleh tambah warna kedua), mis. "Hitam", "Biru dongker dan putih".
- brand: HANYA jika logo/tulisan merek terbaca jelas di foto. Jangan menebak. null bila tidak terlihat.
- model: tipe/model hanya bila terlihat jelas atau sangat yakin; selain itu null.
- material: perkiraan bahan bila cukup jelas (kulit, kain, plastik, logam, ...), selain itu null.
- description: 1-3 kalimat menggambarkan tampilan fisik barang (bentuk, ukuran perkiraan, kondisi). Minimal 20 karakter.
- unique_features: maksimal 6 ciri pembeda yang TERLIHAT (stiker, goresan, gantungan, retakan, tulisan non-pribadi). Frasa pendek.
- PRIVASI: JANGAN menyertakan nama orang, nomor kartu/telepon/identitas, alamat, atau isi dokumen pribadi yang terbaca di foto. Jangan mendeskripsikan wajah orang.
- Deskripsikan TAMPILAN LUAR barang saja. JANGAN menyebut isi di dalam barang (uang, kartu, dokumen, foto, dll.) di description maupun unique_features — detail isi dipakai penemu untuk pertanyaan verifikasi pemilik.
- Abaikan latar belakang dan tangan. Jangan mengarang detail yang tidak terlihat.`;

  const result = await generateJson<PhotoFormDraft>(prompt, schema, {
    image,
    interactive: true,
  });
  if (!result) return null;
  const r = result.value;

  const clean = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim().slice(0, max);
    return s.length > 0 ? s : null;
  };
  const category =
    typeof r.category === "string" && categories.includes(r.category)
      ? r.category
      : null;

  return {
    provider: result.provider,
    value: {
      is_item: r.is_item !== false,
      item_name: clean(r.item_name, 120),
      category,
      color: clean(r.color, 60),
      brand: clean(r.brand, 60),
      model: clean(r.model, 80),
      material: clean(r.material, 60),
      description: clean(r.description, 2000),
      unique_features: (Array.isArray(r.unique_features)
        ? r.unique_features
        : []
      )
        .map((f) => clean(f, 100))
        .filter((f): f is string => f !== null)
        .slice(0, 6),
    },
  };
}

// ---------------------------------------------------------------
// D. OWNERSHIP VERIFICATION JUDGE
// ---------------------------------------------------------------

export interface VerificationJudgeInput {
  key: string;
  question: string;
  claimantAnswer: string;
  /** Data pembanding dari laporan penemu (tidak pernah dikirim ke claimant). */
  reference: string;
}

export interface VerificationJudgeResult {
  key: string;
  verdict: "match" | "partial" | "no_match" | "unknown";
  note: string;
}

const JUDGE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          verdict: {
            type: "string",
            enum: ["match", "partial", "no_match", "unknown"],
          },
          note: { type: "string" },
        },
        required: ["key", "verdict", "note"],
      },
    },
  },
  required: ["results"],
};

const VERDICTS = new Set(["match", "partial", "no_match", "unknown"]);

export async function judgeVerificationAnswers(
  items: VerificationJudgeInput[],
): Promise<AiResult<VerificationJudgeResult[]> | null> {
  if (items.length === 0) return null;
  const prompt = `You are an ownership-verification assistant for a lost & found platform.
For each item, compare the CLAIMANT ANSWER against the REFERENCE (private info written by the finder, may be Indonesian or English).
Judge semantic equivalence, not exact wording ("dompet kulit hitam" matches "black leather wallet").

Verdicts:
- "match": answer clearly describes the same detail
- "partial": some overlap but incomplete or slightly off
- "no_match": contradicts or unrelated
- "unknown": reference too vague to judge

note: ONE short neutral sentence in Indonesian explaining the verdict. NEVER quote or reveal the reference content in the note.
Return one result per item, using the same key.

TODAY: ${new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Makassar" }).format(new Date())} (WITA). Resolve relative expressions like "kemarin" or "dua hari lalu" against today.
For key "time": the reference is when the item was FOUND, while the claimant describes when it was LOST. An item is always lost before it is found, so judge "match" if the described loss time is plausibly shortly before (same day or up to ~2 days before) the found time; "partial" if roughly consistent but vague; "no_match" only if clearly impossible (e.g. lost after it was found, or weeks apart).

ITEMS:
${items
  .map(
    (it, i) => `${i + 1}. key: ${it.key}
question: ${it.question}
claimant answer: ${it.claimantAnswer || "(kosong)"}
reference: ${it.reference || "(kosong)"}`,
  )
  .join("\n\n")}`;

  const result = await generateJson<{ results: VerificationJudgeResult[] }>(
    prompt,
    JUDGE_SCHEMA,
    { interactive: true },
  );
  if (!Array.isArray(result?.value.results)) return null;
  return {
    provider: result.provider,
    value: result.value.results.filter((r) => VERDICTS.has(r.verdict)),
  };
}
