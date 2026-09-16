-- Phase 3E — database balance-synchronization foundation (design approved in chat history).
-- Purely additive: two new functions, no schema change, no trigger, no historical row touched,
-- no existing writer of owed_amount/status/days_overdue changed. Nothing calls either function
-- yet — that wiring is a deliberately separate, later step.
--
-- Security/RLS conclusion (re-verified before writing this, per the audit requirement):
--   `tenants` and `ledger_entries` both carry ordinary owner-scoped RLS policies
--   (property_id/tenant_id -> properties.owner_id = auth.uid()), see
--   20260907020000_auth_and_onboarding.sql. calculate_tenant_balance (Phase 2B) is itself
--   `security invoker`, and Postgres composes invoker-to-invoker calls transparently — calling it
--   from inside another `security invoker` function still evaluates every inner query as the
--   ORIGINAL caller, so an authenticated landlord querying/updating their own tenant's rows here
--   is exactly as safe as calling calculate_tenant_balance directly. No RLS gap was found; no
--   security needed to be weakened. sync_tenant_balance_if_new_model therefore stays
--   `security invoker`, matching calculate_tenant_balance's own precedent, and does not need
--   `security definer` (that escalation is reserved for the anonymous tenant-portal pay_portal_*
--   functions, which have no real auth.uid() at all — not this landlord-dashboard case).

-- Small, standalone helper: true if a charge still has any non-voided, balance-affecting event
-- pointing at it via charge_id. Exists to guard against the one real edge case found during the
-- Phase 3E design audit — voiding a charge while its payments remain active leaves those payments'
-- negative contributions in calculate_tenant_balance's flat sum with nothing to offset them,
-- producing a negative stored balance. NOT wired into any void path yet (voidLedgerEntry's client
-- code is explicitly untouched by this migration) — this is scaffolding for that future guard,
-- kept separate so it can be reviewed/tested on its own.
create or replace function public.charge_has_active_linked_events(p_charge_id uuid)
returns boolean
language sql
stable
set search_path to ''
as $$
  select exists(
    select 1 from public.ledger_entries
    where charge_id = p_charge_id
      and voided_at is null
      and affects_balance = true
  );
$$;

revoke execute on function public.charge_has_active_linked_events(uuid) from public;
grant execute on function public.charge_has_active_linked_events(uuid) to authenticated;

