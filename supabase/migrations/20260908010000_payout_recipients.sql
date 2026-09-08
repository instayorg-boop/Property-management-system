-- Online payments via Lenco: a cached bank list and per-property payout recipients.
--
-- `banks` is a shared reference table (Lenco's bank list, same for every property) — written only
-- by the `sync-lenco-banks` edge function (service-role key, bypasses RLS), readable by any signed-in
-- user so the Settings page can populate the bank picker from the local cache instead of a live call.
--
-- `payout_recipients` follows the same `property_id`-scoped convention as every other table (see
-- `20260907020000_auth_and_onboarding.sql`) rather than a `landlord_id` FK — this app has no
-- separate landlords/users table; ownership already flows through `properties.owner_id`.
--
-- Run via `supabase db push`, or paste into the Supabase SQL editor.

create table if not exists public.banks (
  code text primary key,
  name text not null,
  logo_url text
);

create table if not exists public.payout_recipients (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  lenco_recipient_id text not null,
  account_name text not null,
  account_number text not null,
  bank_code text not null references public.banks(code),
  created_at timestamptz not null default now()
);

create index if not exists payout_recipients_property_id_idx on public.payout_recipients(property_id);

-- --- RLS: banks --------------------------------------------------------------
-- Shared reference data — every signed-in user can read it, nobody writes to it from the client
-- (only the sync-lenco-banks edge function does, via the service-role key which bypasses RLS).

drop policy if exists "banks_select" on public.banks;
alter table public.banks enable row level security;
create policy "banks_select" on public.banks for select using (auth.uid() is not null);

-- --- RLS: payout_recipients ----------------------------------------------------

drop policy if exists "payout_recipients_select" on public.payout_recipients;
drop policy if exists "payout_recipients_insert" on public.payout_recipients;
drop policy if exists "payout_recipients_update" on public.payout_recipients;
drop policy if exists "payout_recipients_delete" on public.payout_recipients;

alter table public.payout_recipients enable row level security;

create policy "payout_recipients_select" on public.payout_recipients for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "payout_recipients_insert" on public.payout_recipients for insert
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "payout_recipients_update" on public.payout_recipients for update
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "payout_recipients_delete" on public.payout_recipients for delete
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
