-- ============================================================
-- TEMUIN — Migration 0003: dukungan provider AI Ollama (server AI kampus)
--
-- Dijalankan SETELAH schema.sql dan 0002. Non-destruktif & idempotent.
--
-- CARA PAKAI:
-- Supabase Dashboard → SQL Editor → paste isi file ini → Run.
-- ============================================================

-- Nama model pembuat embedding: embedding dari model berbeda tidak
-- sebanding, jadi matching engine hanya membandingkan model yang sama.
alter table public.ai_analysis
  add column if not exists embedding_model text;

-- Embedding lama dibuat oleh Gemini.
update public.ai_analysis
  set embedding_model = 'gemini-embedding-001'
  where embedding is not null and embedding_model is null;

-- Izinkan 'ollama' sebagai sumber hasil AI.
alter table public.ai_analysis
  drop constraint if exists ai_analysis_source_check;
alter table public.ai_analysis
  add constraint ai_analysis_source_check
  check (source in ('ollama', 'gemini', 'fallback'));

alter table public.claim_verifications
  drop constraint if exists claim_verifications_evaluated_by_check;
alter table public.claim_verifications
  add constraint claim_verifications_evaluated_by_check
  check (evaluated_by in ('ollama', 'gemini', 'fallback'));
