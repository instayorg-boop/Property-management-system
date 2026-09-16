-- Records the actual message text with every send attempt — including dev-mode ones, where no
-- real SMS goes out (see _shared/sms.ts's "no AT_API_KEY" fallback). Without this, dev-mode testing
-- means digging through Edge Function logs to see what would have been sent; with it, it's just a
-- query: `select * from sms_send_log order by sent_at desc`.
alter table public.sms_send_log
  add column if not exists message text not null default '';

alter table public.sms_send_log alter column message drop default;

-- send-tenant-onboarding-sms runs under the calling landlord's own session (RLS-bound), unlike the
-- cron/trigger-driven senders which use the service-role key and bypass RLS entirely — it needs its
-- own insert policy to log its send attempts.
create policy "sms_send_log_insert" on public.sms_send_log for insert
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));
