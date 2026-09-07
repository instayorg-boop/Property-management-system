-- Adds the columns the frontend now expects for previously-hardcoded Settings fields:
-- property type, scheduled payout day, subscription plan/renewal, account email.
--
-- Safe to run more than once (all guarded with IF NOT EXISTS). Run this in the Supabase
-- SQL editor (Dashboard -> SQL Editor -> New query) against the instayHomes project, or via
-- the CLI: supabase db push --project-ref <ref>  (after placing this file under supabase/migrations).

alter table public.properties
  add column if not exists property_type text;

alter table public.settings
  add column if not exists payout_day text not null default 'Friday',
  add column if not exists account_email text,
  add column if not exists subscription_plan text default 'Pro',
  add column if not exists subscription_renews_at date;

-- RLS: these are plain columns on tables that already have permissive RLS policies
-- (see docs/BACKEND.md — "Row-Level Security is on but permissive"), so no new policy
-- is needed here. When real auth lands, these columns get locked down along with
-- everything else on `properties`/`settings`.
