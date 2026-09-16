-- Phase 3E — fixes an ambiguous-column bug in void_ledger_entry (20260921000000), found by
-- actually executing it against the live database: its `returns table (id uuid, ...)` declares
-- `id` as an implicit PL/pgSQL variable for the whole function body, which collides with the
-- function's own `where id = p_id` inside its final UPDATE — Postgres can't tell whether `id`
-- means that output variable or ledger_entries.id (error 42702). Renaming the output column to
-- `entry_id` removes the collision; every other detail (guard logic, locking, security, grants)
-- is unchanged from 20260921000000, which is left as-is per instruction — this migration replaces
-- the function it defined, it does not edit that file.
--
-- `create or replace function` cannot change a function's return type (including a `returns
-- table` column rename), so the old signature must be dropped first.
drop function if exists public.void_ledger_entry(uuid, text);

create or replace function public.void_ledger_entry(p_id uuid, p_reason text)
returns table (entry_id uuid, voided boolean, refusal_reason text)
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_event_type text;
  v_has_active_links boolean;
begin
  select le.event_type into v_event_type
  from public.ledger_entries le
  where le.id = p_id
  for update;

  if not found then
    return query select p_id, false, 'not_found'::text;
    return;
  end if;

  if v_event_type = 'charge' then
    select public.charge_has_active_linked_events(p_id) into v_has_active_links;
    if v_has_active_links then
      return query select p_id, false, 'charge_has_active_linked_events'::text;
      return;
    end if;
  end if;

  update public.ledger_entries
  set voided_at = now(), void_reason = p_reason
  where id = p_id;

  return query select p_id, true, null::text;
end;
$$;

revoke execute on function public.void_ledger_entry(uuid, text) from public;
grant execute on function public.void_ledger_entry(uuid, text) to authenticated;
