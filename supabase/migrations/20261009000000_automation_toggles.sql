-- "Fully customizable" pass: turn automatic behaviors that always ran into per-property on/off
-- toggles, following the same settings-table-boolean pattern as invoices_on/send_onboarding_sms.
-- All default true so no existing property's behavior changes until a landlord opts out.

alter table public.settings
  add column if not exists escalation_enabled boolean not null default true,
  add column if not exists pre_due_reminders_enabled boolean not null default true,
  add column if not exists task_overdue_rent_enabled boolean not null default true,
  add column if not exists task_stale_maintenance_enabled boolean not null default true,
  add column if not exists task_collections_target_enabled boolean not null default true;

-- Gate detect_overdue_rent on task_overdue_rent_enabled (settings already joined here).
create or replace function public.detect_overdue_rent(p_property_id uuid)
returns table (
  key text, type text, score int, facts jsonb,
  fallback_title text, action_type text, action_target_id uuid
)
language sql stable security definer set search_path = public as $$
  select
    'overdue:' || t.id || ':' || to_char(now() at time zone 'Africa/Lusaka', 'YYYY-MM') as key,
    'overdue_rent' as type,
    (80
      + least(greatest(coalesce(t.days_overdue, 0) - 14, 0), 15)
      + case when t.owed_amount > 2000 then 5 else 0 end)::int as score,
    jsonb_build_object(
      'tenant_name', t.name,
      'first_name', split_part(t.name, ' ', 1),
      'room', r.number,
      'amount', round(t.owed_amount),
      'days_overdue', coalesce(t.days_overdue, 0)
    ) as facts,
    t.name || ' owes ' || public.task_kwacha(t.owed_amount)
      || ', ' || coalesce(t.days_overdue, 0) || ' days overdue' as fallback_title,
    'tenant_profile' as action_type,
    t.id as action_target_id
  from public.tenants t
  left join public.rooms r on r.id = t.room_id
  left join public.settings s on s.property_id = t.property_id
  where t.property_id = p_property_id
    and t.active
    and t.owed_amount > 0
    and coalesce(t.days_overdue, 0) > coalesce(s.grace_period_days, 0)
    and coalesce(s.task_overdue_rent_enabled, true);
$$;

-- Gate detect_stale_maintenance on task_stale_maintenance_enabled (no settings join existed here before).
create or replace function public.detect_stale_maintenance(p_property_id uuid)
returns table (
  key text, type text, score int, facts jsonb,
  fallback_title text, action_type text, action_target_id uuid
)
language sql stable security definer set search_path = public as $$
  with aged as (
    select
      m.*,
      (now()::date - m.submitted_at::date) as days_open,
      case when m.status = 'open' then 3 else 7 end as threshold
    from public.maintenance_reports m
    left join public.settings s on s.property_id = m.property_id
    where m.property_id = p_property_id
      and m.status in ('open', 'in-progress')
      and coalesce(s.task_stale_maintenance_enabled, true)
  )
  select
    'maint:' || a.id as key,
    'stale_maintenance' as type,
    ((case when a.status = 'open' then 70 else 55 end)
      + least((a.days_open - a.threshold) * 2, 15))::int as score,
    jsonb_build_object(
      'location', a.location,
      'description', a.description,
      'status', a.status,
      'days_open', a.days_open
    ) as facts,
    a.location || ' ' || lower(coalesce(nullif(split_part(a.description, '.', 1), ''), 'issue'))
      || ' — ' || (case when a.status = 'open' then 'unopened' else 'in progress' end)
      || ' for ' || a.days_open || ' days' as fallback_title,
    'maintenance_report' as action_type,
    a.id as action_target_id
  from aged a
  where a.days_open > a.threshold;
$$;

-- Gate detect_collections_below_target on task_collections_target_enabled.
create or replace function public.detect_collections_below_target(p_property_id uuid)
returns table (
  key text, type text, score int, facts jsonb,
  fallback_title text, action_type text, action_target_id uuid
)
language sql stable security definer set search_path = public as $$
  with tally as (
    select
      count(*) filter (where t.active) as active_tenants,
      count(*) filter (where t.active and t.owed_amount <= 0) as paid_up,
      coalesce(max(s.collection_target_pct), 0) as target_pct,
      bool_and(coalesce(s.task_collections_target_enabled, true)) as enabled
    from public.tenants t
    left join public.settings s on s.property_id = t.property_id
    where t.property_id = p_property_id
  ), pct as (
    select
      active_tenants, paid_up, target_pct, enabled,
      case when active_tenants = 0 then 0
           else round(paid_up * 100.0 / active_tenants) end as collected_pct
    from tally
  )
  select
    'collections:' || p_property_id || ':' || to_char(now() at time zone 'Africa/Lusaka', 'YYYY-MM') as key,
    'collections_below_target' as type,
    70 as score,
    jsonb_build_object(
      'collected_pct', collected_pct,
      'target_pct', round(target_pct),
      'paid_up', paid_up,
      'active_tenants', active_tenants
    ) as facts,
    'Collections at ' || collected_pct || '% against a ' || round(target_pct) || '% target' as fallback_title,
    'collections' as action_type,
    null::uuid as action_target_id
  from pct
  where active_tenants > 0 and collected_pct < target_pct and coalesce(enabled, true);
$$;
