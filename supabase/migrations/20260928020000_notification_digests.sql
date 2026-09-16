-- Phase 5 — payment SMS digesting + the instant-alert path for high-priority events (maintenance
-- reports), plus the atomic daily SMS cap both of those (and Phase 3/4's onboarding/reminder sends)
-- share as a safety fuse.

-- sms_daily_counters: the atomic cap-check mechanism. A single
-- INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING is what makes this race-safe under concurrent
-- sends — never implement the cap as a separate SELECT count(*) followed by an INSERT.
create table if not exists public.sms_daily_counters (
  property_id uuid not null references public.properties(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (property_id, day)
);

alter table public.sms_daily_counters enable row level security;
-- No policies — this is only ever written through the security-definer function below (called by
-- Edge Functions using the service-role key, which bypasses RLS anyway) or read by an operator via
-- the dashboard's service-role access. No landlord/client should read or write it directly.

create or replace function public.increment_sms_daily_counter(p_property_id uuid, p_day date)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.sms_daily_counters (property_id, day, count)
  values (p_property_id, p_day, 1)
  on conflict (property_id, day) do update set count = sms_daily_counters.count + 1
  returning count;
$$;

revoke execute on function public.increment_sms_daily_counter(uuid, date) from public, anon, authenticated;

-- private.invoke_edge_function generalizes Phase 4's invoke_cron_function (which now just delegates
-- here with an empty payload) so a Postgres trigger can also fire an Edge Function with a specific
-- body, not just a bare cron tick. Same vault-secret lookup, same "warn and no-op if not configured"
-- behavior — see the setup note in 20260925000000_reminder_cron.sql.
create or replace function private.invoke_edge_function(function_name text, payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base_url text;
  v_secret text;
begin
  select decrypted_secret into v_base_url from vault.decrypted_secrets where name = 'functions_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  if v_base_url is null or v_secret is null then
    raise warning 'invoke_edge_function(%): missing functions_base_url or cron_secret in vault — skipping', function_name;
    return;
  end if;

  perform net.http_post(
    url := v_base_url || '/' || function_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := payload
  );
end;
$$;

create or replace function private.invoke_cron_function(function_name text)
returns void
language sql
security definer
set search_path = public
as $$
  select private.invoke_edge_function(function_name, '{}'::jsonb);
$$;

-- Hourly payment/daily digest sweep.
select cron.schedule('send-notification-digests-hourly', '0 * * * *', $$select private.invoke_cron_function('send-notification-digests')$$);

-- Instant-alert trigger: fires the moment a high-priority notification (currently: maintenance) is
-- recorded. Payment notifications are deliberately excluded here — those belong to the digest job
-- above, never this immediate path (see the "no instant payment SMS" rule in the plan).
create or replace function public.notify_instant_sms_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category = 'maintenance' then
    perform private.invoke_edge_function('send-instant-notification-sms', jsonb_build_object('notificationId', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_instant_sms_categories on public.notifications;
create trigger trg_notify_instant_sms_categories
  after insert on public.notifications
  for each row execute function public.notify_instant_sms_categories();
