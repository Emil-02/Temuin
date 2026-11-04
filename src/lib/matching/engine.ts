// TEMUIN MATCHING ENGINE
// Skor akhir dihitung deterministik di backend — AI (Ollama/Gemini) hanya menyuplai
// sinyal (extraction, embedding, image analysis), BUKAN keputusan match.

import type {
  AiAnalysis,
  Extraction,
  FoundReport,
  ImageAnalysis,
  LostReport,
  MatchComponent,
  MatchLevel,
} from "@/lib/types";
import { categoryLabel, matchLevelFromScore } from "@/lib/constants";
import {
  clamp01,
  combineDateTime,
  cosineSimilarity,
  formatDistance,
  formatHoursDiff,
  haversineKm,
  textSimilarity,
} from "@/lib/utils";
import { translateTokens } from "@/lib/ai/fallback";
import { calibrateCosine, embeddingModelOf } from "@/lib/ai/embedding";

/** Bobot dasar. Komponen yang datanya tidak tersedia dikeluarkan dan
 *  bobot sisanya dinormalisasi ulang agar total tetap 100%. */
const BASE_WEIGHTS = {
  semantic: 30,
  attributes: 20,
  unique: 10,
  location: 20,
  time: 15,
  category: 5,
  image: 15,
} as const;

export interface MatchingResult {
  finalScore: number;
  level: MatchLevel;
  components: MatchComponent[];
  scores: {
    category_score: number | null;
    semantic_score: number | null;
    attribute_score: number | null;
    unique_feature_score: number | null;
    location_score: number | null;
    time_score: number | null;
    image_score: number | null;
  };
}

interface Side {
  report: LostReport | FoundReport;
  extraction: Extraction | null;
  image: ImageAnalysis | null;
  embedding: number[] | null;
  embeddingModel: string;
}

function toSide(
  report: LostReport | FoundReport,
  analysis: AiAnalysis | null,
): Side {
  return {
    report,
    extraction: analysis?.extraction ?? null,
    image: analysis?.image_analysis ?? null,
    embedding: analysis?.embedding ?? null,
    embeddingModel: embeddingModelOf(analysis?.embedding_model),
  };
}

/** Ambil nilai atribut: hasil AI extraction → analisis foto → field mentah (diterjemahkan). */
function attr(
  side: Side,
  key: "color" | "brand" | "material" | "model",
): string | null {
  const fromExtraction = side.extraction?.[key];
  if (fromExtraction) return fromExtraction.toLowerCase().trim();
  if (key !== "model") {
    const fromImage = side.image?.[key];
    if (fromImage)
      return fromImage
        .toLowerCase()
        .replace(/^possibly\s+/, "")
        .trim();
  }
  const raw = side.report[key];
  if (!raw) return null;
  return (
    (key === "brand" || key === "model"
      ? raw.toLowerCase()
      : translateTokens(raw)
    ).trim() || null
  );
}

function compareValues(a: string, b: string): number {
  const na = a.replace(/\b(dark|light|tua|muda)\b/g, "").trim();
  const nb = b.replace(/\b(dark|light|tua|muda)\b/g, "").trim();
  if (na === nb && na.length > 0) return 1;
  if (na.length > 2 && nb.length > 2 && (na.includes(nb) || nb.includes(na)))
    return 0.7;
  const sim = textSimilarity(na, nb);
  return sim >= 0.5 ? 0.6 : 0;
}

function features(side: Side): string[] {
  const list = [
    ...(side.extraction?.unique_features ?? []),
    ...(side.image?.distinctive_features ?? []),
  ]
    .map((f) => f.toLowerCase().trim())
    .filter(Boolean);
  if (list.length === 0 && side.report.unique_features) {
    return side.report.unique_features
      .split(/[,;\n]+/)
      .map((f) => translateTokens(f))
      .filter((f) => f.length > 1);
  }
  return Array.from(new Set(list));
}

// ---------- komponen ----------

function scoreCategory(lost: Side, found: Side): MatchComponent {
  const a = lost.report.category;
  const b = found.report.category;
  const typeA = lost.extraction?.item_type ?? null;
  const typeB = found.extraction?.item_type ?? found.image?.object ?? null;

  let score: number;
  let detail: string;
  if (a === b && a !== "other") {
    score = 1;
    detail = `Kategori sama: ${categoryLabel(a)}`;
  } else if (
    typeA &&
    typeB &&
    (typeA === typeB || textSimilarity(typeA, typeB) >= 0.6)
  ) {
    score = 0.9;
    detail = `Jenis barang serupa (${typeA})`;
  } else if (a === b) {
    score = 0.5;
    detail = "Kategori sama (Lainnya)";
  } else {
    score = 0;
    detail = `Kategori berbeda: ${categoryLabel(a)} vs ${categoryLabel(b)}`;
  }
  return {
    key: "category",
    label: "Kategori",
    weight: 0,
    score,
    detail,
    available: true,
  };
}

