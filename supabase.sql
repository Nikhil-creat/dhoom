-- Run once in Supabase → SQL Editor → New query → Run
create table if not exists public.dhoom_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
-- Lock the table: no public policies, so the anon/publishable key can NOT read it.
-- Only your server (service_role / secret key) can, because it bypasses RLS.
alter table public.dhoom_state enable row level security;
