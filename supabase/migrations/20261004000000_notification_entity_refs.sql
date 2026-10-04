-- Deep-linking needs one consistent way to find "the record this notification is about" instead of
-- reaching into metadata's per-category jsonb shape (maintenance_report_id here, tenant_id there).
-- Adds first-class entity_type/entity_id columns, populated by the same two triggers that already
-- write metadata (kept as-is for backward compat) — this is additive, not a metadata migration.

alter table public.notifications
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

create or replace function public.notify_new_maintenance_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (property_id, category, type, title, body, metadata, entity_type, entity_id)
  values (
    new.property_id,
    'maintenance',
    'newMaintenanceReport',
    'New maintenance report',
    coalesce(new.tenant, 'A tenant') || ' reported an issue at ' || new.location,
    jsonb_build_object('maintenance_report_id', new.id, 'tenant', new.tenant, 'location', new.location),
    'maintenance_report',
    new.id
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
  if new.status <> 'success' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'success' then
    return new;
  end if;

  select name into v_tenant_name from public.tenants where id = new.tenant_id;

  insert into public.notifications (property_id, category, type, title, body, metadata, entity_type, entity_id)
  values (
    new.property_id,
    'payment',
    'newPayment',
    'Payment received',
    coalesce(v_tenant_name, 'A tenant') || ' paid K' || to_char(new.amount, 'FM999,999,990.00') || ' via ' || new.operator,
    jsonb_build_object('collection_id', new.id, 'tenant_id', new.tenant_id, 'amount', new.amount, 'operator', new.operator),
    'tenant',
    new.tenant_id
  );
  return new;
end;
$$;
