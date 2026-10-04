-- Today's Tasks, step 2: priority mapping, sync_tasks, the daily cron, and a correction to
-- detect_overdue_rent.

-- Score to priority in one place, so the bands can be retuned without touching a detector.
create or replace function public.task_priority(p_score int)
returns text language sql immutable set search_path = public as $$
  select case when p_score >= 70 then 'high'
              when p_score >= 40 then 'medium'
              else 'low' end;
$$;
revoke execute on function public.task_priority(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- detect_overdue_rent, corrected.
--
-- The step 1 version read tenants.days_overdue. That column is a CACHE written by
-- sync_tenant_balance (20260920000000_phase3e_balance_sync_foundation.sql) and it can sit stale:
-- Bupe Chola read days_overdue = 0 while her ledger showed September rent unpaid with a grace
-- period that ended 23 days earlier. Trusting the cache silently dropped the most important task
-- on the board — the failure mode is invisible, which is the worst kind.
--
-- The days are now derived here from the ledger, using the SAME rule sync_tenant_balance
-- documents: the current open charge (most recently due, non-voided, balance-affecting, not fully
-- paid), counted from its grace_period_end. The cached column is a fallback only for a tenant with
-- no ledger rows at all.
--
-- owed_amount is deliberately still the money shown. It is what the Rent page and every other
-- screen displays, and a task quoting a different figure than the tenant's own profile would be
-- worse than one quoting a stale figure.
create or replace function public.detect_overdue_rent(p_property_id uuid)
returns table (
  key text, type text, score int, facts jsonb,
  fallback_title text, action_type text, action_target_id uuid
)
language sql stable security definer set search_path = public as $$
  with open_charge as (
    select distinct on (l.tenant_id)
      l.tenant_id, l.grace_period_end, l.period
    from public.ledger_entries l
    where l.voided_at is null
      and l.affects_balance
      and l.due_date is not null
      and coalesce(l.paid_amount, 0) < l.amount
    order by l.tenant_id, l.due_date desc
  )
  select
    'overdue:' || t.id || ':' || to_char(now() at time zone 'Africa/Lusaka', 'YYYY-MM') as key,
    'overdue_rent' as type,
    (80
      + least(greatest(od.days_overdue - 14, 0), 15)
      + case when t.owed_amount > 2000 then 5 else 0 end)::int as score,
    jsonb_build_object(
      'tenant_name', t.name,
      'first_name', split_part(t.name, ' ', 1),
      'room', r.number,
      'amount', round(t.owed_amount),
      'days_overdue', od.days_overdue,
      'period', oc.period,
      -- The dashboard deep-links a tenant profile by portal_token (/tenants/:code — see Rent.tsx),
      -- not by uuid. action_target_id stays the uuid: that is the durable identifier, the token is
      -- only how this app happens to route.
      'route_token', t.portal_token,
      'has_guardian', (t.guardian_phone is not null and t.guardian_phone <> '')
    ) as facts,
    t.name || ' owes ' || public.task_kwacha(t.owed_amount)
      || ', ' || od.days_overdue || ' days overdue' as fallback_title,
    'tenant_profile' as action_type,
    t.id as action_target_id
  from public.tenants t
  left join public.rooms r on r.id = t.room_id
  left join public.settings s on s.property_id = t.property_id
  left join open_charge oc on oc.tenant_id = t.id
  cross join lateral (
    select case
      when oc.grace_period_end is not null
        then greatest(0, (now() at time zone 'Africa/Lusaka')::date - oc.grace_period_end)
      else coalesce(t.days_overdue, 0)
    end as days_overdue
  ) od
  where t.property_id = p_property_id
    and t.active
    and t.owed_amount > 0
    and od.days_overdue > coalesce(s.grace_period_days, 0);
$$;
revoke execute on function public.detect_overdue_rent(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- sync_tasks: reconcile the tasks table against what the detectors currently say.
--
-- Idempotent by construction — running it twice in a row writes nothing the second time, because
-- the upsert's WHERE clause skips rows whose facts_hash is unchanged. That matters: updated_at
-- drives "refreshed at" in the UI, and every trigger-driven call would otherwise churn it.
-- ---------------------------------------------------------------------------------------------
create or replace function public.sync_tasks(p_property_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_changed int := 0;
begin
  create temp table _detected on commit drop as
    select * from public.detect_overdue_rent(p_property_id)
    union all select * from public.detect_stale_maintenance(p_property_id)
    union all select * from public.detect_collections_below_target(p_property_id);

  -- 1. A snooze that has run out is just an open task again. Done before the upsert so a task
  --    waking up this run is also re-scored by it.
  update public.tasks
     set status = 'open', snoozed_until = null
   where property_id = p_property_id
     and status = 'snoozed'
     and snoozed_until is not null
     and snoozed_until <= now();

  -- 2. Insert new keys; refresh existing ones only when the underlying facts actually moved.
  --    A task the landlord marked done stays done — the key carries the billing period, so next
  --    month's version of the same problem arrives as a genuinely new row.
  insert into public.tasks (
    property_id, key, type, priority, score, facts, facts_hash,
    fallback_title, action_type, action_target_id, status
  )
  select
    p_property_id, d.key, d.type, public.task_priority(d.score), d.score,
    d.facts, md5(d.facts::text), d.fallback_title, d.action_type, d.action_target_id, 'open'
  from _detected d
  on conflict (property_id, key) do update set
    facts            = excluded.facts,
    facts_hash       = excluded.facts_hash,
    score            = excluded.score,
    priority         = excluded.priority,
    fallback_title   = excluded.fallback_title,
    action_type      = excluded.action_type,
    action_target_id = excluded.action_target_id,
    -- Facts changed means the wording is now describing the wrong numbers. Drop it and let
    -- task-wording rewrite it; until then the UI falls back to fallback_title.
    ai_title = case when public.tasks.facts_hash is distinct from excluded.facts_hash
                    then null else public.tasks.ai_title end,
    -- Something auto-resolved that is firing again is a live problem once more.
    status = case when public.tasks.status = 'auto_resolved' then 'open' else public.tasks.status end,
    resolved_at = case when public.tasks.status = 'auto_resolved' then null else public.tasks.resolved_at end
  where public.tasks.facts_hash is distinct from excluded.facts_hash
     or public.tasks.status = 'auto_resolved';

  get diagnostics v_changed = row_count;

  -- 3. Anything open or snoozed that no detector raised this run has been dealt with in the real
  --    world — a tenant paid, a drain got fixed. It disappears on its own.
  update public.tasks
     set status = 'auto_resolved', resolved_at = now()
   where property_id = p_property_id
     and status in ('open', 'snoozed')
     and key not in (select key from _detected);

  drop table _detected;
  return v_changed;
end;
$$;
revoke execute on function public.sync_tasks(uuid) from public, anon, authenticated;

create or replace function public.sync_all_tasks()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_property record;
  v_total int := 0;
begin
  for v_property in select id from public.properties loop
    -- One property failing (bad data, a null nobody expected) must not stop the rest.
    begin
      v_total := v_total + public.sync_tasks(v_property.id);
    exception when others then
      raise warning 'sync_tasks failed for property %: %', v_property.id, sqlerrm;
    end;
  end loop;
  return v_total;
end;
$$;
revoke execute on function public.sync_all_tasks() from public, anon, authenticated;

-- 05:30 Africa/Lusaka = 03:30 UTC (Zambia is UTC+2 year round, no DST).
select cron.unschedule('sync-tasks-daily') where exists (
  select 1 from cron.job where jobname = 'sync-tasks-daily'
);
select cron.schedule('sync-tasks-daily', '30 3 * * *', $cron$select public.sync_all_tasks()$cron$);
