export type AiProvider = "ollama" | "gemini";

/** JSON Schema standar — dipakai langsung oleh Ollama (`format`) dan
 *  dikonversi untuk Gemini (`responseSchema`). */
export type JsonSchema = Record<string, unknown>;

export interface AiImage {
  base64: string;
  mimeType: string;
}
