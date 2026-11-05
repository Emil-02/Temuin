<div align="center">

# 🔍 TEMUIN

### _Yang Hilang, Bisa Ditemuin._

**Platform Lost & Found Bertenaga AI** — mempertemukan barang hilang dengan penemunya secara otomatis, aman, dan explainable.

Dibangun untuk **CREATHON 2026** · Tema: _AI dan Data yang Berdampak Sosial_

🔗 **Live demo:** [temuin-kohl.vercel.app](https://temuin-kohl.vercel.app)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Ollama](https://img.shields.io/badge/AI-Gemma_4_via_Ollama_kampus-000000?logo=ollama&logoColor=white)](https://ollama.com)
[![Gemini](https://img.shields.io/badge/Gemini_AI-cadangan-8E75B2?logo=googlegemini&logoColor=white)](https://ai.google.dev)

</div>

---

## 💡 Masalah & Solusi

Setiap hari ribuan barang hilang — dompet, ponsel, kunci, dokumen penting. Grup media sosial "info kehilangan" tidak efisien: laporan tenggelam, informasi sensitif terpampang publik, dan rawan klaim palsu.

**Temuin** menyelesaikannya end-to-end:

1. 🤖 **AI Matching** — mencocokkan laporan _kehilangan_ ↔ _penemuan_ dari deskripsi, atribut, ciri khusus, lokasi, waktu, dan foto (bila ada).
2. 🔐 **Verifikasi Kepemilikan** — pengklaim menjawab pertanyaan privat yang hanya diketahui pemilik asli; AI menilai jawabannya.
3. 💬 **Chat Aman** — jalur komunikasi terbuka hanya setelah klaim disetujui penemu.
4. 📊 **Dampak Terukur** — setiap barang yang kembali tercatat di halaman **Impact**.

> Informasi sensitif **tidak pernah** dipajang ke publik.

## ✨ Fitur Utama

| Fitur | Deskripsi |
| --- | --- |
| 📝 Laporan Kehilangan & Penemuan | Form terstruktur + upload foto (bucket privat, signed URL) |
| 📸 Isi Otomatis dari Foto | Cukup foto barang → AI mengisi nama, kategori, warna, merek, material, deskripsi & ciri khusus; user tinggal cek & koreksi. Foto wajib untuk laporan penemuan, dikompres di browser sebelum upload |
| 🧠 Explainable Match Score | Skor per-komponen (deskripsi, atribut, lokasi, waktu, foto…) — bukan black box |
| 🛡️ Verifikasi Klaim | 5 pertanyaan privat + _Verification Score_ dari AI, keputusan akhir di tangan penemu |
| 💬 Pesan Real-time | Chat antar pihak setelah klaim disetujui |
| 🔔 Notifikasi | Match baru, klaim masuk, status berubah |
| 🧭 Timeline Status | ACTIVE → MATCH_FOUND → CLAIMED → VERIFICATION → HANDOVER → RETURNED |
| 👮 Panel Admin | Statistik & moderasi laporan ([cara setup admin](docs/ADMIN_SETUP.md)) |
| ⚡ Submit Non-Blocking | Laporan langsung tersimpan; analisis AI & matching berjalan di background (`after()`) |
| 🌱 Graceful Fallback | Tanpa API key AI, heuristik lokal (termasuk kamus ID→EN) tetap bekerja |

## 🏗️ Teknologi

| Lapisan | Teknologi |
| --- | --- |
| Frontend + Backend | Next.js 16 (App Router, Server Actions), TypeScript, Tailwind CSS v4 |
| Database + Auth + Storage | Supabase (PostgreSQL, RLS deny-all, bucket privat) |
| AI utama | Ollama server AI kampus (`ollama.if.unismuh.ac.id`): **Gemma 4** (teks + vision) & **bge-m3** (embedding multibahasa) — **server-side only** |
| AI cadangan | Gemini API (`GEMINI_MODEL` + `gemini-embedding-001`), otomatis dipakai bila server kampus gagal/timeout |
| Matching | Temuin Matching Engine — skor deterministik & explainable di backend |

### Arsitektur AI (prinsip)

- **AI hanya menyuplai sinyal**: isi otomatis form dari foto, ekstraksi atribut terstruktur, embedding semantik, analisis foto, dan penilaian jawaban verifikasi.
- **Urutan provider**: Ollama kampus → Gemini (bila `GEMINI_API_KEY` ada) → heuristik lokal. Bila server kampus gagal, Temuin melewatinya selama 60 detik (circuit breaker) agar user tidak menunggu.
- **Cold start**: server kampus dipakai bersama, memuat model bisa ~1–2 menit. Temuin meminta model tetap di memori (`OLLAMA_KEEP_ALIVE`) dan memanaskan model saat form laporan dibuka.
- Embedding hanya dibandingkan antar **model yang sama** (kolom `embedding_model`), dengan kalibrasi skor per model.
- **Skor akhir dihitung deterministik** oleh Temuin Matching Engine dengan bobot: deskripsi 30 · atribut 20 · ciri khusus 10 · lokasi 20 · waktu 15 · kategori 5 (+ foto 15). Bobot dinormalisasi ulang bila komponen tidak tersedia, sehingga **pengguna tanpa foto tidak dirugikan**.
- AI tidak pernah "memastikan kepemilikan" — hanya _Potential Match_; keputusan akhir lewat verifikasi + persetujuan penemu.

> 📐 Diagram arsitektur lengkap, skema database, dan flow sistem: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 🚀 Setup (± 10 menit)

### 1. Buat project Supabase

1. Buka [supabase.com](https://supabase.com) → **New Project**.
2. Buka **SQL Editor** → paste seluruh isi [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Ini membuat 12 tabel, trigger, RLS, dan bucket storage `report-images`.
3. Jalankan juga [`supabase/migrations/0002_check_constraints.sql`](supabase/migrations/0002_check_constraints.sql) — CHECK constraint integritas data (koordinat & rentang skor).
4. Jalankan [`supabase/migrations/0003_ollama_provider.sql`](supabase/migrations/0003_ollama_provider.sql) — **wajib** untuk provider Ollama (kolom `embedding_model` + sumber AI `ollama`).

### 2. Konfigurasi environment

```bash
cp .env.example .env.local
```

Isi `.env.local`:

| Variabel | Sumber | Catatan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API | |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API | 🔒 **tidak di-commit** |
| `OLLAMA_BASE_URL` | server AI kampus | mis. `https://ollama.if.unismuh.ac.id`; kosongkan untuk menonaktifkan |
| `OLLAMA_MODEL` | opsional | default `gemma4:latest` (harus mendukung vision) |
| `OLLAMA_EMBED_MODEL` | opsional | default `bge-m3:latest` |
| `OLLAMA_KEEP_ALIVE` | opsional | default `30m` — lama model ditahan di memori server |
| `OLLAMA_API_KEY` | opsional | 🔒 bila server Ollama memakai autentikasi Bearer |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | 🔒 opsional, AI cadangan |
| `GEMINI_MODEL` | opsional | default `gemini-flash-latest` |
| `SEED_SECRET` | string bebas | mengunci endpoint seed |

> 💡 Tanpa AI sama sekali (Ollama tidak terjangkau & tanpa `GEMINI_API_KEY`) aplikasi tetap berjalan memakai fallback heuristik, tetapi isi otomatis dari foto tidak tersedia dan akurasi matching menurun.
>
> 🔁 Laporan lama yang dianalisis dengan Gemini memakai embedding berbeda — tekan **Analisis ulang AI** di halaman detail laporan agar embedding-nya ikut model baru.

### 3. Jalankan

```bash
npm install
npm run dev        # development
# atau produksi:
npm run build && npm run start
```

Buka http://localhost:3000 🎉

### 4. (Opsional) Seed data demo

```
http://localhost:3000/api/dev/seed?secret=<SEED_SECRET>
```

Seed membuat 3 akun demo + 5 laporan yang diproses lewat **pipeline AI & matching engine asli** (bukan skor hard-code):

| Akun | Password | Peran |
| --- | --- | --- |
| `budi.demo@temuin.app` | `Temuin!234` | Kehilangan dompet Eiger (skenario utama) |
| `sari.demo@temuin.app` | `Temuin!234` | Menemukan dompet tersebut |
| `andi.demo@temuin.app` | `Temuin!234` | Laporan negatif (pembanding) |

Skenario utama ditargetkan menghasilkan **HIGH MATCH (±90%)**; laporan negatif membuktikan sistem tidak selalu memberi skor tinggi.

## 🎬 Alur Demo Kompetisi

```
Budi (kehilangan) ──► Match ditemukan ──► Ajukan Klaim ──► Jawab verifikasi
                                                                │
Sari (penemu) ◄── Tinjau Verification Score ◄──────────────────┘
      │
      ├──► Setujui ──► 💬 Chat aman ──► Atur serah terima
      └──► Konfirmasi Diserahkan ──► ✅ RETURNED ──► 📊 Impact
```

1. Login `budi.demo@temuin.app` → laporan "Dompet Eiger Hitam" sudah punya match → buka **Matches** → lihat _Explainable Match Score_.
2. Klik **Ajukan Klaim** → jawab 5 pertanyaan verifikasi (mis. "ada gantungan huruf A, jahitan pojok lepas, ada KTP atas nama B…").
3. Login `sari.demo@temuin.app` → **Klaim** → tinjau _Verification Score_ → **Setujui**.
4. Chat aman terbuka → atur serah terima.
5. Sari klik **Konfirmasi Barang Diserahkan** → status **RETURNED** → cek **Impact**.

## 📂 Struktur Project

```
src/
├── app/
│   ├── (app)/           # Halaman terautentikasi (dashboard, reports, matches, claims, …)
│   ├── api/             # Route handlers (images, messages, seed)
│   ├── login/ register/ # Autentikasi
│   └── page.tsx         # Landing page
├── components/          # UI components (app-shell, report-form, chat-panel, …)
└── lib/
    ├── ai/              # Layanan AI: Ollama (utama) + Gemini (cadangan) + fallback heuristik
    ├── matching/        # Temuin Matching Engine (deterministik, explainable)
    ├── actions/         # Server Actions (auth, reports, claims, profile)
    └── supabase/        # Client server-side & admin (service role)
supabase/
├── schema.sql           # 12 tabel, trigger, RLS deny-all, storage bucket
└── migrations/          # Migration tambahan (CHECK constraints)
docs/
├── ARCHITECTURE.md      # Arsitektur & flow sistem (diagram lengkap)
└── ADMIN_SETUP.md       # Cara mengelola role admin
```

## 🔒 Keamanan & Privasi

- ✅ Semua tabel RLS **deny-all** — data hanya lewat backend (service role) dengan ownership check per-request.
- ✅ `private_verification_info` tidak pernah dikirim ke pengklaim; foto disajikan lewat signed URL berautentikasi.
- ✅ Semua panggilan AI (Ollama & Gemini) dilakukan dari server; `GEMINI_API_KEY`, `OLLAMA_API_KEY` & `SUPABASE_SERVICE_ROLE_KEY` tidak pernah menyentuh browser.
- ✅ Rate limiting pada login/register, pembuatan laporan, klaim, verifikasi, dan chat.
- ✅ Validasi input server-side pada semua Server Action (termasuk rentang latitude/longitude) + CHECK constraint di database.
- ✅ Transisi status klaim memakai conditional guard di database — aman dari race condition / double-submit.

---

<div align="center">

**Temuin** — dibuat dengan ❤️ untuk CREATHON 2026

_Karena setiap barang hilang punya cerita, dan setiap cerita layak berakhir dengan "ketemu"._

</div>
