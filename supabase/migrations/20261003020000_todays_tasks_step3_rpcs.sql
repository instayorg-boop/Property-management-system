-- Today's Tasks, step 3: the functions the dashboard actually calls.
--
-- All three are SECURITY INVOKER (the default) on purpose. RLS on public.tasks already scopes
-- every row to the property's owner, so the caller's own identity is the access check — no
-- ownership logic to duplicate here, and no way for one landlord to read another's tasks by
-- passing a different property_id. This is the opposite of the detect_* functions, which are
-- SECURITY DEFINER and therefore have EXECUTE revoked from every client role.

create or replace function public.get_today_tasks(p_property_id uuid)
returns jsonb language sql stable set search_path = public as $$
  with open_tasks as (
    select *,
           -- High first, then medium, then low; score orders within each band.
           row_number() over (
             order by case priority when 'high' then 0 when 'medium' then 1 else 2 end,
                      score desc, created_at
           ) as rn
    from public.tasks
    where property_id = p_property_id and status = 'open'
  ),
  -- Every high task shows, however many there are — a landlord should never have a genuine
  -- emergency hidden behind "see all". Medium and low fill the rest of the first five.
  top as (
    select * from open_tasks where priority = 'high' or rn <= 5 order by rn
  )
  select jsonb_build_object(
    'top', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'type', t.type,
        'priority', t.priority,
        'score', t.score,
        'title', coalesce(t.ai_title, t.fallback_title),
        'ai_written', t.ai_title is not null,
        'facts', t.facts,
        'action_type', t.action_type,
        'action_target_id', t.action_target_id
      ) order by t.rn) from top t
    ), '[]'::jsonb),
    'all_counts', jsonb_build_object(
      'all',    (select count(*) from open_tasks),
      'high',   (select count(*) from open_tasks where priority = 'high'),
      'medium', (select count(*) from open_tasks where priority = 'medium'),
      'low',    (select count(*) from open_tasks where priority = 'low')
    ),
    'done_today', (
      select count(*) from public.tasks
      where property_id = p_property_id and status = 'done'
        and (resolved_at at time zone 'Africa/Lusaka')::date
            = (now() at time zone 'Africa/Lusaka')::date
    ),
    'briefing', (
      select b.text from public.task_briefings b
      where b.property_id = p_property_id
        and b.date = (now() at time zone 'Africa/Lusaka')::date
    ),
    'refreshed_at', (
      select max(updated_at) from public.tasks where property_id = p_property_id
    )
  );
$$;

-- The full open list for the "See all" view, same row shape as `top` above.
create or replace function public.get_all_open_tasks(p_property_id uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'type', t.type,
    'priority', t.priority,
    'score', t.score,
    'title', coalesce(t.ai_title, t.fallback_title),
    'ai_written', t.ai_title is not null,
    'facts', t.facts,
    'action_type', t.action_type,
    'action_target_id', t.action_target_id
  ) order by case t.priority when 'high' then 0 when 'medium' then 1 else 2 end,
             t.score desc, t.created_at), '[]'::jsonb)
  from public.tasks t
  where t.property_id = p_property_id and t.status = 'open';
$$;

create or replace function public.set_task_status(
  p_task_id uuid,
  p_status text,
  p_snooze_days int default 3
)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_row public.tasks;
begin
  -- Only the three a person can actually choose. 'auto_resolved' is the system's to set, never a
  -- client's, so it is rejected here rather than silently accepted.
  if p_status not in ('open', 'done', 'snoozed') then
    raise exception 'set_task_status: status must be open, done or snoozed (got %)', p_status;
  end if;

  update public.tasks t
     set status = p_status,
         resolved_at   = case when p_status = 'done' then now() else null end,
         snoozed_until = case when p_status = 'snoozed'
                              then now() + make_interval(days => greatest(p_snooze_days, 1))
                              else null end
   where t.id = p_task_id
   returning t.* into v_row;

  -- RLS makes another owner's task simply invisible, so "no row" covers both missing and
  -- not-yours. The client shows the same "couldn't update" either way.
  if v_row.id is null then
    raise exception 'set_task_status: task not found';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'snoozed_until', v_row.snoozed_until,
    'resolved_at', v_row.resolved_at
  );
end;
$$;

revoke execute on function public.get_today_tasks(uuid) from public, anon;
revoke execute on function public.get_all_open_tasks(uuid) from public, anon;
revoke execute on function public.set_task_status(uuid, text, int) from public, anon;
grant execute on function public.get_today_tasks(uuid) to authenticated;
grant execute on function public.get_all_open_tasks(uuid) to authenticated;
grant execute on function public.set_task_status(uuid, text, int) to authenticated;
