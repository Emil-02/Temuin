// Klien Ollama (provider AI utama — server AI kampus) — SERVER-SIDE ONLY.
// Konfigurasi lewat environment variable; semua fungsi mengembalikan null
// saat gagal sehingga pemanggil bisa beralih ke provider cadangan.

import { l2normalize } from "@/lib/utils";
import type { AiImage, JsonSchema } from "./types";

const DEFAULT_MODEL = "gemma4:latest";
const DEFAULT_EMBED_MODEL = "bge-m3:latest";

function baseUrl(): string | null {
  const url = process.env.OLLAMA_BASE_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

export function ollamaEnabled(): boolean {
  return baseUrl() !== null;
}

export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

export function ollamaEmbedModel(): string {
  return process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED_MODEL;
}

// Server dipakai bersama: minta model tetap di memori lebih lama agar
// request berikutnya tidak kena cold start (memuat model bisa ~1-2 menit).
function keepAlive(): string {
  return process.env.OLLAMA_KEEP_ALIVE || "30m";
}

async function post<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (process.env.OLLAMA_API_KEY) {
    headers.authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
  }
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Ollama ${path} HTTP ${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

export async function ollamaGenerateJson<T>(
  prompt: string,
  schema: JsonSchema,
  opts: { image?: AiImage; timeoutMs?: number } = {},
): Promise<T | null> {
  if (!ollamaEnabled()) return null;
  try {
    const data = await post<{ message?: { content?: string } }>(
      "/api/chat",
      {
        model: ollamaModel(),
        stream: false,
        think: false,
        keep_alive: keepAlive(),
        format: schema,
        options: { temperature: 0.1 },
        messages: [
          {
            role: "user",
            content: prompt,
            ...(opts.image ? { images: [opts.image.base64] } : {}),
          },
        ],
      },
      opts.timeoutMs ?? 120_000,
    );
    const text = (data.message?.content ?? "")
      .replace(/^```(?:json)?|```$/gm, "")
      .trim();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("[ollama] chat gagal:", err);
    return null;
  }
}

export async function ollamaEmbed(text: string): Promise<number[] | null> {
  if (!ollamaEnabled() || !text.trim()) return null;
  try {
    const data = await post<{ embeddings?: number[][] }>(
      "/api/embed",
      {
        model: ollamaEmbedModel(),
        input: text.slice(0, 4000),
        keep_alive: keepAlive(),
      },
      90_000,
    );
    const values = data.embeddings?.[0];
    if (!values || values.length === 0) return null;
    return l2normalize(values);
  } catch (err) {
    console.error("[ollama] embed gagal:", err);
    return null;
  }
}

let lastWarmup = 0;

/** Minta server memuat model ke memori (tanpa generate) agar analisis foto
 *  berikutnya cepat. Fire-and-forget, dibatasi sekali per menit per proses. */
export async function ollamaWarmup(): Promise<void> {
  if (!ollamaEnabled() || Date.now() - lastWarmup < 60_000) return;
  lastWarmup = Date.now();
  try {
    await post(
      "/api/generate",
      { model: ollamaModel(), keep_alive: keepAlive() },
      180_000,
    );
  } catch (err) {
    console.error("[ollama] warmup gagal:", err);
  }
}