function scoreSemantic(lost: Side, found: Side): MatchComponent {
  // Embedding dari model berbeda tidak sebanding → pakai fallback teks.
  if (
    lost.embedding &&
    found.embedding &&
    lost.embeddingModel === found.embeddingModel &&
    lost.embedding.length === found.embedding.length
  ) {
    const cos = cosineSimilarity(lost.embedding, found.embedding);
    const mapped = calibrateCosine(cos, lost.embeddingModel);
    return {
      key: "semantic",
      label: "Kemiripan Deskripsi (AI)",
      weight: 0,
      score: mapped,
      detail: `Kemiripan semantik deskripsi ${Math.round(mapped * 100)}%`,
      available: true,
    };
  }
  // Fallback non-AI: kemiripan token lintas bahasa
  const textA =
    lost.extraction?.normalized_description ??
    translateTokens(`${lost.report.item_name} ${lost.report.description}`);
  const textB =
    found.extraction?.normalized_description ??
    translateTokens(`${found.report.item_name} ${found.report.description}`);
  const sim = clamp01(textSimilarity(textA, textB) * 1.4);
  return {
    key: "semantic",
    label: "Kemiripan Deskripsi",
    weight: 0,
    score: sim,
    detail: `Kemiripan deskripsi ${Math.round(sim * 100)}% (estimasi tanpa AI)`,
    available: true,
  };
}

function scoreAttributes(lost: Side, found: Side): MatchComponent {
  const keys: Array<"color" | "brand" | "material" | "model"> = [
    "color",
    "brand",
    "material",
    "model",
  ];
  const labels: Record<string, string> = {
    color: "warna",
    brand: "merek",
    material: "material",
    model: "model",
  };
  const compared: Array<{ key: string; score: number; value: string }> = [];
  for (const k of keys) {
    const va = attr(lost, k);
    const vb = attr(found, k);
    if (va && vb)
      compared.push({ key: k, score: compareValues(va, vb), value: va });
  }
  if (compared.length === 0) {
    return {
      key: "attributes",
      label: "Atribut Barang",
      weight: 0,
      score: null,
      detail: "Data atribut tidak cukup untuk dibandingkan",
      available: false,
    };
  }
  const score = compared.reduce((s, c) => s + c.score, 0) / compared.length;
  const matched = compared.filter((c) => c.score >= 0.6);
  const detail =
    matched.length > 0
      ? `Cocok: ${matched.map((c) => `${labels[c.key]} ${c.value}`).join(", ")}`
      : `Atribut berbeda (${compared.map((c) => labels[c.key]).join(", ")})`;
  return {
    key: "attributes",
    label: "Atribut Barang",
    weight: 0,
    score,
    detail,
    available: true,
  };
}

function scoreUniqueFeatures(lost: Side, found: Side): MatchComponent {
  const fa = features(lost);
  const fb = features(found);
  if (fa.length === 0 || fb.length === 0) {
    return {
      key: "unique",
      label: "Ciri Khusus",
      weight: 0,
      score: null,
      detail: "Ciri khusus tidak tersedia di salah satu laporan",
      available: false,
    };
  }
  let best = 0;
  let bestFeature = "";
  let sumMax = 0;
  for (const f of fa) {
    let max = 0;
    for (const g of fb) max = Math.max(max, textSimilarity(f, g));
    sumMax += max;
    if (max > best) {
      best = max;
      bestFeature = f;
    }
  }
  const avg = sumMax / fa.length;
  const score = clamp01(Math.max(avg, best * 0.85));
  const detail =
    best >= 0.45
      ? `Ciri khusus cocok: "${bestFeature}"`
      : "Tidak ada ciri khusus yang sama";
  return {
    key: "unique",
    label: "Ciri Khusus",
    weight: 0,
    score,
    detail,
    available: true,
  };
}

function scoreLocation(lost: Side, found: Side): MatchComponent {
  const lr = lost.report;
  const fr = found.report;
  if (
    lr.latitude != null &&
    lr.longitude != null &&
    fr.latitude != null &&
    fr.longitude != null
  ) {
    const km = haversineKm(
      lr.latitude,
      lr.longitude,
      fr.latitude,
      fr.longitude,
    );
    let score: number;
    if (km <= 0.1) score = 1;
    else if (km <= 0.3) score = 0.95;
    else if (km <= 1) score = 0.85;
    else if (km <= 3) score = 0.65;
    else if (km <= 5) score = 0.5;
    else if (km <= 10) score = 0.35;
    else if (km <= 25) score = 0.15;
    else score = 0.05;
    return {
      key: "location",
      label: "Lokasi",
      weight: 0,
      score,
      detail: `Jarak lokasi ${formatDistance(km)}`,
      available: true,
    };
  }
  const sim = textSimilarity(
    translateTokens(lr.location_name),
    translateTokens(fr.location_name),
  );
  const score = clamp01(sim * 1.15);
  return {
    key: "location",
    label: "Lokasi",
    weight: 0,
    score,
    detail:
      score >= 0.5
        ? `Nama lokasi serupa (${fr.location_name})`
        : "Nama lokasi berbeda",
    available: true,
  };
}

