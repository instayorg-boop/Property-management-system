-- Phase 3E — charge-void guard (design approved in chat history). Purely additive: one new
-- function. Does NOT wire balance synchronization into any write flow, does NOT touch
-- calculate_tenant_balance/sync_tenant_balance_if_new_model, does NOT touch historical rows.
--
-- Problem this closes: a new-model charge voided while it still has active (non-voided,
-- balance-affecting) linked events leaves those events' contributions in
-- calculate_tenant_balance's flat sum with nothing to offset them — the exact edge case named in
-- the Phase 3E design audit (scenario D) and exercised by phase3e_sync_test.sql's scenario E,
-- which only stays correct because that charge has no linked events. Nothing before this enforced
-- that precondition anywhere; voidLedgerEntry (src/lib/tenants.ts) did a plain, unconditional
-- UPDATE.
--
-- Security/RLS: this function is `security invoker`, same conclusion already reached for
-- calculate_tenant_balance and sync_tenant_balance_if_new_model — `ledger_entries` RLS scopes
-- every row to the calling landlord's own tenants (via property ownership), so
-- charge_has_active_linked_events(p_id) called from inside this invoker function still only ever
-- sees that landlord's own rows. There is no scenario where RLS causes it to under-report a link
-- that would let a guard be bypassed: if the caller can't see a row, they can't reach it through
-- this function's own `for update` lock or its final UPDATE either (both are RLS-scoped the same
-- way), so there's nothing to bypass into.
--
-- Concurrency: `for update` locks the target row for this function's implicit transaction. In
-- Postgres, inserting a new row with a foreign key reference (e.g. a payment's charge_id pointing
-- at this charge) requires at least a FOR KEY SHARE lock on the referenced row — which conflicts
-- with the FOR UPDATE already held here, so a concurrent "log a payment against this charge"
-- write blocks until this function commits or rolls back, rather than racing the
-- check-then-update. This closes the void side of the race with no change to any payment-write
-- path (logPayments is explicitly untouched); the reverse direction (a payment linking to an
-- already-voided charge) is a separate, later concern.
create or replace function public.void_ledger_entry(p_id uuid, p_reason text)
returns table (id uuid, voided boolean, refusal_reason text)
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

  -- The charge-link rule applies only to new-model charge rows. A legacy row (event_type is
  -- null) and every other new-model event_type (payment/penalty/adjustment/credit) keep the
  -- existing, unconditional void behavior — there is no equivalent "things depend on this row"
  -- relationship for them the way a charge's linked payments have.
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
