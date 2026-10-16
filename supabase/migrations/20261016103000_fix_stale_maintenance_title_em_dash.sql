-- The fallback_title for a stale-maintenance task used a literal em dash to join the
-- description clause to the "unopened/in progress" clause (e.g. "wardrobe door came off
-- its hinge — unopened for 8 days"). Replace it with a comma, matching every other
-- fallback_title in this file, which already joins clauses with ', '.
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
      || ', ' || (case when a.status = 'open' then 'unopened' else 'in progress' end)
      || ' for ' || a.days_open || ' days' as fallback_title,
    'maintenance_report' as action_type,
    a.id as action_target_id
  from aged a
  where a.days_open > a.threshold;
$$;

-- One-time backfill: rows synced before this fix still carry the em dash in their stored
-- fallback_title (the daily sync only rewrites a row when its facts_hash changes, which
-- won't happen again until days_open ticks over), so patch them directly.
update public.tasks
set fallback_title = replace(fallback_title, ' — ', ', ')
where fallback_title like '%—%';
