import Link from "next/link";
import {
  ArrowRight,
  Backpack,
  Bell,
  BookOpen,
  Bot,
  CheckCircle2,
  CreditCard,
  FileText,
  Glasses,
  HandHeart,
  Headphones,
  ImageOff,
  KeyRound,
  Laptop,
  Lock,
  MapPin,
  MessageSquareLock,
  PackageSearch,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Umbrella,
  Wallet,
  Watch,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { getSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function getPublicStats() {
  try {
    const db = supabaseAdmin();
    const [lost, found, matches, returned] = await Promise.all([
      db.from("lost_reports").select("id", { count: "exact", head: true }),
      db.from("found_reports").select("id", { count: "exact", head: true }),
      db.from("matches").select("id", { count: "exact", head: true }),
      db
        .from("lost_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "RETURNED"),
    ]);
    const lostCount = lost.count ?? 0;
    return {
      reports: lostCount + (found.count ?? 0),
      matches: matches.count ?? 0,
      returned: returned.count ?? 0,
      rate: lostCount > 0 ? ((returned.count ?? 0) / lostCount) * 100 : null,
    };
  } catch {
    return null;
  }
}

function Scribble({ children }: { children: React.ReactNode }) {
  return (
    <span className="scribble">
      {children}
      <svg viewBox="0 0 220 24" aria-hidden preserveAspectRatio="none">
        <path d="M4 16 C 40 8, 80 20, 116 13 S 190 10, 216 15" />
      </svg>
    </span>
  );
}

const MARQUEE_ITEMS = [
  { icon: Wallet, label: "Dompet" },
  { icon: Smartphone, label: "Handphone" },
  { icon: KeyRound, label: "Kunci" },
  { icon: Backpack, label: "Tas" },
  { icon: Laptop, label: "Laptop" },
  { icon: Watch, label: "Jam Tangan" },
  { icon: Glasses, label: "Kacamata" },
  { icon: CreditCard, label: "KTP & Kartu" },
  { icon: Umbrella, label: "Payung" },
  { icon: BookOpen, label: "Dokumen" },
  { icon: Headphones, label: "Earphone" },
];

const HOW_STEPS = [
  {
    icon: FileText,
    title: "Laporkan",
    text: "Cukup deskripsi, lokasi, dan waktu — foto opsional. Laporan tersimpan seketika.",
  },
  {
    icon: Bot,
    title: "AI Mencocokkan",
    text: "AI (Gemma di server AI kampus) mengekstrak ciri barang; Temuin Matching Engine menghitung skor dari 7 komponen.",
  },
  {
    icon: ShieldCheck,
    title: "Verifikasi",
    text: "Pengklaim menjawab pertanyaan privat. AI menilai, penemu yang memutuskan.",
  },
  {
    icon: CheckCircle2,
    title: "Kembali",
    text: "Chat aman terbuka untuk serah terima. Barang pulang, tercatat di halaman Impact.",
  },
];

const SCORE_WEIGHTS = [
  { label: "Kemiripan deskripsi", w: 30 },
  { label: "Atribut barang", w: 20 },
  { label: "Lokasi", w: 20 },
  { label: "Waktu", w: 15 },
  { label: "Ciri khusus", w: 10 },
  { label: "Kategori", w: 5 },
];

const STATUS_JOURNEY = [
  "ACTIVE",
  "MATCH FOUND",
  "CLAIMED",
  "VERIFICATION",
  "HANDOVER",
  "RETURNED",
];

const PLACES = [
  "Kampus",
  "Sekolah",
  "Mall",
  "Rumah Sakit",
  "Terminal",
  "Bandara",
  "Stasiun",
  "Hotel",
  "Kantor",
  "Event",
  "Tempat Wisata",
  "Fasilitas Publik",
];

export default async function LandingPage() {
  const [user, stats] = await Promise.all([getSessionUser(), getPublicStats()]);
  const authedHome = user ? "/dashboard" : null;

  return (
    <div className="min-h-screen bg-white">
      {/* ============ NAV ============ */}
      <header className="absolute inset-x-0 top-0 z-20">
        <nav className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo dark />
          <div className="hidden items-center gap-7 text-sm font-medium text-slate-300 md:flex">
            <a href="#cara-kerja" className="transition hover:text-white">
              Cara Kerja
            </a>
            <a href="#fitur" className="transition hover:text-white">
              Fitur
            </a>
            <a href="#untuk-siapa" className="transition hover:text-white">
              Untuk Siapa
            </a>
          </div>
          <div className="flex items-center gap-2.5">
            {authedHome ? (
              <Link
                href={authedHome}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-ink-950 shadow-sm transition hover:bg-brand-50"
              >
                Buka Dashboard
                <ArrowRight className="size-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-white/85 transition hover:text-white"
                >
                  Masuk
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink-950 shadow-sm transition hover:bg-brand-50"
                >
                  Daftar Gratis
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* ============ HERO ============ */}
      <section className="grain relative overflow-hidden bg-ink-950">
        <div className="hero-grid absolute inset-0" />
        <div
          className="absolute -top-32 -left-40 size-[540px] rounded-full opacity-20 blur-3xl"
          style={{
            background: "radial-gradient(circle, #2398a1 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -right-52 top-40 size-[480px] rounded-full opacity-[0.13] blur-3xl"
          style={{
            background: "radial-gradient(circle, #fbbf24 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-32 pb-16 sm:px-6 sm:pt-40 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-24">
          {/* Copy */}
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2.5 text-[13px] font-semibold tracking-wide text-brand-300">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand-400" />
              </span>
              Platform lost &amp; found bertenaga AI
            </p>
            <h1 className="font-display mt-5 text-5xl leading-[1.02] font-bold tracking-tight text-white sm:text-[72px]">
              Yang hilang,
              <br />
              bisa <Scribble>ditemuin</Scribble>
              <span className="text-amber-400">.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">
              AI mencocokkan laporan kehilangan dengan laporan penemuan — dari
              deskripsi, lokasi, waktu, dan foto — lalu memverifikasi
              kepemilikan sebelum barang berpindah tangan.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href={user ? "/report/lost" : "/register"}
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 text-[15px] font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-400"
              >
                <PackageSearch className="size-5" />
                Laporkan Barang Hilang
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href={user ? "/report/found" : "/register"}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white/10 px-6 text-[15px] font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/15"
              >
                <HandHeart className="size-5" />
                Saya Menemukan Barang
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-slate-400">
              {["100% gratis", "Tanpa foto pun bisa", "Privasi terjaga"].map(
                (t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-brand-400" />
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Komposisi kartu produk */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div
              className="animate-fade-up relative z-10 -rotate-1 rounded-2xl bg-white p-5 pb-9 shadow-2xl shadow-black/40 ring-1 ring-white/10"
              style={{ animationDelay: "0.12s" }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold tracking-widest text-brand-700 uppercase">
                  Potential Match
                </p>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                  HIGH MATCH
                </span>
              </div>
              <div className="mt-4 flex items-center gap-5">
                <div className="shrink-0 text-center">
                  <p className="font-display text-5xl font-bold tracking-tight text-slate-900">
                    93<span className="text-2xl text-slate-400">%</span>
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Dompet Eiger Hitam
                  </p>
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  {[
                    ["Deskripsi", "94%", 94],
                    ["Lokasi", "±180 m", 89],
                    ["Waktu", "20 menit", 96],
                    ["Ciri khusus", "Cocok", 100],
                  ].map(([k, v, w]) => (
                    <div key={k as string}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">{k}</span>
                        <span className="font-semibold text-slate-800">
                          {v}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${w}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
                Ciri khusus cocok: “gantungan huruf A” — AI menemukan kandidat,
                verifikasi yang memastikan.
              </p>
            </div>

            {/* Notifikasi mengambang */}
            <div
              className="animate-fade-up absolute -top-9 right-0 z-20 rotate-2 sm:-right-4"
              style={{ animationDelay: "0.35s" }}
            >
              <div className="flex items-center gap-2.5 rounded-xl bg-ink-800/95 py-2.5 pr-4 pl-3 shadow-xl shadow-black/30 ring-1 ring-white/15 backdrop-blur">
                <span className="flex size-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300">
                  <Bell className="size-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-white">
                    Potential match found!
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Kecocokan 93% · baru saja
                  </p>
                </div>
              </div>
            </div>

            {/* Chip verifikasi mengambang */}
            <div
              className="animate-fade-up absolute -bottom-6 left-2 z-20 -rotate-2 sm:-left-6"
              style={{ animationDelay: "0.55s" }}
            >
              <div className="flex items-center gap-2 rounded-xl bg-white py-2.5 pr-4 pl-3 shadow-xl shadow-black/25 ring-1 ring-slate-200">
                <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="size-4" />
                </span>
                <p className="text-xs font-semibold text-slate-800">
                  Verifikasi kepemilikan{" "}
                  <span className="text-emerald-600">disetujui ✓</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Marquee kategori barang */}
        <div className="relative border-t border-white/[0.07] py-5">
          <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <div className="marquee-track animate-marquee flex w-max items-center gap-10 pr-10">
              {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
                <span
                  key={`${item.label}-${i}`}
                  className="inline-flex items-center gap-2.5 text-sm font-medium whitespace-nowrap text-slate-400"
                >
                  <item.icon className="size-4 text-brand-400/80" />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ STATS ============ */}
      {stats && stats.reports > 0 && (
        <section className="border-b border-slate-100 bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-slate-100 px-4 py-10 sm:px-6 lg:grid-cols-4">
            {[
              { label: "Laporan masuk", value: stats.reports.toLocaleString("id-ID") },
              { label: "AI matches", value: stats.matches.toLocaleString("id-ID") },
              { label: "Barang kembali", value: stats.returned.toLocaleString("id-ID") },
              {
                label: "Tingkat keberhasilan",
                value: stats.rate === null ? "—" : `${stats.rate.toFixed(1)}%`,
              },
            ].map((s) => (
              <div key={s.label} className="px-6 first:pl-0 last:pr-0">
                <p className="font-display text-4xl font-bold tracking-tight text-slate-900">
                  {s.value}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-400">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============ CARA KERJA ============ */}
      <section id="cara-kerja" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-brand-600">
              01 — Cara kerja
            </p>
            <h2 className="font-display mt-3 max-w-md text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Empat langkah dari hilang sampai kembali
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-slate-500">
            Laporan langsung tersimpan — analisis AI dan pencarian match
            berjalan otomatis di belakang layar.
          </p>
        </div>

        <div className="relative mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="step-connector absolute top-6 right-[12%] left-[12%] hidden h-0.5 lg:block" />
          {HOW_STEPS.map((step, i) => (
            <div key={step.title} className={i % 2 === 1 ? "lg:mt-10" : ""}>
              <div className="relative z-10 inline-flex size-12 items-center justify-center rounded-2xl bg-ink-950 text-white shadow-lg shadow-ink-950/20">
                <step.icon className="size-5" />
              </div>
              <p className="font-display mt-5 text-sm font-bold text-brand-600">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ FITUR (BENTO) ============ */}
      <section id="fitur" className="scroll-mt-24 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="text-sm font-semibold text-brand-600">02 — Fitur</p>
          <h2 className="font-display mt-3 max-w-xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Bukan papan pengumuman — sistem pencocokan yang bisa dijelaskan
          </h2>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {/* Explainable score — kartu besar */}
            <div className="rounded-3xl bg-white p-7 ring-1 ring-slate-200/70 shadow-soft lg:col-span-2">
              <div className="grid items-center gap-8 sm:grid-cols-[1fr_240px]">
                <div>
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <ScanSearch className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold tracking-tight text-slate-900">
                    Explainable Match Score
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    Skor akhir dihitung deterministik dari 7 komponen berbobot —
                    bukan black box. Setiap match bisa dijelaskan: komponen apa
                    yang cocok dan berapa kontribusinya.
                  </p>
                </div>
                <div className="space-y-2">
                  {SCORE_WEIGHTS.map((s) => (
                    <div key={s.label} className="flex items-center gap-2.5">
                      <span className="w-32 shrink-0 truncate text-[11px] font-medium text-slate-500">
                        {s.label}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${(s.w / 30) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-[11px] font-bold text-slate-700">
                        {s.w}
                      </span>
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] text-slate-400">
                    +15 bobot foto — dinormalisasi bila tak tersedia
                  </p>
                </div>
              </div>
            </div>

            {/* Privasi — kartu tinggi */}
            <div className="flex flex-col rounded-3xl bg-ink-950 p-7 text-white lg:row-span-2">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white/10 text-brand-300">
                <Lock className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold tracking-tight">
                Privasi by design
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Info verifikasi dari penemu tidak pernah ditampilkan ke siapa
                pun — dipakai diam-diam untuk menguji klaim. Foto disajikan
                lewat signed URL, bukan link publik.
              </p>
              <div className="mt-auto space-y-3 pt-8">
                <div className="rounded-xl bg-white/[0.06] p-3.5 ring-1 ring-white/10">
                  <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
                    private_verification_info
                  </p>
                  <p className="mt-1.5 text-sm tracking-[0.28em] text-slate-300 select-none">
                    ••••••••••••••••
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/[0.06] p-3.5 ring-1 ring-white/10">
                  <MessageSquareLock className="size-4 shrink-0 text-brand-300" />
                  <p className="text-xs leading-relaxed text-slate-300">
                    Chat hanya terbuka setelah klaim disetujui penemu
                  </p>
                </div>
              </div>
            </div>

            {/* Tanpa foto */}
            <div className="rounded-3xl bg-white p-7 ring-1 ring-slate-200/70 shadow-soft">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <ImageOff className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold tracking-tight text-slate-900">
                Tanpa foto tetap jalan
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Kehilangan barang tanpa sempat memotretnya? Bobot skor
                dinormalisasi ulang — pengguna tanpa foto tidak dirugikan.
              </p>
            </div>

            {/* Verifikasi */}
            <div className="rounded-3xl bg-white p-7 ring-1 ring-slate-200/70 shadow-soft">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <ShieldCheck className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold tracking-tight text-slate-900">
                Verifikasi kepemilikan
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Lima pertanyaan yang hanya bisa dijawab pemilik asli. AI menilai
                jawabannya — keputusan akhir tetap di tangan penemu.
              </p>
            </div>

            {/* Perjalanan status — full width */}
            <div className="rounded-3xl bg-white p-7 ring-1 ring-slate-200/70 shadow-soft lg:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-900">
                    Setiap laporan punya perjalanan yang jelas
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Timeline status transparan untuk kedua belah pihak — dari
                    aktif sampai barang kembali.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {STATUS_JOURNEY.map((s, i) => (
                    <span key={s} className="flex items-center gap-2">
                      <span
                        className={
                          i === STATUS_JOURNEY.length - 1
                            ? "rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200"
                            : "rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
                        }
                      >
                        {s}
                      </span>
                      {i < STATUS_JOURNEY.length - 1 && (
                        <ArrowRight className="size-3 text-slate-300" />
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ UNTUK SIAPA ============ */}
      <section
        id="untuk-siapa"
        className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24"
      >
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-brand-600">
              03 — Untuk siapa
            </p>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Dirancang untuk ruang publik mana pun
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-500">
              Dari kampus hingga bandara — Temuin membantu pengelola tempat dan
              masyarakat mempertemukan kembali barang dengan pemiliknya, tanpa
              memajang informasi sensitif secara publik.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {PLACES.map((place) => (
              <span
                key={place}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-brand-700 hover:ring-brand-300"
              >
                <MapPin className="size-3.5 text-brand-500/70" />
                {place}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA + FOOTER ============ */}
      <section className="grain relative overflow-hidden bg-ink-950">
        <div className="hero-grid absolute inset-0" />
        <div className="relative mx-auto max-w-4xl px-4 pt-24 pb-20 text-center sm:px-6">
          <LogoMark className="mx-auto size-14" />
          <h2 className="font-display mx-auto mt-8 max-w-2xl text-4xl leading-[1.05] font-bold tracking-tight text-white sm:text-6xl">
            Barang hilang bukan <Scribble>akhir cerita</Scribble>
            <span className="text-amber-400">.</span>
          </h2>
          <p className="mt-5 text-base text-slate-400 sm:text-lg">
            Bergabung gratis — biarkan AI Temuin yang mencarikan.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={user ? "/dashboard" : "/register"}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 px-8 text-[15px] font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-400"
            >
              Mulai Sekarang
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#cara-kerja"
              className="inline-flex h-12 items-center justify-center rounded-xl px-6 text-[15px] font-semibold text-slate-300 transition hover:text-white"
            >
              Lihat cara kerja
            </a>
          </div>
        </div>

        <footer className="relative pb-10">
          <div className="mx-auto max-w-6xl border-t border-white/10 px-4 pt-8 sm:px-6">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <Logo dark markClassName="size-7" textClassName="text-base" />
              <div className="flex items-center gap-6 text-xs font-medium text-slate-500">
                <a href="#cara-kerja" className="transition hover:text-slate-300">
                  Cara Kerja
                </a>
                <a href="#fitur" className="transition hover:text-slate-300">
                  Fitur
                </a>
                <Link href="/login" className="transition hover:text-slate-300">
                  Masuk
                </Link>
              </div>
              <p className="text-xs text-slate-500">
                © 2026 Temuin — dibuat untuk CREATHON 2026.
              </p>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
