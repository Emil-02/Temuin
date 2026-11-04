import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Clock,
  EyeOff,
  HelpCircle,
  Lock,
  MessageCircle,
  Minus,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getClaimForUser } from "@/lib/claims";
import {
  buildVerificationQuestions,
  verificationRecommendation,
} from "@/lib/verification";
import type { ClaimStatus, VerificationCheck } from "@/lib/types";
import { aiSourceLabel } from "@/lib/constants";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Badge,
  ButtonLink,
  Card,
  ClaimStatusBadge,
  PageHeader,
  ScoreRing,
} from "@/components/ui";
import {
  CompleteClaimButton,
  FinderDecisionPanel,
  MarkHandoverButton,
  VerificationForm,
} from "@/components/claim-panels";

export const metadata: Metadata = { title: "Detail Klaim" };

const CLAIM_PIPELINE: ClaimStatus[] = [
  "SUBMITTED",
  "UNDER_VERIFICATION",
  "APPROVED",
  "HANDOVER",
  "COMPLETED",
];

function ClaimStepper({ status }: { status: ClaimStatus }) {
  if (status === "REJECTED") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
        <XCircle className="size-4.5" />
        Klaim ditolak oleh penemu
      </div>
    );
  }
  const idx = CLAIM_PIPELINE.indexOf(status);
  return (
    <ol className="flex items-center gap-1">
      {CLAIM_PIPELINE.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-center">
            <div
              className={cn(
                "h-0.5 flex-1",
                i === 0
                  ? "bg-transparent"
                  : i <= idx
                    ? "bg-brand-500"
                    : "bg-slate-200",
              )}
            />
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-2",
                i < idx
                  ? "bg-brand-600 text-white ring-brand-600"
                  : i === idx
                    ? "bg-white text-brand-700 ring-brand-600"
                    : "bg-white text-slate-300 ring-slate-200",
              )}
            >
              {i < idx ? <Check className="size-3" /> : i + 1}
            </span>
            <div
              className={cn(
                "h-0.5 flex-1",
                i === CLAIM_PIPELINE.length - 1
                  ? "bg-transparent"
                  : i < idx
                    ? "bg-brand-500"
                    : "bg-slate-200",
              )}
            />
          </div>
          <span
            className={cn(
              "text-center text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]",
              i === idx
                ? "text-brand-700"
                : i < idx
                  ? "text-slate-600"
                  : "text-slate-300",
            )}
          >
            {s.replace("_", " ")}
          </span>
        </li>
      ))}
    </ol>
  );
}

function verdictIcon(verdict: VerificationCheck["verdict"]) {
  switch (verdict) {
    case "match":
      return <Check className="size-3.5 text-emerald-600" />;
    case "partial":
      return <HelpCircle className="size-3.5 text-amber-500" />;
    case "no_match":
      return <X className="size-3.5 text-rose-500" />;
    default:
      return <Minus className="size-3.5 text-slate-400" />;
  }
}

