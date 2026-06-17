create extension if not exists pgcrypto;

create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_name text not null,
  overall_grade text not null,
  overall_score numeric not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists analysis_reports_subject_idx
  on public.analysis_reports (subject_type, subject_name, created_at desc);

alter table public.analysis_reports enable row level security;

drop policy if exists "read reports" on public.analysis_reports;
create policy "read reports"
  on public.analysis_reports
  for select
  using (true);

drop policy if exists "service role writes reports" on public.analysis_reports;
create policy "service role writes reports"
  on public.analysis_reports
  for insert
  with check (auth.role() = 'service_role');
