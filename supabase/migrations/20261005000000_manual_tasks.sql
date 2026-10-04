-- Manual tasks — a landlord adding their own to-do ("call the electrician", "renew insurance")
-- alongside the auto-detected ones (overdue rent, stale maintenance, ...). These are just rows in
-- the same public.tasks table (get_today_tasks/get_all_open_tasks already select every open row
-- regardless of type, and set_task_status already updates by id — nothing there needs to change),
-- inserted directly by the client since the existing tasks_insert RLS policy already scopes to the
-- caller's own property.
--
-- The one real hazard: sync_tasks' step 3 marks any open/snoozed row auto_resolved if its key isn't
-- in the current detector run's output — a manual task's key was never going to be in there, so the
-- very next daily sync would silently close every manual task. `source` distinguishes the two so
-- that sweep only ever touches rows the detectors actually own.
alter table public.tasks
  add column if not exists source text not null default 'detector' check (source in ('detector', 'manual'));

create or replace function public.sync_tasks(p_property_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_changed int := 0;
begin
  create temp table _detected on commit drop as
    select * from public.detect_overdue_rent(p_property_id)
    union all select * from public.detect_stale_maintenance(p_property_id)
    union all select * from public.detect_collections_below_target(p_property_id);

  update public.tasks
     set status = 'open', snoozed_until = null
   where property_id = p_property_id
     and status = 'snoozed'
     and snoozed_until is not null
     and snoozed_until <= now();

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
    ai_title = case when public.tasks.facts_hash is distinct from excluded.facts_hash
                    then null else public.tasks.ai_title end,
    status = case when public.tasks.status = 'auto_resolved' then 'open' else public.tasks.status end,
    resolved_at = case when public.tasks.status = 'auto_resolved' then null else public.tasks.resolved_at end
  where public.tasks.facts_hash is distinct from excluded.facts_hash
     or public.tasks.status = 'auto_resolved';

  get diagnostics v_changed = row_count;

  -- Only detector-owned rows get swept — a manual task with no matching detector key is not "gone
  -- from the real world", it just isn't something any detector was ever going to produce.
  update public.tasks
     set status = 'auto_resolved', resolved_at = now()
   where property_id = p_property_id
     and status in ('open', 'snoozed')
     and source = 'detector'
     and key not in (select key from _detected);

  drop table _detected;
  return v_changed;
end;
$$;
revoke execute on function public.sync_tasks(uuid) from public, anon, authenticated;
