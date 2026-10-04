-- Automatic late fees were always derived live (see invoiceUtils.ts's calcLatePenalty: daysOverdue
-- x (rent / days-in-month)) with no way for a landlord to choose a different calculation, and the
-- formula is duplicated by hand in pay-portal-collect-payment/index.ts since that edge function
-- can't import frontend code. This makes the calculation configurable per property — fixed amount
-- per day, a percentage of rent per day, or the existing prorated-rent-per-day default — plus an
-- optional cap, and exposes the chosen mode through pay_portal_get_property so the portal and the
-- collect-payment function compute the exact same number the landlord configured instead of always
-- assuming prorated-rent.
--
-- daily_penalty_rate already existed (added for a "fixed K/day" rate that nothing ever read) — reused
-- here as the fixed-mode amount rather than adding a parallel column.

alter table public.settings
  add column if not exists late_fee_enabled boolean not null default true,
  add column if not exists late_fee_mode text not null default 'prorated_rent',
  add column if not exists late_fee_percent numeric not null default 1,
  add column if not exists late_fee_cap_enabled boolean not null default false,
  add column if not exists late_fee_cap_amount numeric;

alter table public.settings
  add constraint settings_late_fee_mode_check
  check (late_fee_mode in ('fixed', 'percent_of_rent', 'prorated_rent'));

comment on column public.settings.late_fee_enabled is 'Whether this property charges automatic late fees at all. Off means days_overdue never produces a fee, regardless of mode.';
comment on column public.settings.late_fee_mode is
  'How the automatic late fee accrues once a charge is overdue: fixed = daily_penalty_rate per day; percent_of_rent = late_fee_percent% of rent per day; prorated_rent = rent / days-in-month per day (the original, still the default).';
comment on column public.settings.late_fee_percent is 'Percent of rent charged per day overdue, only used when late_fee_mode = percent_of_rent.';
comment on column public.settings.late_fee_cap_enabled is 'Whether accrued late fees stop growing once they reach late_fee_cap_amount.';
comment on column public.settings.late_fee_cap_amount is 'Max total accrued late fee, only enforced when late_fee_cap_enabled is true.';

-- pay_portal_get_property's return shape is changing, so it must be dropped and recreated (CREATE OR
-- REPLACE can't change OUT columns).
drop function if exists public.pay_portal_get_property(text);

create function public.pay_portal_get_property(p_property_slug text)
returns table(
  id uuid,
  name text,
  due_day integer,
  logo_url text,
  late_fee_enabled boolean,
  late_fee_mode text,
  daily_penalty_rate numeric,
  late_fee_percent numeric,
  late_fee_cap_enabled boolean,
  late_fee_cap_amount numeric
)
language sql
stable security definer
set search_path to ''
as $$
  select p.id, p.name, s.due_day, p.logo_url,
    coalesce(s.late_fee_enabled, true),
    coalesce(s.late_fee_mode, 'prorated_rent'),
    s.daily_penalty_rate,
    coalesce(s.late_fee_percent, 1),
    coalesce(s.late_fee_cap_enabled, false),
    s.late_fee_cap_amount
  from public.properties p
  left join public.settings s on s.property_id = p.id
  where p.slug = p_property_slug;
$$;

grant execute on function public.pay_portal_get_property(text) to anon, authenticated;
