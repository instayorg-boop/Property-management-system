-- Phase 4 — wires up pg_cron + pg_net so send-rent-reminders (and the two already-written-but-
-- never-scheduled functions, generate-rent-charges and pay-portal-scheduled-payouts) actually run
-- on a schedule instead of only being manually invokable.
--
-- IMPORTANT — one-time manual setup this migration deliberately does NOT do, because it would mean
-- committing the CRON_SECRET and the project's functions URL into a SQL file in this git repo:
-- before these jobs will actually succeed, run once (via the SQL editor or `supabase db execute`,
-- NOT as a migration) in this project's own database:
--
--   select vault.create_secret('<the same value as the CRON_SECRET function secret>', 'cron_secret');
--   select vault.create_secret('https://<your-project-ref>.supabase.co/functions/v1', 'functions_base_url');
--
-- Every scheduled job below reads both back out of vault.decrypted_secrets at run time rather than
-- having either value baked into this file. If those two secrets don't exist yet, the jobs will run
-- on schedule but every call will fail with "Unauthorized" (missing/wrong x-cron-secret) or hit a
-- bad URL — check `select * from cron.job_run_details order by start_time desc limit 20;` if so.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;

create or replace function private.invoke_cron_function(function_name text)
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
    raise warning 'invoke_cron_function(%): missing functions_base_url or cron_secret in vault — skipping', function_name;
    return;
  end if;

  perform net.http_post(
    url := v_base_url || '/' || function_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;

-- 08:00 Africa/Lusaka = 06:00 UTC (no DST) — pre-due reminders and guardian escalation.
select cron.schedule('send-rent-reminders-daily', '0 6 * * *', $$select private.invoke_cron_function('send-rent-reminders')$$);

-- 00:05 Africa/Lusaka = 22:05 UTC the previous day — generates the new month's charges just after
-- rollover. Was written (see generate-rent-charges/index.ts) but never scheduled until now.
select cron.schedule('generate-rent-charges-daily', '5 22 * * *', $$select private.invoke_cron_function('generate-rent-charges')$$);

-- Payout day check — pay-portal-scheduled-payouts already reads settings.payout_day itself and
-- no-ops on any day that isn't the configured one, so this can just run daily.
select cron.schedule('pay-portal-scheduled-payouts-daily', '10 6 * * *', $$select private.invoke_cron_function('pay-portal-scheduled-payouts')$$);