function scoreTime(lost: Side, found: Side): MatchComponent {
  const lr = lost.report as LostReport;
  const fr = found.report as FoundReport;
  const lostAt = combineDateTime(lr.lost_date, lr.lost_time);
  const foundAt = combineDateTime(fr.found_date, fr.found_time);
  const diffH = (foundAt.getTime() - lostAt.getTime()) / 3_600_000;

  if (diffH < -24) {
    return {
      key: "time",
      label: "Waktu",
      weight: 0,
      score: 0.05,
      detail: "Barang ditemukan sebelum waktu kehilangan",
      available: true,
    };
  }
  const eff = Math.abs(diffH);
  let score: number;
  if (eff <= 2) score = 1;
  else if (eff <= 6) score = 0.9;
  else if (eff <= 24) score = 0.75;
  else if (eff <= 72) score = 0.55;
  else if (eff <= 168) score = 0.4;
  else if (eff <= 720) score = 0.2;
  else score = 0.05;
  return {
    key: "time",
    label: "Waktu",
    weight: 0,
    score,
    detail: `Selisih waktu ${formatHoursDiff(eff)}`,
    available: true,
  };
}

function scoreImage(lost: Side, found: Side): MatchComponent {
  if (!lost.image || !found.image) {
    return {
      key: "image",
      label: "Foto",
      weight: 0,
      score: null,
      detail:
        lost.image || found.image
          ? "Foto hanya tersedia di satu laporan"
          : "Foto tidak tersedia",
      available: false,
    };
  }
  const parts: Array<{ w: number; s: number }> = [];
  const push = (a: string | null, b: string | null, w: number) => {
    if (a && b)
      parts.push({ w, s: compareValues(a.toLowerCase(), b.toLowerCase()) });
  };
  push(lost.image.object, found.image.object, 0.3);
  push(lost.image.color, found.image.color, 0.25);
  push(lost.image.brand, found.image.brand, 0.1);
  const featSimA = lost.image.distinctive_features.join(", ");
  const featSimB = found.image.distinctive_features.join(", ");
  if (featSimA && featSimB)
    parts.push({ w: 0.35, s: textSimilarity(featSimA, featSimB) });
  if (parts.length === 0) {
    return {
      key: "image",
      label: "Foto",
      weight: 0,
      score: null,
      detail: "Analisis foto tidak menghasilkan atribut yang bisa dibandingkan",
      available: false,
    };
  }
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const score = clamp01(parts.reduce((s, p) => s + p.s * p.w, 0) / totalW);
  return {
    key: "image",
    label: "Foto",
    weight: 0,
    score,
    detail:
      score >= 0.6
        ? "Objek pada kedua foto tampak serupa"
        : "Objek pada foto kurang serupa",
    available: true,
  };
}

// ---------- skor akhir ----------

export function computeMatch(
  lostReport: LostReport,
  lostAnalysis: AiAnalysis | null,
  foundReport: FoundReport,
  foundAnalysis: AiAnalysis | null,
): MatchingResult {
  const lost = toSide(lostReport, lostAnalysis);
  const found = toSide(foundReport, foundAnalysis);

  const components = [
    scoreSemantic(lost, found),
    scoreAttributes(lost, found),
    scoreUniqueFeatures(lost, found),
    scoreLocation(lost, found),
    scoreTime(lost, found),
    scoreCategory(lost, found),
    scoreImage(lost, found),
  ];

  const availableWeight = components.reduce(
    (sum, c) =>
      sum +
      (c.available ? BASE_WEIGHTS[c.key as keyof typeof BASE_WEIGHTS] : 0),
    0,
  );

  let weighted = 0;
  for (const c of components) {
    const base = BASE_WEIGHTS[c.key as keyof typeof BASE_WEIGHTS];
    if (c.available && c.score !== null && availableWeight > 0) {
      const normalizedWeight = (base / availableWeight) * 100;
      c.weight = Math.round(normalizedWeight * 10) / 10;
      weighted += c.score * normalizedWeight;
    } else {
      c.weight = 0;
    }
  }

  const finalScore = Math.round(Math.min(100, Math.max(0, weighted)) * 10) / 10;
  const get = (key: string) => {
    const c = components.find((x) => x.key === key);
    return c?.available && c.score !== null
      ? Math.round(c.score * 10000) / 10000
      : null;
  };

  return {
    finalScore,
    level: matchLevelFromScore(finalScore),
    components,
    scores: {
      category_score: get("category"),
      semantic_score: get("semantic"),
      attribute_score: get("attributes"),
      unique_feature_score: get("unique"),
      location_score: get("location"),
      time_score: get("time"),
      image_score: get("image"),
    },
  };
}
