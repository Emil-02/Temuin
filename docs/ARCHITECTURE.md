# 🏗️ Arsitektur & Flow Sistem — Temuin

Dokumen ini menjelaskan arsitektur teknis dan alur kerja **Temuin**, platform Lost & Found bertenaga AI. Untuk gambaran produk & cara setup, lihat [README utama](../README.md).

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Struktur Direktori](#2-struktur-direktori)
3. [Lapisan Aplikasi](#3-lapisan-aplikasi)
4. [Skema Database](#4-skema-database)
5. [Flow Sistem](#5-flow-sistem)
6. [Siklus Status](#6-siklus-status)
7. [Model Keamanan](#7-model-keamanan)
8. [Graceful Degradation](#8-graceful-degradation)

---

## 1. Gambaran Umum

Temuin adalah aplikasi **full-stack Next.js 16 (App Router)** — frontend dan backend hidup dalam satu codebase. Seluruh akses data dan AI berjalan **hanya di server**; browser tidak pernah memegang kredensial database maupun API key AI.

```mermaid
flowchart LR
    subgraph Browser["🖥️ Browser"]
        UI["React 19 + Tailwind v4<br/>Server Components + sedikit Client Components"]
    end

    subgraph Next["▲ Next.js 16 — satu-satunya pintu ke data"]
        Proxy["proxy.ts<br/>route guard + refresh session"]
        Pages["Pages / Server Components<br/>src/app/(app)/*"]
        Actions["Server Actions<br/>src/lib/actions/*"]
        API["Route Handlers<br/>src/app/api/*"]

        subgraph Domain["Domain Services — src/lib/"]
            Engine["Matching Engine<br/>(deterministik dan explainable)"]
            AILayer["AI Layer<br/>ai/index.ts (ollama.ts → gemini.ts → fallback.ts)"]
            Verify["Ownership Verification"]
        end
    end

    subgraph Supabase["☁️ Supabase"]
        Auth["Auth (session cookie)"]
        DB[("PostgreSQL — 12 tabel<br/>RLS deny-all")]
        Store["Storage privat<br/>bucket report-images"]
    end

    Ollama["🎓 Ollama server AI kampus<br/>gemma4 (teks + vision) + bge-m3 (embedding)"]
    Gemini["✨ Gemini API (cadangan)<br/>flash + gemini-embedding-001"]

    UI --> Proxy
    Proxy --> Pages
    UI -- "form submit" --> Actions
    UI -- "fetch (chat, foto)" --> API
    Pages --> Domain
    Actions --> Domain
    API --> Domain
    Actions -- "login/logout<br/>(anon key + cookie)" --> Auth
    Domain -- "service role" --> DB
    Domain -- "service role" --> Store
    AILayer -- "server-side only (utama)" --> Ollama
    AILayer -. "cadangan bila Ollama gagal" .-> Gemini
```

**Prinsip desain utama:**

| Prinsip | Implementasi |
| --- | --- |
| Zero-trust ke browser | RLS **deny-all** di semua tabel; data hanya lewat backend (service role) dengan ownership check per-request |
| AI sebagai sinyal, bukan hakim | AI (Ollama/Gemini) hanya menyuplai isi otomatis form, ekstraksi/embedding/analisis foto; skor akhir dihitung **deterministik** oleh Matching Engine |
| Non-blocking UX | Laporan tersimpan instan; AI & matching jalan di background via `after()` |
| Selalu berfungsi | Setiap fungsi AI punya fallback heuristik lokal (termasuk kamus ID→EN) |
| Explainable | Skor match disimpan per-komponen (`explanation` JSONB) dan ditampilkan ke user |

## 2. Struktur Direktori

```
src/
├── proxy.ts                  # Route guard (pengganti middleware di Next 16):
│                             #   refresh session + redirect login/dashboard
├── app/
│   ├── page.tsx              # Landing page (publik)
│   ├── login/  register/     # Halaman autentikasi
│   ├── (app)/                # Route group terautentikasi (dilindungi proxy)
│   │   ├── dashboard/        # Ringkasan laporan, match, notifikasi
│   │   ├── report/lost/      # Form laporan kehilangan
│   │   ├── report/found/     # Form laporan penemuan
│   │   ├── reports/[id]/     # Detail laporan + status AI + timeline
│   │   ├── matches/[id]/     # Detail match + breakdown skor
│   │   ├── claims/[id]/      # Alur klaim & verifikasi
│   │   ├── messages/[id]/    # Chat aman per-conversation
│   │   ├── notifications/    # Daftar notifikasi
│   │   ├── impact/           # Statistik barang yang kembali
│   │   ├── profile/          # Edit profil & password
│   │   └── admin/            # Panel admin (role-gated)
│   └── api/
│       ├── images/           # GET foto privat via signed URL (authz per-request)
│       ├── messages/[conversationId]/  # GET (polling) + POST pesan chat
│       └── dev/seed/         # Seed data demo (dikunci SEED_SECRET)
├── components/               # UI: app-shell, report-form, chat-panel,
│                             #     score-breakdown, status-timeline, dll.
└── lib/
    ├── actions/              # SERVER ACTIONS — semua mutasi data
    │   ├── auth.ts           #   register, login, logout
    │   ├── reports.ts        #   create lost/found, retry AI, close report
    │   ├── claims.ts         #   submit claim, verifikasi, keputusan penemu,
    │   │                     #   handover, complete
    │   └── profile.ts        #   update profil, ganti password
    ├── ai/
    │   ├── index.ts          # Layanan AI: prompt + schema + rantai provider
    │   ├── ollama.ts         # Klien Ollama (provider utama, server-only)
    │   ├── gemini.ts         # Klien Gemini (provider cadangan, server-only)
    │   ├── embedding.ts      # Kalibrasi cosine per model embedding
    │   └── fallback.ts       # Heuristik non-AI + kamus token ID→EN
    ├── matching/
    │   ├── engine.ts         # computeMatch() — skor deterministik 7 komponen
    │   └── run.ts            # Pipeline: processReportAI() + runMatchingForReport()
    ├── supabase/
    │   ├── server.ts         # Client anon + cookie — KHUSUS autentikasi
    │   └── admin.ts          # Client service-role — semua akses data
    ├── auth.ts               # getSessionUser / requireUser / getProfile
    ├── verification.ts       # Pertanyaan verifikasi + penilaian jawaban
    ├── claims.ts / matches.ts / reports.ts / notifications.ts  # Query helpers
    ├── validation.ts         # Skema Zod semua input
    ├── rate-limit.ts         # Rate limiter in-memory
    ├── constants.ts          # Bobot, threshold, kategori, meta status
    ├── types.ts              # Tipe domain bersama
    └── utils.ts              # haversine, cosine, text similarity, format
supabase/
├── schema.sql                # 12 tabel + enum + trigger + RLS + bucket
└── migrations/               # CHECK constraints tambahan
```

## 3. Lapisan Aplikasi

### 3.1 Proxy (route guard)

[`src/proxy.ts`](../src/proxy.ts) berjalan di setiap request halaman (pengganti `middleware.ts` pada Next 16):

1. Me-refresh session Supabase bila kedaluwarsa (sinkronisasi cookie).
2. Redirect ke `/login?next=...` bila user belum login mengakses prefix terproteksi (`/dashboard`, `/report`, `/reports`, `/matches`, `/claims`, `/notifications`, `/impact`, `/profile`, `/messages`, `/admin`).
3. Redirect user yang sudah login dari `/login` & `/register` ke `/dashboard`.

Halaman terproteksi tetap memanggil `requireUser()` sebagai lapisan kedua — proxy hanyalah gerbang pertama.

### 3.2 Dua client Supabase (pemisahan peran)

| Client | File | Kunci | Kegunaan |
| --- | --- | --- | --- |
| **Server (anon + cookie)** | [`lib/supabase/server.ts`](../src/lib/supabase/server.ts) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Hanya autentikasi** — login, logout, ganti password, baca session |
| **Admin (service role)** | [`lib/supabase/admin.ts`](../src/lib/supabase/admin.ts) | `SUPABASE_SERVICE_ROLE_KEY` | **Semua akses data & storage** — bypass RLS, wajib disertai ownership check di kode |

Karena semua tabel RLS deny-all, anon key tidak bisa membaca data apa pun — bahkan bila bocor ke browser.

### 3.3 Server Actions (semua mutasi)

Setiap action mengikuti pola yang sama:

```
requireUser() → rateLimit() → validasi Zod → authz/ownership check
→ mutasi via supabaseAdmin() → catat history/notifikasi → revalidatePath()
```

| Action | Rate limit | Fungsi |
| --- | --- | --- |
| `createLostReportAction` / `createFoundReportAction` | 10 / 10 menit | Simpan laporan + upload foto + jadwalkan pipeline AI |
| `retryAiAction` | — | Ulangi pipeline AI bila gagal |
| `closeReportAction` | — | Tutup laporan manual |
| `submitClaimAction` | 10 / 10 menit | Ajukan klaim atas sebuah match |
| `submitVerificationAction` | 8 / 10 menit | Kirim jawaban verifikasi → dinilai AI |
| `finderDecisionAction` | — | Penemu menyetujui / menolak klaim |
| `markHandoverAction` / `completeClaimAction` | — | Serah terima & konfirmasi selesai |
| `loginAction` / `registerAction` | ada | Autentikasi |

### 3.4 Route Handlers (API)

| Endpoint | Metode | Fungsi |
| --- | --- | --- |
| `/api/images?type=&id=` | GET | Authz per-request (pemilik / lawan match / admin) → redirect ke **signed URL** berumur 300 detik dari bucket privat |
| `/api/messages/[conversationId]` | GET | Ambil pesan (dipolling client); hanya untuk partisipan conversation |
| `/api/messages/[conversationId]` | POST | Kirim pesan (rate limit 30/menit) + notifikasi `NEW_MESSAGE` |
| `/api/dev/seed?secret=` | GET/POST | Seed data demo melalui pipeline AI asli; dikunci `SEED_SECRET` |

### 3.5 AI Layer

[`lib/ai/index.ts`](../src/lib/ai/index.ts) — semua fungsi **mengembalikan `null` saat gagal** sehingga pemanggil wajib pakai fallback. Tiap panggilan mencoba provider berurutan: **Ollama kampus** ([`ollama.ts`](../src/lib/ai/ollama.ts), `OLLAMA_MODEL` default `gemma4:latest`) → **Gemini** ([`gemini.ts`](../src/lib/ai/gemini.ts), bila `GEMINI_API_KEY` ada). Prompt & JSON Schema dipakai bersama; hasil menyertakan `provider` yang tercatat di DB (`source` / `evaluated_by`).

| Fungsi | Model (Ollama / Gemini) | Output |
| --- | --- | --- |
| `describeItemForForm` | `gemma4` / `GEMINI_MODEL` | Isi otomatis form dari foto (Bahasa Indonesia), tanpa data pribadi & isi barang |
| `extractReportAttributes` | `gemma4` / `GEMINI_MODEL` | JSON terstruktur: item_type, warna, merek, material, ciri khusus, keywords, deskripsi ternormalisasi (EN) |
| `analyzeItemImage` | sama | Analisis foto: objek, warna, merek, ciri pembeda |
| `embedForMatching` | `bge-m3` (1024-dim) / `gemini-embedding-001` (768-dim) | Vektor L2-normalized + nama model (`embedding_model`) |
| `judgeVerificationAnswers` | sama dgn extraction | Verdict per jawaban: `match` / `partial` / `no_match` / `unknown` + catatan |

Timeout Ollama: 75 detik untuk aksi yang ditunggu user (isi otomatis, verifikasi), 150 detik untuk pipeline background — server kampus dipakai bersama dan memuat model (cold start) bisa ~1–2 menit. Mitigasi: `keep_alive` (`OLLAMA_KEEP_ALIVE`, default 30m), warmup model saat form laporan dibuka, dan **circuit breaker** — setelah Ollama gagal, ia dilewati 60 detik agar request berikutnya langsung ke cadangan.

Embedding hanya dibandingkan antar model yang sama; cosine dikalibrasi per model di [`embedding.ts`](../src/lib/ai/embedding.ts).

[`lib/ai/fallback.ts`](../src/lib/ai/fallback.ts) — ekstraksi heuristik + `translateTokens()` (kamus Indonesia→Inggris) agar laporan berbahasa campuran tetap bisa dibandingkan tanpa AI.

### 3.6 Matching Engine

[`lib/matching/engine.ts`](../src/lib/matching/engine.ts) — `computeMatch()` menghitung 7 komponen skor. **Bobot komponen yang datanya tidak tersedia dikeluarkan, sisanya dinormalisasi ulang ke 100%** — user tanpa foto/koordinat tidak dirugikan.

| Komponen | Bobot dasar | Cara hitung |
| --- | --- | --- |
| Kemiripan deskripsi (semantic) | 30 | Cosine similarity embedding, dipetakan `(cos − 0.55) / 0.37`; fallback: token similarity lintas bahasa |
| Atribut barang | 20 | Rata-rata kecocokan warna/merek/material/model (prioritas: ekstraksi AI → analisis foto → field mentah) |
| Ciri khusus | 10 | Kemiripan teks antar daftar ciri unik kedua sisi |
| Lokasi | 20 | Jarak haversine berjenjang (≤100 m = 1.0 … >25 km = 0.05); fallback: kemiripan nama lokasi |
| Waktu | 15 | Selisih jam hilang↔ditemukan berjenjang (≤2 jam = 1.0 … >30 hari = 0.05); ditemukan >24 jam **sebelum** hilang = 0.05 |
| Kategori | 5 | Sama persis = 1.0; jenis serupa dari AI = 0.9 |
| Foto | 15 | Perbandingan hasil analisis foto kedua sisi (objek 30%, warna 25%, ciri 35%, merek 10%) — hanya bila **kedua** laporan berfoto |

Threshold (di [`lib/constants.ts`](../src/lib/constants.ts)):

| Nilai | Arti |
| --- | --- |
| `finalScore ≥ 40` | Match disimpan ke tabel `matches` |
| `≥ 50` | Notifikasi ke pemilik laporan hilang, status → `MATCH_FOUND` |
| `≥ 70` | Notifikasi juga ke penemu |
| Level | `HIGH ≥ 85` · `GOOD ≥ 70` · `POSSIBLE ≥ 50` · `LOW < 50` |

## 4. Skema Database

12 tabel PostgreSQL (lihat [`supabase/schema.sql`](../supabase/schema.sql)), semuanya RLS deny-all:

```mermaid
erDiagram
    profiles ||--o{ lost_reports : "melapor"
    profiles ||--o{ found_reports : "melapor"
    profiles ||--o{ notifications : "menerima"
    lost_reports ||--o| ai_analysis : "1:1"
    found_reports ||--o| ai_analysis : "1:1"
    lost_reports ||--o{ report_images : ""
    found_reports ||--o{ report_images : ""
    lost_reports ||--o{ report_status_history : ""
    found_reports ||--o{ report_status_history : ""
    lost_reports ||--o{ matches : ""
    found_reports ||--o{ matches : ""
    matches ||--o{ claims : "unik per claimant"
    claims ||--o| claim_verifications : "1:1"
    claims ||--o| conversations : "1:1"
    conversations ||--o{ messages : ""
```

| Tabel | Peran | Catatan penting |
| --- | --- | --- |
| `profiles` | Data user + role (`user`/`admin`) | Auto-dibuat trigger `handle_new_user` saat register; `phone` privat |
| `lost_reports` / `found_reports` | Laporan kehilangan / penemuan | `found_reports.private_verification_info` = **rahasia**, tak pernah dikirim ke pengklaim; foto opsional |
| `report_images` | Path foto di bucket privat | XOR constraint: milik lost **atau** found |
| `ai_analysis` | Hasil pipeline AI per laporan (1:1) | `extraction`, `image_analysis`, `embedding` (JSONB); `embedding_model`; `source` ollama/gemini/fallback; `status` PENDING/COMPLETED/PARTIAL/FAILED |
| `matches` | Pasangan lost↔found + skor | Unik `(lost, found)`; skor per-komponen + `explanation` JSONB (explainable) |
| `claims` | Klaim kepemilikan atas match | Unik `(match, claimant)`; `verification_score` |
| `claim_verifications` | Jawaban & hasil penilaian (1:1 klaim) | `checks` per-aspek; `evaluated_by` ollama/gemini/fallback |
| `conversations` / `messages` | Chat aman pasca-approve (1:1 klaim) | Hanya owner & finder |
| `notifications` | Notifikasi in-app | MATCH_FOUND, CLAIM_*, NEW_MESSAGE, ITEM_RETURNED, … |
| `report_status_history` | Timeline status laporan | Sumber data komponen status-timeline |

Semua tabel bermutasi memakai trigger `set_updated_at`. Storage: bucket **privat** `report-images`.

## 5. Flow Sistem

### 5.1 Autentikasi

```mermaid
sequenceDiagram
    actor U as User
    participant P as proxy.ts
    participant A as Server Action (auth)
    participant SB as Supabase Auth
    participant DB as PostgreSQL

    U->>A: registerAction / loginAction
    A->>A: rateLimit + validasi Zod
    A->>SB: signUp / signInWithPassword (anon key)
    SB-->>U: set session cookie (httpOnly)
    Note over SB,DB: trigger handle_new_user →<br/>INSERT profiles otomatis
    U->>P: akses /dashboard
    P->>SB: getUser() + refresh session
    P-->>U: lolos (atau redirect /login)
```

### 5.2 Pembuatan laporan + pipeline AI (non-blocking)

Laporan tersimpan dan user langsung diarahkan ke halaman detail; AI berjalan **setelah response terkirim** memakai `after()` dari `next/server`.

```mermaid
sequenceDiagram
    actor U as User
    participant SA as createLost/FoundReportAction
    participant DB as Supabase (service role)
    participant BG as after() — background
    participant G as AI (Ollama → Gemini)

    U->>SA: submit form (+ foto opsional)
    SA->>SA: requireUser + rateLimit(10/10mnt) + Zod
    SA->>DB: INSERT lost_reports / found_reports (status ACTIVE)
    SA->>DB: upload foto → bucket privat (gagal ≠ gagal laporan)
    SA->>DB: INSERT ai_analysis (status PENDING)
    SA-->>U: redirect /reports/[id] ⚡ instan

    Note over BG: processNewReport(type, id)
    BG->>G: extractReportAttributes(form)
    alt semua provider AI gagal
        BG->>BG: fallbackExtraction() heuristik
    end
    opt laporan berfoto
        BG->>G: analyzeItemImage(base64)
    end
    BG->>G: embedForMatching(teks gabungan) → vektor + nama model
    BG->>DB: UPDATE ai_analysis (COMPLETED / PARTIAL / FAILED)
    BG->>BG: runMatchingForReport(...)  — lihat 5.3
```

Halaman detail menampilkan status "sedang dianalisis" dari baris `ai_analysis` PENDING; bila FAILED tersedia tombol **Retry** (`retryAiAction`).

### 5.3 Matching

```mermaid
flowchart TD
    A["runMatchingForReport(type, id)"] --> B["Pre-filter deterministik di SQL:<br/>• tabel lawan (lost↔found)<br/>• status ACTIVE / MATCH_FOUND<br/>• bukan laporan sendiri<br/>• kategori sama atau 'other'<br/>• window tanggal asimetris<br/>(hilang → cari found −2..+60 hari)<br/>• maks 100 kandidat"]
    B --> C["Filter radius ≤ 100 km<br/>(bila kedua sisi berkoordinat)"]
    C --> D["computeMatch() per kandidat<br/>7 komponen, bobot dinormalisasi"]
    D --> E{"finalScore ≥ 40?"}
    E -- tidak --> X["abaikan"]
    E -- ya --> F["UPSERT matches<br/>(skor + explanation JSONB)"]
    F --> G{"match baru?"}
    G -- "skor ≥ 50" --> H["🔔 notifikasi pemilik<br/>status lost → MATCH_FOUND"]
    G -- "skor ≥ 70" --> I["🔔 notifikasi penemu<br/>status found → MATCH_FOUND"]
```

Matching berjalan dua arah: laporan baru dicocokkan ke semua laporan lawan yang sudah ada, sehingga match tetap ditemukan tak peduli mana yang dibuat lebih dulu.

### 5.4 Klaim & verifikasi kepemilikan

```mermaid
sequenceDiagram
    actor O as Pemilik (claimant)
    actor F as Penemu
    participant S as Server Actions (claims)
    participant V as verification.ts
    participant G as AI (Ollama → Gemini)
    participant DB as Supabase

    O->>S: submitClaimAction(matchId)
    S->>DB: INSERT claims (SUBMITTED)<br/>status kedua laporan → CLAIMED
    S--)F: 🔔 CLAIM_SUBMITTED

    O->>S: submitVerificationAction (≤5 jawaban)
    S->>V: evaluateVerificationAnswers()
    V->>G: judgeVerificationAnswers(jawaban vs referensi privat)
    alt semua provider AI gagal
        V->>V: fallback text-similarity (lintas bahasa)
    end
    V-->>S: checks per-aspek + score 0–100
    S->>DB: claim_verifications + verification_score<br/>claim → UNDER_VERIFICATION (guard: hanya dari SUBMITTED)<br/>laporan → VERIFICATION
    S--)F: 🔔 CLAIM_VERIFIED (skor siap ditinjau)

    F->>S: finderDecisionAction(approve / reject)
    alt ✅ Approve
        S->>DB: claim → APPROVED (guard anti-race)<br/>UPSERT conversations (owner + finder)<br/>laporan → HANDOVER
        S--)O: 🔔 CLAIM_APPROVED + link chat
    else ❌ Reject
        S->>DB: claim → REJECTED<br/>laporan kembali → MATCH_FOUND
        S--)O: 🔔 CLAIM_REJECTED
    end
```

**Pertanyaan verifikasi** (bobot dinormalisasi terhadap yang tampil; pertanyaan merek hanya muncul bila penemu mengisi merek/model):

| Aspek | Bobot | Dibandingkan dengan |
| --- | --- | --- |
| Detail privat | 35 | `private_verification_info` (rahasia penemu) |
| Ciri khusus | 25 | `unique_features` + deskripsi penemu |
| Merek / model | 15 | field merek & model |
| Lokasi | 15 | `location_name` penemu |
| Waktu | 10 | tanggal & jam ditemukan |

Skor = Σ(bobot × nilai verdict) → `match` = 1 · `partial` = 0.5 · `unknown` = 0.35 (netral, referensi kurang) · `no_match` = 0. Rekomendasi UI: **≥ 70** kemungkinan besar pemilik sah · **40–69** perlu peninjauan manual · **< 40** kecocokan rendah. **Keputusan akhir selalu di tangan penemu** — AI hanya memberi rekomendasi.

### 5.5 Chat aman & serah terima

```mermaid
sequenceDiagram
    actor O as Pemilik
    actor F as Penemu
    participant API as /api/messages/[conversationId]
    participant S as Server Actions
    participant DB as Supabase

    Note over O,F: conversation dibuat otomatis saat klaim APPROVED
    loop polling berkala (chat-panel)
        O->>API: GET → daftar pesan (cek partisipan)
    end
    O->>API: POST pesan (rate limit 30/menit)
    API--)F: 🔔 NEW_MESSAGE
    opt opsional
        F->>S: markHandoverAction → claim HANDOVER
    end
    F->>S: completeClaimAction (hanya penemu)
    S->>DB: claim → COMPLETED (guard: dari APPROVED/HANDOVER)<br/>kedua laporan → RETURNED
    S--)O: 🔔 ITEM_RETURNED
    Note over O,F: 📊 barang tercatat di halaman Impact
```

### 5.6 Penyajian foto privat

Foto tidak pernah publik. `next/image` menunjuk ke `/api/images?type=lost|found&id=...`, yang:

1. Memastikan user login.
2. Mengizinkan hanya: **pemilik laporan**, **pemilik laporan lawan pada match yang melibatkan laporan itu**, atau **admin**.
3. Membuat **signed URL 300 detik** dari bucket privat, lalu redirect.

## 6. Siklus Status

### Status laporan (lost & found bergerak bersama)

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : laporan dibuat
    ACTIVE --> MATCH_FOUND : skor match ≥ threshold notifikasi
    MATCH_FOUND --> CLAIMED : klaim diajukan
    CLAIMED --> VERIFICATION : jawaban verifikasi dikirim
    VERIFICATION --> HANDOVER : klaim disetujui penemu
    CLAIMED --> MATCH_FOUND : klaim ditolak
    VERIFICATION --> MATCH_FOUND : klaim ditolak
    HANDOVER --> RETURNED : penemu konfirmasi diserahkan
    ACTIVE --> CLOSED : ditutup manual
    MATCH_FOUND --> CLOSED : ditutup manual
    RETURNED --> [*]
```

### Status klaim

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED : submitClaimAction
    SUBMITTED --> UNDER_VERIFICATION : jawaban dinilai AI
    SUBMITTED --> APPROVED : penemu setuju
    SUBMITTED --> REJECTED : penemu tolak
    UNDER_VERIFICATION --> APPROVED : penemu setuju
    UNDER_VERIFICATION --> REJECTED : penemu tolak
    APPROVED --> HANDOVER : markHandover (opsional)
    APPROVED --> COMPLETED : completeClaim
    HANDOVER --> COMPLETED : completeClaim
    COMPLETED --> [*]
    REJECTED --> [*]
```

Setiap transisi klaim memakai **conditional guard** di query (`.eq("status", ...)` / `.in("status", [...])`) sehingga aman dari race condition & double-submit. Semua perubahan status laporan dicatat ke `report_status_history` (sumber timeline di UI).

## 7. Model Keamanan

Pertahanan berlapis, dari luar ke dalam:

| Lapisan | Mekanisme |
| --- | --- |
| 1. Proxy | Redirect user anonim dari semua route terproteksi |
| 2. Session | `requireUser()` di setiap page & server action (lapisan kedua) |
| 3. Rate limit | In-memory per user+aksi: laporan 10/10mnt, klaim 10/10mnt, verifikasi 8/10mnt, chat 30/mnt, login/register |
| 4. Validasi input | Zod server-side di semua action (termasuk rentang lat/long) + CHECK constraint DB |
| 5. Authorization | Ownership check eksplisit per-request sebelum tiap query service-role |
| 6. RLS deny-all | Jika ada bug di lapisan atas, akses langsung DB dari browser tetap ditolak |
| 7. Data rahasia | `private_verification_info` tak pernah dikirim ke pengklaim; foto via signed URL 300 detik; `phone` tak pernah tampil ke user lain |
| 8. Secrets | `GEMINI_API_KEY`, `OLLAMA_API_KEY` & `SUPABASE_SERVICE_ROLE_KEY` hanya di env server; semua panggilan AI dari server — tak pernah masuk bundle browser |
| 9. Anti-race | Conditional guard di semua transisi status |

## 8. Graceful Degradation

Aplikasi dirancang tetap berfungsi penuh **tanpa AI** (server Ollama kampus tak terjangkau dan tanpa `GEMINI_API_KEY`, atau keduanya error/timeout):

| Kapabilitas | Dengan AI (Ollama/Gemini) | Tanpa AI (fallback) |
| --- | --- | --- |
| Ekstraksi atribut | LLM → JSON terstruktur (normalisasi EN) | Heuristik + kamus token ID→EN |
| Isi otomatis form dari foto | Vision → nama, kategori, warna, ciri | Tidak tersedia — user mengisi manual |
| Kemiripan deskripsi | Embedding (model sama) + cosine terkalibrasi | Token similarity lintas bahasa |
| Analisis foto | Vision → objek/warna/ciri | Komponen foto dinonaktifkan, bobot dinormalisasi ulang |
| Penilaian verifikasi | LLM judge per-aspek + catatan | Text similarity per-aspek |
| Status tercatat | `source: "ollama"` / `"gemini"` | `source: "fallback"` + tombol Retry |

Kegagalan parsial (mis. embedding sukses tapi analisis foto gagal) menghasilkan status `PARTIAL` — sistem memakai sinyal yang tersedia dan menormalisasi ulang bobot skor.

---

<div align="center">

Kembali ke [README utama](../README.md) · Setup admin: [ADMIN_SETUP.md](ADMIN_SETUP.md)

</div>
