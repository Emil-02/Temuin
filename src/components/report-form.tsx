"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  Camera,
  ImageUp,
  Loader2,
  LocateFixed,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  FieldError,
  Help,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import {
  ALLOWED_IMAGE_TYPES,
  CATEGORIES,
  MAX_IMAGE_BYTES,
} from "@/lib/constants";
import { analyzeItemPhotoAction } from "@/lib/actions/ai";
import type { PhotoFormDraft } from "@/lib/ai";
import { compressImage } from "@/lib/image-compress";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

type ReportAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

const ITEM_FIELDS = [
  "item_name",
  "category",
  "color",
  "brand",
  "model",
  "material",
  "description",
  "unique_features",
] as const;
type ItemField = (typeof ITEM_FIELDS)[number];
type ItemValues = Record<ItemField, string>;

const EMPTY_VALUES: ItemValues = {
  item_name: "",
  category: "",
  color: "",
  brand: "",
  model: "",
  material: "",
  description: "",
  unique_features: "",
};

function draftValue(draft: PhotoFormDraft, key: ItemField): string {
  if (key === "unique_features") return draft.unique_features.join(", ");
  return draft[key] ?? "";
}

function AiTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-brand-700 ring-1 ring-brand-200">
      <Sparkles className="size-2.5" />
      AI
    </span>
  );
}

type AiStatus =
  | { kind: "analyzing" }
  | { kind: "done" }
  | { kind: "error"; message: string }
  | null;

