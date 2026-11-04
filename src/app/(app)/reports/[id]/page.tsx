import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Bot,
  Calendar,
  Eye,
  EyeOff,
  MapPin,
  Palette,
  ShieldAlert,
  Sparkles,
  Tag,
} from "lucide-react";
import { getProfile, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getAnalysis,
  getFoundReport,
  getLostReport,
  getStatusHistory,
} from "@/lib/reports";
import type { FoundReport, LostReport, Match, ReportType } from "@/lib/types";
import {
  aiSourceLabel,
  categoryLabel,
  MATCH_LEVEL_META,
} from "@/lib/constants";
import { cn, formatDate, formatTime } from "@/lib/utils";
import {
  Badge,
  Card,
  DemoBadge,
  MatchLevelBadge,
  ReportStatusBadge,
} from "@/components/ui";
import { StatusTimeline } from "@/components/status-timeline";
import { CloseReportButton, RetryAiButton } from "@/components/report-actions";

export const metadata: Metadata = { title: "Detail Laporan" };

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
          {label}
        </p>
        <p className="text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  );
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; created?: string; imgfail?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { t, created, imgfail } = await searchParams;

  // Temukan laporan: coba sesuai hint tipe, lalu tabel satunya.
  let type: ReportType = t === "found" ? "FOUND" : "LOST";
  let report: LostReport | FoundReport | null =
    type === "LOST" ? await getLostReport(id) : await getFoundReport(id);
  if (!report) {
    type = type === "LOST" ? "FOUND" : "LOST";
    report =
      type === "LOST" ? await getLostReport(id) : await getFoundReport(id);
  }
  if (!report) notFound();

  // Ownership check: hanya pemilik laporan / admin.
  if (report.user_id !== user.id) {
    const profile = await getProfile(user.id);
    if (profile?.role !== "admin") notFound();
  }

  const [analysis, history, matchesResult] = await Promise.all([
    getAnalysis(type, report.id),
    getStatusHistory(type, report.id),
    supabaseAdmin()
      .from("matches")
      .select("*")
      .eq(type === "LOST" ? "lost_report_id" : "found_report_id", report.id)
      .order("final_score", { ascending: false }),
  ]);
  const matches = (matchesResult.data ?? []) as Match[];

  const isLost = type === "LOST";
  const date = isLost
    ? (report as LostReport).lost_date
    : (report as FoundReport).found_date;
  const time = isLost
    ? (report as LostReport).lost_time
    : (report as FoundReport).found_time;
  const extraction = analysis?.extraction;

  return (
    <div className="space-y-6 animate-fade-up">
      {created && (
        <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-600" />
          <div className="text-sm text-brand-900">
            <p className="font-semibold">Laporan berhasil dibuat!</p>
            <p className="mt-0.5 text-brand-700">
              {matches.length > 0
                ? `AI Temuin menemukan ${matches.length} potential match. Lihat daftarnya di bawah.`
                : analysis?.status === "PENDING" || !analysis
                  ? "AI Temuin sedang menganalisis laporan Anda di latar belakang. Muat ulang halaman ini sebentar lagi — Anda juga akan menerima notifikasi begitu ada laporan yang cocok."
                  : "AI Temuin sudah menganalisis laporan Anda. Belum ada kecocokan saat ini — Anda akan menerima notifikasi begitu ada laporan yang cocok."}
              {imgfail &&
                " (Catatan: upload foto gagal — laporan tetap tersimpan tanpa foto.)"}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                isLost
                  ? "bg-brand-50 text-brand-700 ring-brand-200"
                  : "bg-amber-50 text-amber-700 ring-amber-200"
              }
            >
              {isLost ? "BARANG HILANG" : "BARANG DITEMUKAN"}
            </Badge>
            <ReportStatusBadge status={report.status} type={type} />
            {report.is_demo && <DemoBadge />}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {report.item_name}
          </h1>
        </div>
        <div className="flex gap-2">
          <RetryAiButton type={type} reportId={report.id} />
          {report.status !== "RETURNED" && report.status !== "CLOSED" && (
            <CloseReportButton type={type} reportId={report.id} />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Info utama */}
          <Card className="p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <MetaItem
                icon={<Tag className="size-4" />}
                label="Kategori"
                value={categoryLabel(report.category)}
              />
              <MetaItem
                icon={<Palette className="size-4" />}
                label="Warna"
                value={report.color ?? "-"}
              />
              <MetaItem
                icon={<MapPin className="size-4" />}
                label={isLost ? "Lokasi terakhir" : "Lokasi ditemukan"}
                value={report.location_name}
              />
              <MetaItem
                icon={<Calendar className="size-4" />}
                label="Waktu"
                value={`${formatDate(date)}${time ? `, ${formatTime(time)}` : ""}`}
              />
            </div>

            <div className="mt-5 border-t border-slate-100 pt-5">
              <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                Deskripsi
              </p>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-700">
                {report.description}
              </p>
            </div>

            {(report.brand ||
              report.model ||
              report.material ||
              report.unique_features) && (
              <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                {report.brand && (
                  <MetaItem
                    icon={<Tag className="size-4" />}
                    label="Brand"
                    value={report.brand}
                  />
                )}
                {report.model && (
                  <MetaItem
                    icon={<Tag className="size-4" />}
                    label="Model"
                    value={report.model}
                  />
                )}
                {report.material && (
                  <MetaItem
                    icon={<Tag className="size-4" />}
                    label="Material"
                    value={report.material}
                  />
                )}
                {report.unique_features && (
                  <MetaItem
                    icon={<Sparkles className="size-4" />}
                    label="Ciri khusus"
                    value={report.unique_features}
                  />
                )}
              </div>
            )}

            {report.image_url && (
              <div className="mt-5 border-t border-slate-100 pt-5">
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                  Foto
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/images?type=${type.toLowerCase()}&id=${report.id}`}
                  alt={`Foto ${report.item_name}`}
                  className="max-h-72 rounded-xl object-cover ring-1 ring-slate-200"
                />
              </div>
            )}
          </Card>

          {/* Info verifikasi privat — hanya pemilik laporan found */}
          {!isLost && (
            <Card className="border-l-4 border-l-amber-400 p-5">
              <div className="flex items-start gap-3">
                <EyeOff className="mt-0.5 size-4.5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Info Verifikasi Privat
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {(report as FoundReport).private_verification_info}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    <ShieldAlert className="mr-1 inline size-3" />
                    Hanya Anda yang bisa melihat ini. Sistem memakainya untuk
                    menguji jawaban pengklaim.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Potential matches */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-slate-900 uppercase">
                <Sparkles className="size-4 text-brand-500" />
                Potential Matches ({matches.length})
              </h2>
            </div>
            {matches.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Belum ada kecocokan. Matching berjalan otomatis setiap ada
                laporan baru — Anda akan diberi tahu lewat notifikasi.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/matches/${m.id}`}
                      className="group flex items-center gap-4 py-3.5"
                    >
                      <span
                        className={cn(
                          "flex size-12 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white",
                          MATCH_LEVEL_META[m.match_level].barClass,
                        )}
                      >
                        {Math.round(m.final_score)}%
                      </span>
                      <div className="min-w-0 flex-1">
                        <MatchLevelBadge level={m.match_level} />
                        <p className="mt-1 truncate text-xs text-slate-500">
                          Dibuat {formatDate(m.created_at)} — klik untuk melihat
                          explainable match score
                        </p>
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* AI analysis */}
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-slate-900 uppercase">
              <Bot className="size-4 text-brand-500" />
              AI Analysis
            </h2>
            {!analysis || analysis.status === "PENDING" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-brand-500" />
                  </span>
                  AI sedang mencari kemungkinan kecocokan…
                </div>
                <ul className="space-y-1.5 text-xs text-slate-500">
                  <li>· Menganalisis deskripsi barang</li>
                  <li>· Membandingkan karakteristik dengan laporan lain</li>
                  <li>· Memeriksa lokasi dan waktu</li>
                </ul>
                <p className="text-xs text-slate-400">
                  Muat ulang halaman ini sebentar lagi untuk melihat hasilnya.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    className={
                      analysis.status === "COMPLETED"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : analysis.status === "FAILED"
                          ? "bg-rose-50 text-rose-700 ring-rose-200"
                          : "bg-amber-50 text-amber-700 ring-amber-200"
                    }
                  >
                    {analysis.status === "COMPLETED"
                      ? "Analisis lengkap"
                      : analysis.status === "FAILED"
                        ? "AI gagal — pakai fallback"
                        : "Sebagian (fallback)"}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-500 ring-slate-200">
                    {aiSourceLabel(analysis.source)}
                  </Badge>
                </div>

                {extraction && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                      Atribut terdeteksi
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        extraction.item_type,
                        extraction.color,
                        extraction.color_secondary,
                        extraction.brand,
                        extraction.material,
                        ...extraction.unique_features,
                      ]
                        .filter(Boolean)
                        .map((attr, i) => (
                          <span
                            key={`${attr}-${i}`}
                            className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
                          >
                            {attr}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {analysis.image_analysis?.description && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                      <Eye className="mr-1 inline size-3" />
                      Analisis foto
                    </p>
                    <p className="text-xs leading-relaxed text-slate-600">
                      {analysis.image_analysis.description}
                    </p>
                  </div>
                )}

                {analysis.embedding ? (
                  <p className="text-[11px] text-slate-400">
                    ✓ Embedding semantik aktif ({analysis.embedding.length}{" "}
                    dimensi)
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Embedding semantik tidak tersedia — matching memakai
                    heuristik teks.
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Timeline */}
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-bold tracking-wide text-slate-900 uppercase">
              Status Tracking
            </h2>
            <StatusTimeline
              type={type}
              current={report.status}
              history={history}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