-- The Phase 3E balance-synchronization function itself.
--
-- Eligibility: a tenant is only ever synchronized if EVERY one of their ledger_entries rows has
-- event_type set — i.e., they have no legacy row at all. In practice this means only tenants
-- created after the event model existed with no pre-existing history; every tenant with any
-- history before Phase 3A necessarily has at least one legacy row and is always skipped. This is
-- a runtime check, not a stored flag — no migration/backfill needed to establish it, and it can
-- never misclassify a mixed tenant as new-model-only.
--
-- Balance: delegates entirely to calculate_tenant_balance (Phase 2B) for the actual contribution
-- rules (voided -> 0, affects_balance=false -> 0, event_type is not null -> trust the signed
-- amount) rather than re-deriving them here — this function adds status/days_overdue derivation
-- and the actual write, nothing else.
--
-- Status/days_overdue: derived from the tenant's current open charge (the most recently due,
-- non-voided charge event that isn't yet fully settled), reusing the due_date/grace_period_end
-- columns Phase 3A/3B already populate — no new column needed:
--   balance <= 0                                          -> paid,    days_overdue = 0
--   else, current_date > open charge's grace_period_end   -> overdue, days_overdue = current_date - grace_period_end
--   else, something has been paid toward the open charge  -> partial, days_overdue = 0
--   else (nothing paid yet, not overdue)                  -> unpaid,  days_overdue = 0
--   else (balance > 0 but no open charge row exists at all,
--         e.g. balance driven by a standalone payment/adjustment
--         with no linked charge) -> unpaid, days_overdue = 0 (a conservative default; this shape
--         isn't produced by any current writer, but the function must still terminate on it)
--
-- Writes ONLY owed_amount/status/days_overdue. on_time_count/total_months_count are never touched.
create or replace function public.sync_tenant_balance_if_new_model(p_tenant_id uuid)
returns table (
  tenant_id uuid,
  synchronized boolean,
  skip_reason text,
  balance numeric,
  status text,
  days_overdue integer
)
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_has_legacy boolean;
  v_balance numeric;
  v_open_charge_id uuid;
  v_open_charge_amount numeric;
  v_open_charge_grace_period_end date;
  v_open_charge_remaining numeric;
  v_status text;
  v_days_overdue integer;
begin
  -- Locks the tenant row for the rest of this function's implicit transaction, same technique
  -- pay_portal_log_payment_v2 already uses — a second concurrent sync (or any other writer of
  -- this tenant's owed_amount/status/days_overdue) for the same tenant serializes behind this one
  -- instead of both reading the same starting state and one clobbering the other's write.
  perform 1 from public.tenants where id = p_tenant_id for update;
  if not found then
    return query select p_tenant_id, false, 'tenant_not_found'::text, null::numeric, null::text, null::integer;
    return;
  end if;

  select exists(
    select 1 from public.ledger_entries le
    where le.tenant_id = p_tenant_id and le.event_type is null
  ) into v_has_legacy;

  if v_has_legacy then
    return query select p_tenant_id, false, 'skipped_legacy_or_mixed'::text, null::numeric, null::text, null::integer;
    return;
  end if;

  select b.balance into v_balance from public.calculate_tenant_balance(p_tenant_id) b;

  if v_balance <= 0 then
    v_status := 'paid';
    v_days_overdue := 0;
  else
    -- The current open charge: among this tenant's non-voided charges, the one with the most
    -- recent due_date whose own remaining amount (its amount plus every non-voided,
    -- balance-affecting event linked to it via charge_id) is still greater than zero. Computed as
    -- one CTE so "remaining" is derived exactly once per charge, then filtered/ordered against
    -- that — covers both the common case (this month's charge still open) and a partially-paid
    -- earlier charge left open behind an already-settled later one.
    select oc.id, oc.amount, oc.grace_period_end, oc.remaining
      into v_open_charge_id, v_open_charge_amount, v_open_charge_grace_period_end, v_open_charge_remaining
    from (
      select
        le.id,
        le.amount,
        le.grace_period_end,
        le.due_date,
        le.created_at,
        le.amount + coalesce((
          select sum(ev.amount) from public.ledger_entries ev
          where ev.charge_id = le.id and ev.voided_at is null and ev.affects_balance = true
        ), 0) as remaining
      from public.ledger_entries le
      where le.tenant_id = p_tenant_id
        and le.event_type = 'charge'
        and le.voided_at is null
    ) oc
    where oc.remaining > 0
    order by oc.due_date desc nulls last, oc.created_at desc
    limit 1;

    if v_open_charge_id is null then
      v_status := 'unpaid';
      v_days_overdue := 0;
    elsif v_open_charge_grace_period_end is not null and current_date > v_open_charge_grace_period_end then
      v_status := 'overdue';
      v_days_overdue := greatest(0, current_date - v_open_charge_grace_period_end);
    elsif v_open_charge_remaining < v_open_charge_amount then
      v_status := 'partial';
      v_days_overdue := 0;
    else
      v_status := 'unpaid';
      v_days_overdue := 0;
    end if;
  end if;

  update public.tenants
  set owed_amount = v_balance,
      status = v_status,
      days_overdue = v_days_overdue
  where id = p_tenant_id;

  return query select p_tenant_id, true, null::text, v_balance, v_status, v_days_overdue;
end;
$$;

revoke execute on function public.sync_tenant_balance_if_new_model(uuid) from public;
grant execute on function public.sync_tenant_balance_if_new_model(uuid) to authenticated;
