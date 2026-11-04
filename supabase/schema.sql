-- ============================================================
-- TEMUIN — AI-Powered Lost & Found Platform
-- Database schema untuk Supabase (PostgreSQL)
--
-- CARA PAKAI:
-- 1. Buka Supabase Dashboard → SQL Editor
-- 2. Paste seluruh isi file ini → Run
--
-- Catatan keamanan:
-- Semua tabel mengaktifkan Row Level Security TANPA policy publik.
-- Artinya akses langsung dari browser (anon/authenticated key) DITOLAK.
-- Seluruh akses data dilakukan lewat backend Next.js (service role)
-- yang menerapkan authorization + ownership check di level aplikasi.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
do $$ begin
  create type public.report_status as enum
    ('ACTIVE','MATCH_FOUND','CLAIMED','VERIFICATION','HANDOVER','RETURNED','CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.claim_status as enum
    ('SUBMITTED','UNDER_VERIFICATION','APPROVED','REJECTED','HANDOVER','COMPLETED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_level as enum ('LOW','POSSIBLE','GOOD','HIGH');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_status as enum ('PENDING','COMPLETED','PARTIAL','FAILED');
exception when duplicate_object then null; end $$;

-- ---------- updated_at helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,                      -- privat, tidak pernah ditampilkan ke user lain
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile saat user register
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''),'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- lost_reports ----------
create table if not exists public.lost_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_name text not null,
  category text not null,
  color text,
  brand text,
  model text,
  material text,
  description text not null,
  unique_features text,
  location_name text not null,
  latitude double precision,
  longitude double precision,
  lost_date date not null,
  lost_time time,
  image_url text,                  -- storage path (bucket privat), nullable: foto TIDAK wajib
  status public.report_status not null default 'ACTIVE',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_lost_reports_updated on public.lost_reports;
create trigger trg_lost_reports_updated before update on public.lost_reports
for each row execute function public.set_updated_at();

create index if not exists idx_lost_reports_user on public.lost_reports(user_id);
create index if not exists idx_lost_reports_status on public.lost_reports(status);
create index if not exists idx_lost_reports_category_date on public.lost_reports(category, lost_date);

-- ---------- found_reports ----------
create table if not exists public.found_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_name text not null,
  category text not null,
  color text,
  brand text,
  model text,
  material text,
  description text not null,
  unique_features text,
  private_verification_info text not null,  -- RAHASIA: hanya untuk ownership verification
  location_name text not null,
  latitude double precision,
  longitude double precision,
  found_date date not null,
  found_time time,
  image_url text,
  status public.report_status not null default 'ACTIVE',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_found_reports_updated on public.found_reports;
create trigger trg_found_reports_updated before update on public.found_reports
for each row execute function public.set_updated_at();

create index if not exists idx_found_reports_user on public.found_reports(user_id);
create index if not exists idx_found_reports_status on public.found_reports(status);
create index if not exists idx_found_reports_category_date on public.found_reports(category, found_date);

-- ---------- report_images ----------
create table if not exists public.report_images (
  id uuid primary key default gen_random_uuid(),
  lost_report_id uuid references public.lost_reports(id) on delete cascade,
  found_report_id uuid references public.found_reports(id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'image/jpeg',
  created_at timestamptz not null default now(),
  check ((lost_report_id is null) <> (found_report_id is null))
);

create index if not exists idx_report_images_lost on public.report_images(lost_report_id);
create index if not exists idx_report_images_found on public.report_images(found_report_id);

-- ---------- ai_analysis ----------
create table if not exists public.ai_analysis (
  id uuid primary key default gen_random_uuid(),
  lost_report_id uuid references public.lost_reports(id) on delete cascade,
  found_report_id uuid references public.found_reports(id) on delete cascade,
  extraction jsonb,                -- structured attributes hasil AI (Ollama/Gemini) / fallback
  image_analysis jsonb,            -- hasil analisis foto (jika ada foto)
  embedding jsonb,                 -- vektor embedding (array float, dinormalisasi)
  embedding_model text,            -- model pembuat embedding (hanya dibandingkan dengan model sama)
  source text not null default 'fallback' check (source in ('ollama','gemini','fallback')),
  status public.ai_status not null default 'PENDING',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lost_report_id is null) <> (found_report_id is null))
);

