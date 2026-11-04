// Seed data demo untuk development & presentasi.
// Laporan dibuat lewat PIPELINE ASLI (insert → AI analysis → matching engine)
// sehingga match score dihasilkan proses sesungguhnya, bukan hard-code.
//
// Cara pakai (dev):  buka http://localhost:3000/api/dev/seed?secret=<SEED_SECRET>
// atau:              curl -X POST http://localhost:3000/api/dev/seed -H "x-seed-secret: <SEED_SECRET>"

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processNewReport } from "@/lib/matching/run";
import { addStatusHistory } from "@/lib/reports";
import { aiEnabled } from "@/lib/ai";

export const maxDuration = 300;

const DEMO_PASSWORD = "Temuin!234";

const DEMO_USERS = [
  { email: "budi.demo@temuin.app", name: "Budi Santoso (Demo)" },
  { email: "sari.demo@temuin.app", name: "Sari Rahayu (Demo)" },
  { email: "andi.demo@temuin.app", name: "Andi Pratama (Demo)" },
] as const;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function ensureUser(email: string, fullName: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (!error && data.user) return data.user.id;

  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  const existing = list?.users.find((u) => u.email === email);
  if (!existing) {
    throw new Error(
      `Gagal membuat/menemukan user demo ${email} — createUser: ${error?.message ?? "-"} | listUsers: ${listError?.message ?? "-"}`,
    );
  }
  return existing.id;
}

export async function POST(request: NextRequest) {
  return handleSeed(request);
}

export async function GET(request: NextRequest) {
  return handleSeed(request);
}