const VERDICT_LABEL: Record<VerificationCheck["verdict"], string> = {
  match: "Cocok",
  partial: "Sebagian cocok",
  no_match: "Tidak cocok",
  unknown: "Tidak dapat dinilai",
};

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const ctx = await getClaimForUser(id, user.id);
  if (!ctx) notFound();
  const {
    claim,
    lost,
    found,
    isClaimant,
    isFinder,
    verification,
    conversation,
  } = ctx;

  const questions = buildVerificationQuestions(found);
  const score =
    claim.verification_score !== null ? Number(claim.verification_score) : null;
  const recommendation =
    score !== null ? verificationRecommendation(score) : null;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Ownership Verification"
        description={
          isClaimant
            ? `Klaim Anda atas "${lost.item_name}"`
            : `Klaim atas barang temuan Anda: "${found.item_name}"`
        }
        action={<ClaimStatusBadge status={claim.status} />}
      />

      <Card className="p-5 sm:p-6">
        <ClaimStepper status={claim.status} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ==== Tahap 1: claimant menjawab pertanyaan ==== */}
          {claim.status === "SUBMITTED" && isClaimant && (
            <Card className="p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-slate-900 uppercase">
                <ShieldCheck className="size-4 text-brand-500" />
                Verifikasi Kepemilikan
              </h2>
              <p className="mt-1 mb-5 text-xs leading-relaxed text-slate-500">
                Jawab beberapa pertanyaan untuk membantu memastikan bahwa
                barang ini benar-benar milikmu. Jawabanmu hanya digunakan
                untuk proses verifikasi.
              </p>
              <VerificationForm claimId={claim.id} questions={questions} />
            </Card>
          )}

          {claim.status === "SUBMITTED" && isFinder && (
            <Card className="p-6 text-center">
              <Clock className="mx-auto size-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">
                Menunggu pengklaim mengisi verifikasi
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Anda akan menerima notifikasi begitu jawaban siap ditinjau.
              </p>
            </Card>
          )}

          {/* ==== Hasil verifikasi ==== */}
          {verification && verification.checks.length > 0 && (
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold tracking-wide text-slate-900 uppercase">
                  Hasil Verifikasi
                </h2>
                <Badge className="bg-slate-100 text-slate-500 ring-slate-200">
                  dievaluasi{" "}
                  {aiSourceLabel(verification.evaluated_by)}
                </Badge>
              </div>

              <ul className="mt-4 divide-y divide-slate-100">
                {verification.checks.map((check) => (
                  <li key={check.key} className="flex items-start gap-3 py-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
                        check.verdict === "match"
                          ? "bg-emerald-50 ring-emerald-200"
                          : check.verdict === "partial"
                            ? "bg-amber-50 ring-amber-200"
                            : check.verdict === "no_match"
                              ? "bg-rose-50 ring-rose-200"
                              : "bg-slate-50 ring-slate-200",
                      )}
                    >
                      {verdictIcon(check.verdict)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          {check.label}
                        </p>
                        <p className="shrink-0 text-xs font-semibold text-slate-500">
                          {VERDICT_LABEL[check.verdict]}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {check.note}
                      </p>
                      {isFinder && verification.answers[check.key] && (
                        <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-100">
                          Jawaban pengklaim: “{verification.answers[check.key]}”
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {isClaimant && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500 ring-1 ring-slate-100">
                  <EyeOff className="mt-0.5 size-3.5 shrink-0" />
                  Detail pembanding dari penemu disembunyikan demi mencegah
                  kebocoran informasi.
                </p>
              )}
            </Card>
          )}

          {/* ==== Info verifikasi privat penemu (hanya finder) ==== */}
          {isFinder && (
            <Card className="border-l-4 border-l-amber-400 p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Lock className="size-4 text-amber-500" />
                Info Verifikasi Privat Anda
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {found.private_verification_info}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Bandingkan dengan jawaban pengklaim di atas sebelum memutuskan.
              </p>
            </Card>
          )}

          {/* ==== Selesai / ditolak ==== */}
          {claim.status === "COMPLETED" && (
            <Card className="bg-emerald-50/70 p-6 text-center ring-emerald-200">
              <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
              <h3 className="mt-3 text-lg font-bold text-emerald-900">
                Barang Telah Kembali!
              </h3>
              <p className="mt-1 text-sm text-emerald-700">
                Klaim selesai dan status laporan menjadi RETURNED. Terima kasih
                telah menggunakan Temuin.
              </p>
            </Card>
          )}
          {claim.status === "REJECTED" && (
            <Card className="bg-rose-50/60 p-6 ring-rose-200">
              <h3 className="text-sm font-bold text-rose-900">Klaim Ditolak</h3>
              <p className="mt-1 text-sm text-rose-700">
                {claim.finder_note
                  ? `Catatan penemu: ${claim.finder_note}`
                  : "Penemu menilai bukti kepemilikan belum meyakinkan."}
              </p>
              {isClaimant && (
                <p className="mt-2 text-xs leading-relaxed text-rose-600">
                  Klaim ini telah ditolak dan tidak dapat diajukan ulang pada
                  match yang sama (perlindungan anti penyalahgunaan). Jika Anda
                  yakin terjadi kesalahan, buat laporan kehilangan baru dengan
                  detail dan ciri khusus yang lebih lengkap — sistem akan
                  mencocokkannya kembali secara otomatis.
                </p>
              )}
            </Card>
          )}
        </div>

        {/* ==== Kolom kanan ==== */}
        <div className="space-y-4">
          {score !== null && (
            <Card className="p-5 text-center">
              <h3 className="mb-3 text-sm font-bold tracking-wide text-slate-900 uppercase">
                Verification Score
              </h3>
              <ScoreRing
                score={score}
                size={110}
                strokeWidth={9}
                className="mx-auto"
              />
              {recommendation && (
                <p
                  className={cn(
                    "mx-auto mt-3 w-fit rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset",
                    recommendation.className,
                  )}
                >
                  {recommendation.label}
                </p>
              )}
              {isFinder && recommendation && (
                <p className="mt-2 text-xs text-slate-500">
                  {recommendation.hint}
                </p>
              )}
            </Card>
          )}

          {/* Keputusan penemu */}
          {isFinder && claim.status === "UNDER_VERIFICATION" && (
            <FinderDecisionPanel claimId={claim.id} />
          )}

          {/* Secure communication */}
          {["APPROVED", "HANDOVER", "COMPLETED"].includes(claim.status) &&
            conversation && (
              <Card className="p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold tracking-wide text-slate-900 uppercase">
                  <MessageCircle className="size-4 text-brand-500" />
                  Secure Communication
                </h3>
                <p className="mt-1 mb-3 text-xs leading-relaxed text-slate-500">
                  Atur waktu & tempat serah terima lewat chat aman — tanpa
                  bertukar nomor pribadi.
                </p>
                <ButtonLink
                  href={`/messages/${conversation.id}`}
                  className="w-full"
                  size="md"
                >
                  Buka Chat
                </ButtonLink>
              </Card>
            )}

          {/* Aksi tahap handover */}
          {claim.status === "APPROVED" && (
            <div className="space-y-2">
              <MarkHandoverButton claimId={claim.id} />
              {isFinder && <CompleteClaimButton claimId={claim.id} />}
            </div>
          )}
          {claim.status === "HANDOVER" && isFinder && (
            <CompleteClaimButton claimId={claim.id} />
          )}
          {["APPROVED", "HANDOVER"].includes(claim.status) && isClaimant && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-100">
              Setelah barang diterima, penemu akan mengonfirmasi penyerahan dan
              status berubah menjadi RETURNED.
            </p>
          )}

          {/* Konteks match */}
          <Card className="bg-slate-50/70 p-5">
            <h3 className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-500 uppercase">
              <Sparkles className="size-3.5" />
              Konteks
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Klaim ini berasal dari potential match dengan skor{" "}
              <strong>{Math.round(ctx.match.final_score)}%</strong>.
            </p>
            <Link
              href={`/matches/${claim.match_id}`}
              className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Lihat detail match →
            </Link>
            <p className="mt-3 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
              Diajukan {formatDateTime(claim.created_at)}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
