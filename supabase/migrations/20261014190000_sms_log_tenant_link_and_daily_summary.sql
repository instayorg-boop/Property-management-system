-- Reminders visibility: link each logged text to its tenant, let the landlord read their own log,
-- and post one daily "Texts sent today" summary into Recent activity (18:00 Lusaka).

alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category = any (array['payment','maintenance','payout','overdue','system','reminders']));

alter table public.sms_send_log add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
alter table public.sms_send_log add column if not exists recipient_role text;
create index if not exists sms_send_log_tenant_idx on public.sms_send_log (tenant_id, sent_at desc);
create index if not exists sms_send_log_property_sent_idx on public.sms_send_log (property_id, sent_at desc);

create or replace function public.sms_phone_key(p text)
returns text language sql immutable set search_path to '' as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9)
$$;

create or replace function public.tag_sms_recipient()
returns trigger language plpgsql set search_path to '' as $$
declare
  v_key text := public.sms_phone_key(new.recipient_phone);
  v_id uuid;
begin
  if v_key = '' then return new; end if;
  if new.recipient_role is null and exists (
    select 1 from public.settings s where s.property_id = new.property_id and public.sms_phone_key(s.notification_phone) = v_key) then
    new.recipient_role := 'landlord';
    return new;
  end if;
  if new.tenant_id is null then
    select t.id into v_id from public.tenants t
    where t.property_id = new.property_id
      and exists (select 1 from unnest(coalesce(t.phones, '{}'::text[])) ph where public.sms_phone_key(ph) = v_key)
    order by t.active desc limit 1;
    if v_id is not null then
      new.tenant_id := v_id;
      new.recipient_role := coalesce(new.recipient_role, 'tenant');
      return new;
    end if;
    select t.id into v_id from public.tenants t
    where t.property_id = new.property_id
      and exists (
        select 1 from jsonb_array_elements(coalesce(t.emergency_contacts, '[]'::jsonb)) c,
             jsonb_array_elements_text(coalesce(c->'phones', '[]'::jsonb)) ph
        where public.sms_phone_key(ph) = v_key)
    order by t.active desc limit 1;
    if v_id is not null then
      new.tenant_id := v_id;
      new.recipient_role := coalesce(new.recipient_role, 'guardian');
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger trg_tag_sms_recipient
before insert on public.sms_send_log
for each row execute function public.tag_sms_recipient();

update public.sms_send_log l set recipient_role = 'landlord'
from public.settings s
where s.property_id = l.property_id and l.recipient_role is null
  and public.sms_phone_key(l.recipient_phone) <> ''
  and public.sms_phone_key(s.notification_phone) = public.sms_phone_key(l.recipient_phone);
update public.sms_send_log l set tenant_id = t.id, recipient_role = 'tenant'
from public.tenants t
where l.tenant_id is null and l.recipient_role is null and t.property_id = l.property_id
  and exists (select 1 from unnest(coalesce(t.phones, '{}'::text[])) ph where public.sms_phone_key(ph) = public.sms_phone_key(l.recipient_phone));

drop policy if exists sms_send_log_select on public.sms_send_log;
create policy sms_send_log_select on public.sms_send_log for select to authenticated
using (exists (select 1 from public.properties p where p.id = sms_send_log.property_id and p.owner_id = auth.uid()));

create or replace function public.post_daily_sms_summary()
returns void language plpgsql security definer set search_path to '' as $$
declare
  r record;
  v_day date := (now() at time zone 'Africa/Lusaka')::date;
  v_parts text[];
  v_title text;
begin
  for r in
    select l.property_id,
      count(*) filter (where l.status = 'sent' and (l.category = 'pre_due_reminder' or l.category like 'ap\_%')) as reminders,
      count(*) filter (where l.status = 'sent' and l.category in ('escalation', 'autopilot_guardian')) as guardians,
      count(*) filter (where l.status = 'sent' and l.category = 'payment_receipt') as receipts,
      count(*) filter (where l.status = 'sent' and l.category = 'onboarding') as welcomes,
      count(*) filter (where l.status = 'sent' and l.recipient_role = 'landlord') as to_you,
      count(*) filter (where l.status = 'failed') as failed,
      count(*) filter (where l.status = 'skipped_cap') as capped
    from public.sms_send_log l
    where (l.sent_at at time zone 'Africa/Lusaka')::date = v_day
    group by l.property_id
  loop
    if exists (select 1 from public.notifications n where n.property_id = r.property_id and n.type = 'sms_daily_summary'
               and n.metadata->>'day' = v_day::text) then
      continue;
    end if;
    v_parts := array[]::text[];
    if r.reminders > 0 then v_parts := v_parts || (r.reminders || ' rent reminder' || case when r.reminders = 1 then '' else 's' end); end if;
    if r.guardians > 0 then v_parts := v_parts || (r.guardians || ' guardian notice' || case when r.guardians = 1 then '' else 's' end); end if;
    if r.receipts > 0 then v_parts := v_parts || (r.receipts || ' receipt' || case when r.receipts = 1 then '' else 's' end); end if;
    if r.welcomes > 0 then v_parts := v_parts || (r.welcomes || ' welcome text' || case when r.welcomes = 1 then '' else 's' end); end if;
    if r.to_you > 0 then v_parts := v_parts || (r.to_you || ' update' || case when r.to_you = 1 then '' else 's' end || ' to you'); end if;
    if coalesce(array_length(v_parts, 1), 0) = 0 and r.failed = 0 and r.capped = 0 then continue; end if;

    v_title := case
      when r.failed > 0 then r.failed || ' text' || case when r.failed = 1 then '' else 's' end || ' failed to send today'
      else 'Texts sent today' end;

    insert into public.notifications (property_id, category, type, title, body, metadata)
    values (
      r.property_id, 'reminders', 'sms_daily_summary', v_title,
      coalesce(nullif(array_to_string(v_parts, ', '), ''), 'None sent')
        || case when r.capped > 0 then '. ' || r.capped || ' held back by the daily SMS limit' else '' end
        || case when r.failed > 0 then '. Open a tenant''s Reminders tab to see which.' else '.' end,
      jsonb_build_object('day', v_day, 'reminders', r.reminders, 'guardians', r.guardians, 'receipts', r.receipts,
                         'welcomes', r.welcomes, 'toYou', r.to_you, 'failed', r.failed, 'capped', r.capped)
    );
  end loop;
end;
$$;

select cron.schedule('post-daily-sms-summary', '0 16 * * *', $cron$select public.post_daily_sms_summary()$cron$);
