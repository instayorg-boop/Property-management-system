-- First name only in notification/SMS text — a landlord asked for shorter, more predictable
-- messages than "Bwalya Tembo paid K250.00" / "Bwalya Tembo reported an issue at...". Deliberately
-- NOT a schema change (no first_name/last_name split on tenants or emergency_contacts, which are
-- used everywhere — tenant list, invoices, receipts, reports, the tenant portal): just take the
-- first word of the existing combined name at the moment a notification/message is composed.
create or replace function public.notify_new_maintenance_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (property_id, category, type, title, body, metadata)
  values (
    new.property_id,
    'maintenance',
    'newMaintenanceReport',
    'New maintenance report',
    coalesce(split_part(new.tenant, ' ', 1), 'A tenant') || ' reported an issue at ' || new.location,
    jsonb_build_object('maintenance_report_id', new.id, 'tenant', new.tenant, 'location', new.location)
  );
  return new;
end;
$$;

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
    coalesce(split_part(v_tenant_name, ' ', 1), 'A tenant') || ' paid K' || to_char(new.amount, 'FM999,999,990.00') || ' via ' || new.operator,
    jsonb_build_object('collection_id', new.id, 'tenant_id', new.tenant_id, 'amount', new.amount, 'operator', new.operator)
  );
  return new;
end;
$$;
