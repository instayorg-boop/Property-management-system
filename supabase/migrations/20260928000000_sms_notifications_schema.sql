-- Phase 1 of the SMS/reminders build (see the plan discussed in chat) — schema + settings only.
-- Nothing in this migration sends an SMS: it just gives the landlord somewhere to configure the
-- upcoming automation, and gives later phases the tables they need for idempotency, digesting, and
-- rate-limiting. No triggers, no pg_cron, no pg_net here — those land in later phases once the
-- Edge Functions they call actually exist.

-- settings: alert phone + SMS channel preferences ------------------------------------------------
alter table public.settings
  add column if not exists notification_phone text,
  add column if not exists payment_sms_mode text not null default 'daily_digest',
  add column if not exists sms_notification_prefs jsonb not null default '{"newMaintenanceReport": true, "upcomingPayout": true, "overdueEscalated": true}'::jsonb,
  add column if not exists send_onboarding_sms boolean not null default true;

alter table public.settings
  add constraint settings_payment_sms_mode_check check (payment_sms_mode in ('off', 'hourly_digest', 'daily_digest'));

-- Seed the new alert-phone field from the existing invoice phone so it isn't blank for properties
-- created before this migration — it stays independently editable afterward.
update public.settings set notification_phone = landlord_phone where notification_phone is null;

-- tenants: onboarding-SMS idempotency marker ------------------------------------------------------
alter table public.tenants
  add column if not exists onboarding_sms_sent_at timestamptz;

-- reminder_log: guarantees at most one pre-due and one escalation SMS per tenant per billing period
create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  billing_period_id text not null,
  reminder_type text not null check (reminder_type in ('pre_due', 'escalation')),
  sent_at timestamptz not null default now(),
  unique (tenant_id, billing_period_id, reminder_type)
);

create index if not exists reminder_log_tenant_idx on public.reminder_log (tenant_id);

alter table public.reminder_log enable row level security;

create policy "reminder_log_select" on public.reminder_log for select
  using (tenant_id in (
    select t.id from public.tenants t
    join public.properties p on p.id = t.property_id
    where p.owner_id = auth.uid()
  ));

-- notification_digest_state: watermark per property+digest type, so the hourly and daily payment
-- digests each track their own "already included up to here" pointer against the same event stream.
create table if not exists public.notification_digest_state (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  digest_type text not null check (digest_type in ('payment_hourly', 'payment_daily')),
  last_processed_notification_id uuid,
  last_processed_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, digest_type)
);

alter table public.notification_digest_state enable row level security;

create policy "notification_digest_state_select" on public.notification_digest_state for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));

-- sms_send_log: audit/troubleshooting ledger for every SMS attempt (not provider delivery status).
create table if not exists public.sms_send_log (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  recipient_phone text not null,
  category text not null,
  status text not null check (status in ('sent', 'failed', 'skipped_cap')),
  sent_at timestamptz not null default now()
);

create index if not exists sms_send_log_property_sent_idx on public.sms_send_log (property_id, sent_at desc);

alter table public.sms_send_log enable row level security;

create policy "sms_send_log_select" on public.sms_send_log for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));

-- pending_instant_sms: quiet-hours deferral queue for the instant-alert path (e.g. maintenance
-- reports) — a Postgres trigger firing pg_net can't delay itself, so the receiving Edge Function
-- writes here instead of sending when it's outside the configured send window, and the hourly
-- digest job sweeps this table for anything now inside the window.
create table if not exists public.pending_instant_sms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists pending_instant_sms_property_idx on public.pending_instant_sms (property_id);

alter table public.pending_instant_sms enable row level security;

create policy "pending_instant_sms_select" on public.pending_instant_sms for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
