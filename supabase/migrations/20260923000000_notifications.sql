-- In-app landlord notifications — a durable feed (not just a client-side toast) so events like a
-- tenant's mobile-money payment landing, or a new maintenance report, still show up after the fact
-- even if nobody was looking at the dashboard when it happened.
--
-- Deliberately scoped to sources that are unattended from the landlord's side: a mobile-money
-- payment via `collections` (the tenant did it, the landlord wasn't looking), and a maintenance
-- report (submitted by a tenant, or logged by the landlord — either way it's new information).
-- Manual/cash payments the landlord logs themselves (`ledger_entries` via LogPaymentModal) are
-- deliberately NOT notified — the landlord was already there for those, a notification would just
-- be noise. Payout and overdue-escalation notifications are follow-up work once the reminder-cron
-- infrastructure exists (see Settings > Reminders) — not covered by this migration.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  category text not null check (category in ('payment', 'maintenance', 'payout', 'overdue', 'system')),
  type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_property_created_idx on public.notifications (property_id, created_at desc);
create index if not exists notifications_property_unread_idx on public.notifications (property_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications_select" on public.notifications for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "notifications_update" on public.notifications for update
  using (property_id in (select id from public.properties where owner_id = auth.uid()));

alter publication supabase_realtime add table public.notifications;

-- New maintenance report -> notification. Fires on every insert into maintenance_reports
-- regardless of caller (tenant portal RPC or the landlord logging one directly), so there's one
-- source of truth instead of duplicating the insert at every call site.
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
    coalesce(new.tenant, 'A tenant') || ' reported an issue at ' || new.location,
    jsonb_build_object('maintenance_report_id', new.id, 'tenant', new.tenant, 'location', new.location)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_new_maintenance_report on public.maintenance_reports;
create trigger trg_notify_new_maintenance_report
  after insert on public.maintenance_reports
  for each row execute function public.notify_new_maintenance_report();

-- Mobile-money payment settles -> notification. Fires the moment a `collections` row flips to
-- 'success' (insert or update — the dev-simulate path can insert already-successful, the real
-- Lenco webhook path updates a pending row), not per ledger line item, so a tenant's single
-- payment produces exactly one notification even when it's split across several charge rows.
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

drop trigger if exists trg_notify_payment_collected on public.collections;
create trigger trg_notify_payment_collected
  after insert or update on public.collections
  for each row execute function public.notify_payment_collected();
