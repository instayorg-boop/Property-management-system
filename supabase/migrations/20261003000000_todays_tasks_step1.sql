-- Today's Tasks, step 1: storage + the first three detectors.
--
-- The database decides what a task IS — which ones exist, how they rank, when they resolve.
-- Gemini (added in a later step) only ever rewrites fallback_title into friendlier wording; it
-- never invents a task, a priority or a number.
--
-- Real column values this was written against (checked, not assumed):
--   maintenance_reports.status  open | in-progress | resolved
--   tenants.status              paid | overdue | unpaid | partial
--   tenants.deposit_status      Not collected | Held | Refunded | Forfeited | Partially refunded
--   ledger_entries.status       the four above, plus NULL for adjustment rows

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  -- Stable identity for "this exact problem", e.g. overdue:<tenant_id>:2026-09. A new billing
  -- period yields a new key, which is what lets a task the landlord already ticked off stay done
  -- while the same underlying situation can legitimately raise a fresh task next month.
  key text not null,
  type text not null,
  priority text not null check (priority in ('high','medium','low')),
  score int not null,
  -- The exact numbers and names behind the task. This is the ONLY thing sent to Gemini, and every
  -- number in an AI-written title must be traceable back to it.
  facts jsonb not null default '{}'::jsonb,
  facts_hash text not null,
  ai_title text,
  fallback_title text not null,
  action_type text,
  action_target_id uuid,
  status text not null default 'open' check (status in ('open','done','snoozed','auto_resolved')),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (property_id, key)
);

create index if not exists tasks_property_status_score_idx
  on public.tasks (property_id, status, score desc);
-- Serves the "wake snoozed tasks whose time has come" pass in sync_tasks.
create index if not exists tasks_snoozed_until_idx
  on public.tasks (snoozed_until) where status = 'snoozed';
-- Serves task-wording's "open tasks still needing a title" query.
create index if not exists tasks_needs_wording_idx
  on public.tasks (property_id) where status = 'open' and ai_title is null;

create table if not exists public.task_briefings (
  property_id uuid not null references public.properties(id) on delete cascade,
  date date not null,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (property_id, date)
);

create or replace function public.tasks_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.tasks_touch_updated_at();

-- RLS: same shape as every other property-scoped table here (see settings_*, maintenance_reports_*).
alter table public.tasks enable row level security;
alter table public.task_briefings enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete
  using (property_id in (select id from public.properties where owner_id = auth.uid()));

drop policy if exists task_briefings_select on public.task_briefings;
create policy task_briefings_select on public.task_briefings for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
drop policy if exists task_briefings_insert on public.task_briefings;
create policy task_briefings_insert on public.task_briefings for insert
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));
drop policy if exists task_briefings_update on public.task_briefings;
create policy task_briefings_update on public.task_briefings for update
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
drop policy if exists task_briefings_delete on public.task_briefings;
create policy task_briefings_delete on public.task_briefings for delete
  using (property_id in (select id from public.properties where owner_id = auth.uid()));

-- Kwacha, the way the app writes it everywhere else: K2,100 — no decimals on whole amounts.
create or replace function public.task_kwacha(amount numeric)
returns text language sql immutable set search_path = public as $$
  select 'K' || trim(to_char(round(amount), 'FM999,999,999'));
$$;

-- ---------------------------------------------------------------------------------------------
-- Detectors. Each returns the same row shape so sync_tasks can union them blindly.
--
-- SECURITY DEFINER with a pinned search_path: sync_tasks runs from pg_cron, where there is no
-- auth.uid() and RLS on the source tables would otherwise return nothing. EXECUTE is revoked from
-- every client role at the bottom of this file — see the note there, it matters.
-- ---------------------------------------------------------------------------------------------

create or replace function public.detect_overdue_rent(p_property_id uuid)
returns table (
  key text, type text, score int, facts jsonb,
  fallback_title text, action_type text, action_target_id uuid
)
language sql stable security definer set search_path = public as $$
  select
    'overdue:' || t.id || ':' || to_char(now() at time zone 'Africa/Lusaka', 'YYYY-MM') as key,
    'overdue_rent' as type,
    -- 80 base, +1 per day past 14 (cap +15), +5 when more than K2,000 is outstanding.
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
    -- Past the grace period the property actually configured, not a hardcoded one.
    and coalesce(t.days_overdue, 0) > coalesce(s.grace_period_days, 0);
$$;

-- Staleness is measured from submitted_at for BOTH branches, not updated_at: the question a
-- landlord needs answering is "how long has this tenant been waiting", and updated_at moves on
-- every incidental edit, which would silently reset the clock on a request nobody is fixing.
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
    where m.property_id = p_property_id
      and m.status in ('open', 'in-progress')
  )
  select
    'maint:' || a.id as key,
    'stale_maintenance' as type,
    -- 70 open / 55 in-progress, +2 per day beyond the threshold, capped at +15.
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
      coalesce(max(s.collection_target_pct), 0) as target_pct
    from public.tenants t
    left join public.settings s on s.property_id = t.property_id
    where t.property_id = p_property_id
  ), pct as (
    select
      active_tenants, paid_up, target_pct,
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
  -- A property with no active tenants has nothing to collect; 0% there is not a problem.
  where active_tenants > 0 and collected_pct < target_pct;
$$;

-- These are SECURITY DEFINER, so they read straight past RLS. PostgREST exposes every public
-- function as /rest/v1/rpc/<name>, and the default EXECUTE grant reaches `authenticated` — which
-- would let any signed-in landlord call detect_overdue_rent with someone else's property_id and
-- read that owner's tenant names and balances. They are internals for sync_tasks, never a client
-- API, so EXECUTE comes off every client role.
revoke execute on function public.detect_overdue_rent(uuid) from public, anon, authenticated;
revoke execute on function public.detect_stale_maintenance(uuid) from public, anon, authenticated;
revoke execute on function public.detect_collections_below_target(uuid) from public, anon, authenticated;
revoke execute on function public.task_kwacha(numeric) from public, anon, authenticated;