create unique index if not exists uq_ai_analysis_lost on public.ai_analysis(lost_report_id) where lost_report_id is not null;
create unique index if not exists uq_ai_analysis_found on public.ai_analysis(found_report_id) where found_report_id is not null;

drop trigger if exists trg_ai_analysis_updated on public.ai_analysis;
create trigger trg_ai_analysis_updated before update on public.ai_analysis
for each row execute function public.set_updated_at();

-- ---------- matches ----------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  lost_report_id uuid not null references public.lost_reports(id) on delete cascade,
  found_report_id uuid not null references public.found_reports(id) on delete cascade,
  category_score numeric(5,4),
  semantic_score numeric(5,4),
  attribute_score numeric(5,4),
  unique_feature_score numeric(5,4),
  location_score numeric(5,4),
  time_score numeric(5,4),
  image_score numeric(5,4),        -- nullable: hanya jika kedua laporan punya foto
  final_score numeric(5,2) not null,
  match_level public.match_level not null,
  explanation jsonb not null default '[]'::jsonb,  -- breakdown per komponen (explainable)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lost_report_id, found_report_id)
);

create index if not exists idx_matches_lost on public.matches(lost_report_id);
create index if not exists idx_matches_found on public.matches(found_report_id);
create index if not exists idx_matches_score on public.matches(final_score desc);

drop trigger if exists trg_matches_updated on public.matches;
create trigger trg_matches_updated before update on public.matches
for each row execute function public.set_updated_at();

-- ---------- claims ----------
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  claimant_id uuid not null references public.profiles(id) on delete cascade,
  status public.claim_status not null default 'SUBMITTED',
  verification_score numeric(5,2),
  finder_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, claimant_id)
);

create index if not exists idx_claims_claimant on public.claims(claimant_id);
create index if not exists idx_claims_match on public.claims(match_id);

drop trigger if exists trg_claims_updated on public.claims;
create trigger trg_claims_updated before update on public.claims
for each row execute function public.set_updated_at();

-- ---------- claim_verifications ----------
create table if not exists public.claim_verifications (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade unique,
  answers jsonb not null default '{}'::jsonb,   -- jawaban claimant per pertanyaan
  checks jsonb not null default '[]'::jsonb,    -- hasil evaluasi per aspek (match/partial/no_match)
  score numeric(5,2),
  evaluated_by text check (evaluated_by in ('ollama','gemini','fallback')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_claim_verifications_updated on public.claim_verifications;
create trigger trg_claim_verifications_updated before update on public.claim_verifications
for each row execute function public.set_updated_at();

-- ---------- notifications ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,              -- MATCH_FOUND | CLAIM_SUBMITTED | CLAIM_VERIFIED | CLAIM_APPROVED | CLAIM_REJECTED | NEW_MESSAGE | ITEM_RETURNED | SYSTEM
  title text not null,
  body text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id, read, created_at desc);

-- ---------- conversations ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  finder_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- messages ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);

-- ---------- report_status_history ----------
create table if not exists public.report_status_history (
  id uuid primary key default gen_random_uuid(),
  lost_report_id uuid references public.lost_reports(id) on delete cascade,
  found_report_id uuid references public.found_reports(id) on delete cascade,
  status public.report_status not null,
  note text,
  created_at timestamptz not null default now(),
  check ((lost_report_id is null) <> (found_report_id is null))
);

create index if not exists idx_history_lost on public.report_status_history(lost_report_id);
create index if not exists idx_history_found on public.report_status_history(found_report_id);

-- ---------- ROW LEVEL SECURITY ----------
-- Deny-all untuk akses langsung; seluruh akses via backend service role.
alter table public.profiles enable row level security;
alter table public.lost_reports enable row level security;
alter table public.found_reports enable row level security;
alter table public.report_images enable row level security;
alter table public.ai_analysis enable row level security;
alter table public.matches enable row level security;
alter table public.claims enable row level security;
alter table public.claim_verifications enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.report_status_history enable row level security;

-- ---------- STORAGE ----------
-- Bucket privat untuk foto laporan; akses hanya lewat signed URL dari backend.
insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', false)
on conflict (id) do nothing;
