-- Bug fix, found during live testing: notify_payment_collected() (20260923000000_notifications.sql)
-- checked collections.status against 'success', but the actual value this app writes/checks
-- everywhere else (pay-portal-collect-payment, lenco-webhook, pay-portal-check-collection,
-- pay-portal-generate-receipt, check-payout-status) — and the column's own check constraint — is
-- 'successful'. The trigger has therefore never fired for a single real payment; it was silently
-- a no-op since the day it was added. Editing the function in place (not the original migration
-- file, which is already applied) so re-running migrations from scratch also gets this right.
create or replace function public.notify_payment_collected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_name text;
begin
  if new.status <> 'successful' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'successful' then
    return new;
  end if;

  select name into v_tenant_name from public.tenants where id = new.tenant_id;

  insert into public.notifications (property_id, category, type, title, body, metadata)
  values (
    new.property_id,
    'payment',
    'newPayment',
    'Payment received',
    coalesce(v_tenant_name, 'A tenant') || ' paid K' || to_char(new.amount, 'FM999,999,990.00') || ' via ' || new.operator,
    jsonb_build_object('collection_id', new.id, 'tenant_id', new.tenant_id, 'amount', new.amount, 'operator', new.operator)
  );
  return new;
end;
$$;
