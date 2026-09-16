-- waivePenalty (TenantsContext.tsx) reset daysOverdue to 0 locally and wrote an audit-only
-- adjustment row, then immediately called sync_tenant_balance_if_new_model — which recomputed
-- days_overdue completely fresh from current_date vs the open charge's grace_period_end, with no
-- idea a waiver had just happened. That overwrote the "0" straight back to the original overdue
-- day count, so the waiver never actually took effect (the penalty kept recalculating, and the
-- landlord could "waive" it again and again with the same result every time).
--
-- Fix: the waiver event now links to the open charge via charge_id and is tagged
-- origin='penalty_waiver' (see the matching TenantsContext.tsx change) so this function can find
-- the most recent one and treat its date as a new baseline — days overdue (and the "overdue"
-- status itself) are measured from the later of the charge's grace period end or its last
-- waiver, not the grace period alone. A waived charge that's still unpaid the next day starts
-- accruing overdue days again from the waiver, exactly like a fresh grace period lapsing.

create or replace function public.sync_tenant_balance_if_new_model(p_tenant_id uuid)
 returns table(tenant_id uuid, synchronized boolean, skip_reason text, balance numeric, status text, days_overdue integer)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_has_legacy boolean;
  v_balance numeric;
  v_open_charge_id uuid;
  v_open_charge_amount numeric;
  v_open_charge_grace_period_end date;
  v_open_charge_remaining numeric;
  v_last_waiver_date date;
  v_effective_start date;
  v_status text;
  v_days_overdue integer;
begin
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
    else
      select max(le.created_at::date) into v_last_waiver_date
      from public.ledger_entries le
      where le.charge_id = v_open_charge_id
        and le.origin = 'penalty_waiver'
        and le.voided_at is null;

      v_effective_start := greatest(
        coalesce(v_open_charge_grace_period_end, current_date),
        coalesce(v_last_waiver_date, coalesce(v_open_charge_grace_period_end, current_date))
      );

      if current_date > v_effective_start then
        v_status := 'overdue';
        v_days_overdue := greatest(0, current_date - v_effective_start);
      elsif v_open_charge_remaining < v_open_charge_amount then
        v_status := 'partial';
        v_days_overdue := 0;
      else
        v_status := 'unpaid';
        v_days_overdue := 0;
      end if;
    end if;
  end if;

  update public.tenants
  set owed_amount = v_balance,
      status = v_status,
      days_overdue = v_days_overdue
  where id = p_tenant_id;

  return query select p_tenant_id, true, null::text, v_balance, v_status, v_days_overdue;
end;
$function$;
