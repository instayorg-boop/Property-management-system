-- Payout history — one row per attempted transfer to a landlord's bank account via Lenco.
-- Created by the (soon to be real) `lenco-payout` edge function, and updated by `lenco-webhook`
-- once Lenco confirms the transfer settled or failed. Follows the same property_id-scoped
-- convention as every other table (see 20260907020000_auth_and_onboarding.sql).

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  payout_recipient_id uuid not null references public.payout_recipients(id) on delete restrict,
  amount numeric not null,
  currency text not null default 'ZMW',
  status text not null default 'pending' check (status in ('pending', 'processing', 'successful', 'failed')),
  lenco_transaction_id text,
  narration text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payouts_property_id_idx on public.payouts(property_id);
create index if not exists payouts_lenco_transaction_id_idx on public.payouts(lenco_transaction_id);

drop policy if exists "payouts_select" on public.payouts;
drop policy if exists "payouts_insert" on public.payouts;
drop policy if exists "payouts_update" on public.payouts;
drop policy if exists "payouts_delete" on public.payouts;

alter table public.payouts enable row level security;

create policy "payouts_select" on public.payouts for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "payouts_insert" on public.payouts for insert
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "payouts_update" on public.payouts for update
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "payouts_delete" on public.payouts for delete
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