export function ReportForm({
  type,
  action,
}: {
  type: "LOST" | "FOUND";
  action: ReportAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>(null);
  const [item, setItem] = useState<{
    values: ItemValues;
    aiKeys: ReadonlySet<ItemField>;
  }>({ values: EMPTY_VALUES, aiKeys: new Set() });
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locating, setLocating] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const analysisToken = useRef(0);

  const isLost = type === "LOST";
  const err = state?.fieldErrors ?? {};
  const analyzing = aiStatus?.kind === "analyzing";
  const [slowAi, setSlowAi] = useState(false);
  const imageError = photoError ?? err.image;

  useEffect(() => {
    if (state && !state.ok) {
      if (state.error) toast.error(state.error);
      else if (state.fieldErrors)
        toast.error("Periksa kembali isian formulir.");
    }
  }, [state]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Server AI kampus bisa butuh 1-2 menit saat model baru dimuat.
  useEffect(() => {
    if (!analyzing) return;
    const timer = setTimeout(() => setSlowAi(true), 8000);
    return () => {
      clearTimeout(timer);
      setSlowAi(false);
    };
  }, [analyzing]);

  function setField(key: ItemField, value: string) {
    setItem((prev) => {
      const aiKeys = new Set(prev.aiKeys);
      aiKeys.delete(key);
      return { values: { ...prev.values, [key]: value }, aiKeys };
    });
  }

  /** Isi kolom dari hasil AI: hanya menimpa kolom kosong atau yang sebelumnya
   *  diisi AI — isian yang sudah diedit user tidak pernah ditimpa. */
  function applyDraft(draft: PhotoFormDraft) {
    setItem((prev) => {
      const values = { ...prev.values };
      const aiKeys = new Set(prev.aiKeys);
      for (const key of ITEM_FIELDS) {
        const editable = values[key].trim() === "" || aiKeys.has(key);
        if (!editable) continue;
        const next = draftValue(draft, key);
        values[key] = next;
        if (next) {
          aiKeys.add(key);
        } else {
          aiKeys.delete(key);
        }
      }
      return { values, aiKeys };
    });
  }

  async function runAnalysis(file: File) {
    const token = ++analysisToken.current;
    setAiStatus({ kind: "analyzing" });
    const fd = new FormData();
    fd.set("image", file);
    let result: Awaited<ReturnType<typeof analyzeItemPhotoAction>>;
    try {
      result = await analyzeItemPhotoAction(fd);
    } catch {
      result = {
        ok: false,
        error: "Koneksi bermasalah saat menganalisis foto. Coba lagi.",
      };
    }
    if (token !== analysisToken.current) return; // foto sudah diganti
    if (!result.ok) {
      setAiStatus({ kind: "error", message: result.error });
      return;
    }
    applyDraft(result.draft);
    setAiStatus({ kind: "done" });
    toast.success("AI sudah mengisi ciri barang. Periksa kembali, ya!");
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    e.target.value = "";
    if (!original) return;
    if (!original.type.startsWith("image/")) {
      toast.error("File harus berupa foto.");
      return;
    }

    setPhotoError(null);
    setPreparing(true);
    const file = await compressImage(original);
    setPreparing(false);

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setPhotoError("Format foto harus JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setPhotoError("Ukuran foto maksimal 5MB.");
      return;
    }

    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    void runAnalysis(file);
  }

  function clearFile() {
    analysisToken.current++;
    setPhoto(null);
    setPreview(null);
    setAiStatus(null);
  }

  // Submit manual (bukan <form action>) agar React tidak me-reset isian form
  // ketika server mengembalikan error validasi.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isLost && !photo) {
      setPhotoError("Foto barang wajib untuk laporan penemuan.");
      toast.error("Tambahkan foto barang yang Anda temukan.");
      document
        .getElementById("photo-card")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const formData = new FormData(e.currentTarget);
    formData.delete("image");
    if (photo) formData.set("image", photo);
    startTransition(() => formAction(formData));
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Browser tidak mendukung geolocation.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("Koordinat lokasi ditambahkan.");
      },
      () => {
        setLocating(false);
        toast.error(
          "Tidak bisa mengambil lokasi. Isi nama lokasi saja — itu sudah cukup.",
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const v = item.values;
  const aiClass = (key: ItemField) =>
    item.aiKeys.has(key) ? "bg-brand-50/40 ring-brand-300" : undefined;

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-5">
      <Card
        className={cn(
          "p-5 sm:p-6",
          imageError && "ring-2 ring-rose-300",
        )}
      >
        <div id="photo-card" className="mb-4">
          <h2 className="text-sm font-bold tracking-wide text-slate-900 uppercase">
            Foto Barang{" "}
            {isLost ? (
              <span className="text-xs font-normal tracking-normal text-slate-400 normal-case">
                (opsional)
              </span>
            ) : (
              <span className="text-rose-500">*</span>
            )}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            <Sparkles className="mr-1 inline size-3 text-brand-500" />
            {isLost
              ? "Punya foto barang Anda? Unggah, dan AI Temuin akan mengisi ciri-cirinya otomatis. Tidak punya foto? Isi manual di bawah."
              : "Cukup foto barang yang Anda temukan — AI Temuin akan mengisi nama, kategori, warna, dan ciri-cirinya otomatis."}
          </p>
        </div>

        {/* Input file tanpa `name`: file hasil kompresi disisipkan saat submit. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFileChange}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />

        {preview ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="relative inline-block shrink-0 self-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Preview foto barang"
                className="h-44 w-auto rounded-xl object-cover ring-1 ring-slate-200"
              />
              <button
                type="button"
                onClick={clearFile}
                disabled={pending}
                className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 hover:text-rose-600"
                aria-label="Hapus foto"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-w-0 flex-1 space-y-3" aria-live="polite">
              {aiStatus?.kind === "analyzing" && (
                <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-700 ring-1 ring-brand-200">
                  <p className="flex items-center gap-2 font-medium">
                    <Loader2 className="size-4 animate-spin" />
                    AI sedang mengenali barang…
                  </p>
                  {slowAi && (
                    <p className="mt-1.5 text-xs leading-relaxed text-brand-700/80">
                      Server AI sedang memuat model, bisa sampai 1–2 menit.
                      Sambil menunggu, silakan isi lokasi &amp; waktu di bawah —
                      isian Anda tidak akan ditimpa AI.
                    </p>
                  )}
                </div>
              )}
              {aiStatus?.kind === "done" && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
                  <Sparkles className="mr-1 inline size-4 text-emerald-600" />
                  AI sudah mengisi kolom bertanda{" "}
                  <span className="font-semibold">AI</span> di bawah. Periksa
                  dan koreksi bila ada yang kurang tepat.
                </p>
              )}
              {aiStatus?.kind === "error" && (
                <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
                  {aiStatus.message}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {photo && aiStatus?.kind !== "analyzing" && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void runAnalysis(photo)}
                    disabled={pending}
                  >
                    <RefreshCw className="size-4" />
                    {aiStatus?.kind === "error" ? "Coba lagi" : "Analisis ulang"}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => galleryRef.current?.click()}
                  disabled={pending || preparing}
                >
                  <ImageUp className="size-4" />
                  Ganti foto
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={preparing}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 px-6 py-7 text-center transition hover:border-brand-400 hover:bg-brand-50"
            >
              {preparing ? (
                <Loader2 className="size-6 animate-spin text-brand-500" />
              ) : (
                <Camera className="size-6 text-brand-500" />
              )}
              <span className="text-sm font-semibold text-brand-700">
                {preparing ? "Menyiapkan foto…" : "Ambil Foto"}
              </span>
              <span className="text-xs text-slate-400">Pakai kamera HP</span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={preparing}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-7 text-center transition hover:border-brand-300 hover:bg-brand-50/40"
            >
              <ImageUp className="size-6 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">
                Pilih dari Galeri
              </span>
              <span className="text-xs text-slate-400">
                JPG, PNG, atau WebP
              </span>
            </button>
          </div>
        )}
        <FieldError error={imageError} />
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-sm font-bold tracking-wide text-slate-900 uppercase">
          Informasi Barang
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          {photo
            ? "Kolom bertanda AI diisi otomatis dari foto — silakan ubah bila perlu."
            : "Isi manual, atau unggah foto di atas agar AI mengisinya untuk Anda."}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="item_name">
              Nama barang
              <AiTag show={item.aiKeys.has("item_name")} />
            </Label>
            <Input
              id="item_name"
              name="item_name"
              value={v.item_name}
              onChange={(e) => setField("item_name", e.target.value)}
              className={aiClass("item_name")}
              placeholder={
                isLost
                  ? "Contoh: Dompet Eiger hitam"
                  : "Contoh: Dompet kulit hitam"
              }
              required
            />
            <FieldError error={err.item_name} />
          </div>
          <div>
            <Label htmlFor="category">
              Kategori
              <AiTag show={item.aiKeys.has("category")} />
            </Label>
            <Select
              id="category"
              name="category"
              value={v.category}
              onChange={(e) => setField("category", e.target.value)}
              className={aiClass("category")}
              required
            >
              <option value="" disabled>
                Pilih kategori…
              </option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <FieldError error={err.category} />
          </div>
          <div>
            <Label htmlFor="color">
              Warna
              <AiTag show={item.aiKeys.has("color")} />
            </Label>
            <Input
              id="color"
              name="color"
              value={v.color}
              onChange={(e) => setField("color", e.target.value)}
              className={aiClass("color")}
              placeholder="Contoh: Hitam"
            />
            <FieldError error={err.color} />
          </div>
          <div>
            <Label htmlFor="brand" optional>
              Brand / Merek
              <AiTag show={item.aiKeys.has("brand")} />
            </Label>
            <Input
              id="brand"
              name="brand"
              value={v.brand}
              onChange={(e) => setField("brand", e.target.value)}
              className={aiClass("brand")}
              placeholder="Contoh: Eiger"
            />
            <FieldError error={err.brand} />
          </div>
          <div>
            <Label htmlFor="model" optional>
              Model / Tipe
              <AiTag show={item.aiKeys.has("model")} />
            </Label>
            <Input
              id="model"
              name="model"
              value={v.model}
              onChange={(e) => setField("model", e.target.value)}
              className={aiClass("model")}
              placeholder="Contoh: Dompet lipat dua"
            />
            <FieldError error={err.model} />
          </div>
          <div>
            <Label htmlFor="material" optional>
              Material
              <AiTag show={item.aiKeys.has("material")} />
            </Label>
            <Input
              id="material"
              name="material"
              value={v.material}
              onChange={(e) => setField("material", e.target.value)}
              className={aiClass("material")}
              placeholder="Contoh: Kulit"
            />
            <FieldError error={err.material} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">
              Deskripsi
              <AiTag show={item.aiKeys.has("description")} />
            </Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              value={v.description}
              onChange={(e) => setField("description", e.target.value)}
              className={aiClass("description")}
              placeholder={
                isLost
                  ? "Ceritakan barang Anda senatural mungkin. Contoh: Saya kehilangan dompet Eiger hitam dekat food court sekitar jam 7 malam. Ada gantungan huruf A."
                  : "Deskripsikan barang yang Anda temukan. Contoh: Dompet hitam ditemukan dekat food court, terdapat gantungan berbentuk huruf A."
              }
              required
            />
            <Help>
              <Sparkles className="mr-1 inline size-3 text-brand-500" />
              AI Temuin akan mengekstrak ciri barang dari deskripsi ini — bahasa
              Indonesia maupun Inggris sama-sama dipahami.
            </Help>
            <FieldError error={err.description} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="unique_features" optional={!isLost}>
              Ciri khusus
              <AiTag show={item.aiKeys.has("unique_features")} />
            </Label>
            <Textarea
              id="unique_features"
              name="unique_features"
              rows={2}
              value={v.unique_features}
              onChange={(e) => setField("unique_features", e.target.value)}
              className={aiClass("unique_features")}
              placeholder="Contoh: gantungan huruf A, goresan di pojok, stiker bintang"
            />
            <Help>
              Pisahkan dengan koma. Ciri unik sangat membantu akurasi
              pencocokan.
            </Help>
            <FieldError error={err.unique_features} />
          </div>
        </div>
      </Card>

      {!isLost && (
        <Card className="border-l-4 border-l-amber-400 p-5 sm:p-6">
          <div className="mb-3 flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Info Verifikasi Privat <span className="text-rose-500">*</span>
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Tulis detail yang <strong>hanya diketahui pemilik asli</strong>{" "}
                — isi dompet, tulisan/kode tertentu, stiker, goresan, wallpaper,
                dsb. Info ini{" "}
                <strong>tidak pernah ditampilkan ke publik</strong> dan hanya
                dipakai sistem untuk menguji jawaban orang yang mengklaim.
              </p>
            </div>
          </div>
          <Textarea
            id="private_verification_info"
            name="private_verification_info"
            rows={3}
            placeholder="Contoh: di dalamnya ada kartu pelajar atas nama R***, foto keluarga, dan uang sekitar 50 ribu"
            required
          />
          <FieldError error={err.private_verification_info} />
          <Help>
            Kolom ini sengaja <strong>tidak diisi AI</strong>. Utamakan detail
            yang <strong>tidak terlihat di foto</strong> (foto bisa dilihat
            calon pemilik), dan jangan tulis detail rahasia ini di kolom
            deskripsi.
          </Help>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-bold tracking-wide text-slate-900 uppercase">
          Lokasi &amp; Waktu
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="location_name">
              {isLost ? "Lokasi terakhir terlihat" : "Lokasi ditemukan"}
            </Label>
            <div className="flex gap-2">
              <Input
                id="location_name"
                name="location_name"
                placeholder="Contoh: Food court Mall Panakkukang, Makassar"
                className="flex-1"
                required
              />
              <Button
                type="button"
                variant="secondary"
                onClick={useMyLocation}
                loading={locating}
                title="Tambahkan koordinat GPS dari perangkat"
              >
                <LocateFixed className="size-4" />
                <span className="hidden sm:inline">Lokasi saya</span>
              </Button>
            </div>
            {coords && (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                <LocateFixed className="size-3" />
                Koordinat: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                <button
                  type="button"
                  onClick={() => setCoords(null)}
                  className="ml-1 text-emerald-500 hover:text-emerald-800"
                  aria-label="Hapus koordinat"
                >
                  <X className="size-3" />
                </button>
              </p>
            )}
            <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
            <input type="hidden" name="longitude" value={coords?.lng ?? ""} />
            <FieldError error={err.location_name} />
          </div>
          <div>
            <Label htmlFor={isLost ? "lost_date" : "found_date"}>
              {isLost ? "Tanggal kehilangan" : "Tanggal ditemukan"}
            </Label>
            <Input
              id={isLost ? "lost_date" : "found_date"}
              name={isLost ? "lost_date" : "found_date"}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              required
            />
            <FieldError error={isLost ? err.lost_date : err.found_date} />
          </div>
          <div>
            <Label htmlFor={isLost ? "lost_time" : "found_time"} optional>
              {isLost ? "Perkiraan waktu" : "Waktu ditemukan"}
            </Label>
            <Input
              id={isLost ? "lost_time" : "found_time"}
              name={isLost ? "lost_time" : "found_time"}
              type="time"
            />
            <FieldError error={isLost ? err.lost_time : err.found_time} />
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3 pb-4">
        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={preparing}
          variant={isLost ? "primary" : "amber"}
          className="w-full sm:w-auto"
        >
          {pending ? (
            "Mengirim laporan…"
          ) : preparing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Menyiapkan foto…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              {isLost ? "Kirim Laporan Kehilangan" : "Kirim Laporan Penemuan"}
            </>
          )}
        </Button>
      </div>
      {pending && (
        <p className="-mt-2 pb-6 text-right text-xs text-slate-400">
          Menyimpan laporan Anda — analisis AI berjalan otomatis setelahnya.
        </p>
      )}
    </form>
  );
}
