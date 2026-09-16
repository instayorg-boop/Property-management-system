-- Phase 1 safety fixes (tenant financial system audit).
--
-- 1. Drops pay_portal_log_payment (v1) — confirmed via repo-wide search to have zero callers
--    anywhere in the client or edge functions. It was SECURITY DEFINER with no session/auth check
--    of any kind, callable directly over the REST API by anyone who knew a tenant_id, and would
--    unconditionally zero that tenant's owed_amount and mark them "paid" for any amount.
--
-- 2. Replaces pay_portal_log_payment_v2 (session-gated, but previously had the same
--    "unconditionally zero the balance" bug — dead code today since its only client wrapper,
--    logPortalPayment in src/lib/payPortal.ts, has no caller, but left correct in case that ever
--    changes). Now: reads the tenant's real current balance (`for update`, so a concurrent second
--    call for the same tenant serializes behind this one instead of racing it), deducts p_amount
--    from it (clamped at 0 — never negative), and sets status to paid/partial accordingly instead
--    of always "paid". The inserted ledger_entries row follows the same amount/paid_amount
--    convention TenantsContext.tsx's logPayments uses (amount = what was owed before this payment,
--    paid_amount only set when the payment didn't fully settle it). Scope stays narrow:
--    authentication, balance deduction, status, days_overdue, and the ledger row only —
--    on_time_count/total_months_count are deliberately left untouched by this function.

drop function if exists public.pay_portal_log_payment(uuid, numeric, text);

create or replace function public.pay_portal_log_payment_v2(p_tenant_id uuid, p_amount numeric, p_label text, p_session_token text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_owed_before numeric;
  v_days_overdue integer;
  v_new_owed numeric;
  v_settled_in_full boolean;
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid or expired session';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- `for update` locks this tenant's row for the rest of the function's implicit transaction —
  -- a second concurrent call for the same tenant blocks here until this one finishes, instead of
  -- both reading the same starting owed_amount and one silently clobbering the other's write.
  select owed_amount, days_overdue
    into v_owed_before, v_days_overdue
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    raise exception 'tenant not found';
  end if;

  v_new_owed := greatest(0, coalesce(v_owed_before, 0) - p_amount);
  v_settled_in_full := v_new_owed <= 0;

  update public.tenants
  set status = case when v_settled_in_full then 'paid' else 'partial' end,
      owed_amount = v_new_owed,
      days_overdue = case when v_settled_in_full then 0 else v_days_overdue end
  where id = p_tenant_id;

  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, source)
  values (
    p_tenant_id,
    coalesce(p_label, 'Rent payment'),
    coalesce(v_owed_before, 0),
    case when v_settled_in_full then null else p_amount end,
    case when v_settled_in_full then 'paid' else 'partial' end,
    'manual'
  );
end;
$$;

grant execute on function public.pay_portal_log_payment_v2(uuid, numeric, text, text) to anon, authenticated;
