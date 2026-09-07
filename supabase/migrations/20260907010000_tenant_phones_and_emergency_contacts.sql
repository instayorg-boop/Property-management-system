-- Adds real multi-phone and multi-emergency-contact support for tenants, replacing the
-- single phone/guardian_name/guardian_phone fields the app used to be limited to.
--
-- Additive only — the old `phone`, `guardian_name`, `guardian_phone` columns are left in place
-- (untouched, not dropped) and backfilled into the new columns below. The app no longer reads or
-- writes them after this migration, but nothing about existing data is destroyed.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query), or via
-- `supabase db push` with this file under supabase/migrations.

alter table public.tenants
  add column if not exists phones text[] not null default '{}',
  add column if not exists emergency_contacts jsonb not null default '[]';

-- Backfill: fold the old single phone into the new array.
update public.tenants
set phones = array[phone]
where phones = '{}' and phone is not null and phone <> '';

-- Backfill: turn the old single guardian into a one-contact emergency_contacts array.
-- `id` is generated here so existing rows get a stable id the first time they're loaded, matching
-- what the app itself generates for new contacts (crypto.randomUUID()).
update public.tenants
set emergency_contacts = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', coalesce(guardian_name, ''),
    'relation', 'Guardian',
    'phones', case when guardian_phone is not null and guardian_phone <> '' then jsonb_build_array(guardian_phone) else '[]'::jsonb end
  )
)
where emergency_contacts = '[]'::jsonb
  and (coalesce(guardian_name, '') <> '' or coalesce(guardian_phone, '') <> '');

-- RLS: `tenants` already has a permissive policy (see docs/BACKEND.md), so these new columns
-- don't need a new policy — they're covered by the existing one.
