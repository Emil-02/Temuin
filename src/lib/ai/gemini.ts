// Klien Gemini AI (provider cadangan) — SERVER-SIDE ONLY.
// GEMINI_API_KEY dibaca dari environment variable dan tidak pernah
// dikirim ke browser. Semua fungsi mengembalikan null saat gagal.

import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { l2normalize } from "@/lib/utils";
import type { AiImage, JsonSchema } from "./types";

export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIM = 768;

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function model(): string {
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

let cached: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!cached)
    cached = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return cached;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini timeout")), ms),
    ),
  ]);
}

const TYPE_MAP: Record<string, Type> = {
  object: Type.OBJECT,
  array: Type.ARRAY,
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
};

/** Konversi JSON Schema (format bersama, dipakai juga oleh Ollama) ke
 *  format OpenAPI-subset milik Gemini (`responseSchema`). */
function toGeminiSchema(schema: JsonSchema): Schema {
  const rawType = schema.type;
  const types = Array.isArray(rawType) ? rawType : [rawType];
  const nullable = types.includes("null");
  const main = types.find((t) => t !== "null") ?? "string";
  const out: Schema = { type: TYPE_MAP[main] ?? Type.STRING };
  if (nullable) out.nullable = true;
  if (Array.isArray(schema.enum)) {
    out.format = "enum";
    out.enum = (schema.enum as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
  }
  if (schema.items) out.items = toGeminiSchema(schema.items as JsonSchema);
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, JsonSchema>).map(
        ([k, v]) => [k, toGeminiSchema(v)],
      ),
    );
  }
  if (Array.isArray(schema.required))
    out.required = schema.required as string[];
  return out;
}

export async function geminiGenerateJson<T>(
  prompt: string,
  schema: JsonSchema,
  opts: { image?: AiImage; timeoutMs?: number } = {},
): Promise<T | null> {
  if (!geminiEnabled()) return null;
  try {
    const m = model();
    const parts = [
      ...(opts.image
        ? [
            {
              inlineData: {
                data: opts.image.base64,
                mimeType: opts.image.mimeType,
              },
            },
          ]
        : []),
      { text: prompt },
    ];
    const response = await withTimeout(
      client().models.generateContent({
        model: m,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(schema),
          temperature: 0.1,
          // Matikan thinking untuk kecepatan (didukung gemini-2.5-flash*)
          ...(m.startsWith("gemini-2.5-flash")
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : {}),
        },
      }),
      opts.timeoutMs ?? 30_000,
    );
    const text = (response.text ?? "")
      .replace(/^```(?:json)?|```$/gm, "")
      .trim();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("[gemini] generateContent gagal:", err);
    return null;
  }
}

export async function geminiEmbed(text: string): Promise<number[] | null> {
  if (!geminiEnabled() || !text.trim()) return null;
  try {
    const res = await withTimeout(
      client().models.embedContent({
        model: GEMINI_EMBEDDING_MODEL,
        contents: [text.slice(0, 1800)],
        config: {
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: EMBEDDING_DIM,
        },
      }),
      30_000,
    );
    const values = res.embeddings?.[0]?.values;
    if (!values || values.length === 0) return null;
    return l2normalize(values);
  } catch (err) {
    console.error("[gemini] embedContent gagal:", err);
    return null;
  }
}