async function handleSeed(request: NextRequest) {
  const secret = process.env.SEED_SECRET;
  const provided =
    request.headers.get("x-seed-secret") ??
    request.nextUrl.searchParams.get("secret");
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && (!secret || provided !== secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isDev && secret && provided !== secret) {
    return NextResponse.json(
      { error: "Sertakan ?secret=<SEED_SECRET> sesuai .env.local" },
      { status: 403 },
    );
  }

  try {
    const db = supabaseAdmin();

    const [ownerId, finderId, extraId] = await Promise.all(
      DEMO_USERS.map((u) => ensureUser(u.email, u.name)),
    );

    // Bersihkan data demo lama agar seed idempotent (cascade menghapus match/claim terkait).
    await db.from("lost_reports").delete().eq("is_demo", true);
    await db.from("found_reports").delete().eq("is_demo", true);

    const created: Array<{ type: string; id: string; item: string }> = [];

    async function createLost(userId: string, fields: Record<string, unknown>) {
      const { data, error } = await db
        .from("lost_reports")
        .insert({ ...fields, user_id: userId, is_demo: true })
        .select("id, item_name")
        .single();
      if (error || !data) throw new Error(`Seed lost gagal: ${error?.message}`);
      await addStatusHistory(
        "LOST",
        data.id,
        "ACTIVE",
        "Laporan kehilangan dibuat (demo)",
      );
      created.push({ type: "LOST", id: data.id, item: data.item_name });
      await processNewReport("LOST", data.id);
      return data.id as string;
    }

    async function createFound(
      userId: string,
      fields: Record<string, unknown>,
    ) {
      const { data, error } = await db
        .from("found_reports")
        .insert({ ...fields, user_id: userId, is_demo: true })
        .select("id, item_name")
        .single();
      if (error || !data)
        throw new Error(`Seed found gagal: ${error?.message}`);
      await addStatusHistory(
        "FOUND",
        data.id,
        "ACTIVE",
        "Laporan penemuan dibuat (demo)",
      );
      created.push({ type: "FOUND", id: data.id, item: data.item_name });
      await processNewReport("FOUND", data.id);
      return data.id as string;
    }

    // ============ SKENARIO UTAMA: dompet Eiger (target HIGH MATCH) ============
    const lostWalletId = await createLost(ownerId, {
      item_name: "Dompet Eiger Hitam",
      category: "wallet",
      color: "Hitam",
      brand: "Eiger",
      material: "Kulit",
      description:
        "Saya kehilangan dompet Eiger hitam dekat food court Mall Panakkukang sekitar jam 7 malam. Dompet kulit dengan gantungan huruf A. Di dalamnya ada kartu-kartu penting.",
      unique_features:
        "gantungan berbentuk huruf A, jahitan mulai lepas di pojok kanan",
      location_name: "Food Court Mall Panakkukang, Makassar",
      latitude: -5.1443,
      longitude: 119.4477,
      lost_date: daysAgo(2),
      lost_time: "19:00",
    });

    // ============ NEGATIF 1: kunci di lokasi berbeda ============
    await createLost(extraId, {
      item_name: "Kunci Motor Honda",
      category: "keys",
      color: "Silver",
      description:
        "Kunci motor Honda Beat hilang di area parkiran Terminal Daya, ada gantungan karet warna merah bentuk bintang.",
      unique_features: "gantungan karet merah bentuk bintang",
      location_name: "Terminal Daya, Makassar",
      latitude: -5.1099,
      longitude: 119.5178,
      lost_date: daysAgo(3),
      lost_time: "08:30",
    });

    // ============ NEGATIF 2: dompet berbeda (warna/lokasi/waktu jauh) ============
    await createFound(extraId, {
      item_name: "Dompet Coklat",
      category: "wallet",
      color: "Coklat",
      description:
        "Menemukan dompet kulit coklat wanita di anjungan Pantai Losari, ada resleting emas.",
      unique_features: "resleting emas, model panjang",
      private_verification_info:
        "Di dalamnya ada kartu member salon dan foto anak kecil, uang sekitar 20 ribu.",
      location_name: "Anjungan Pantai Losari, Makassar",
      latitude: -5.1439,
      longitude: 119.4064,
      found_date: daysAgo(20),
      found_time: "16:00",
    });

    // ============ NEGATIF 3: smartphone (kategori beda dari skenario utama) ============
    await createFound(finderId, {
      item_name: "Smartphone Samsung",
      category: "phone",
      color: "Biru",
      brand: "Samsung",
      description:
        "Menemukan HP Samsung biru di musala Mall Panakkukang lantai 2, casing bening dengan stiker kucing.",
      unique_features: "casing bening, stiker kucing di belakang",
      private_verification_info:
        "Wallpaper foto pantai, ada retak kecil di pojok kiri atas layar, kartu memori 64GB.",
      location_name: "Musala Mall Panakkukang, Makassar",
      latitude: -5.1441,
      longitude: 119.4472,
      found_date: daysAgo(2),
      found_time: "13:00",
    });

    // ============ SKENARIO UTAMA (lanjutan): dompet ditemukan ============
    const foundWalletId = await createFound(finderId, {
      item_name: "Black Leather Wallet",
      category: "wallet",
      color: "Black",
      brand: "Eiger",
      material: "Leather",
      description:
        "Dompet hitam ditemukan dekat food court Mall Panakkukang malam hari, terdapat gantungan berbentuk huruf A.",
      unique_features: "letter A keychain",
      private_verification_info:
        "Di dalam dompet ada KTP atas nama berawalan B, kartu ATM BCA, dan foto keluarga. Jahitan pojok kanan mulai lepas.",
      location_name: "Food Court Mall Panakkukang, Makassar",
      latitude: -5.1445,
      longitude: 119.4485,
      found_date: daysAgo(2),
      found_time: "19:20",
    });

    // Ambil skor skenario utama untuk ringkasan.
    const { data: mainMatch } = await db
      .from("matches")
      .select("final_score, match_level")
      .eq("lost_report_id", lostWalletId)
      .eq("found_report_id", foundWalletId)
      .maybeSingle();

    const { count: totalMatches } = await db
      .from("matches")
      .select("id", { count: "exact", head: true });

    return NextResponse.json({
      ok: true,
      message:
        "Seed selesai — laporan diproses lewat pipeline AI + matching engine asli.",
      demo_accounts: DEMO_USERS.map((u) => ({
        email: u.email,
        password: DEMO_PASSWORD,
      })),
      created,
      main_scenario: mainMatch
        ? {
            lost_report: lostWalletId,
            found_report: foundWalletId,
            score: mainMatch.final_score,
            level: mainMatch.match_level,
          }
        : {
            note: "Match utama belum terbentuk — cek GEMINI_API_KEY lalu jalankan seed lagi.",
          },
      total_matches: totalMatches ?? 0,
      ai_enabled: aiEnabled(),
    });
  } catch (err) {
    console.error("[seed] gagal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Seed gagal" },
      { status: 500 },
    );
  }
}
