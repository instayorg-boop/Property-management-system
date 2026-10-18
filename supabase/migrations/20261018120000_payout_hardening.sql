-- Payout hardening (items 1 to 6).
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Balance is always computed from real collection rows (no DEV-SIMULATED money).
create or replace function public.recompute_property_balance(p_property_id uuid)
returns numeric language plpgsql security definer set search_path to '' as $$
declare v numeric;
begin
  perform pg_advisory_xact_lock(hashtext(p_property_id::text));
  select coalesce(sum(c.amount - coalesce(c.fee_amount, 0)), 0) into v
  from public.collections c
  where c.property_id = p_property_id
    and c.status = 'successful'
    and c.payout_id is null
    and coalesce(c.lenco_collection_id, '') not like 'DEV-%';
  v := round(v, 2);
  insert into public.property_balances (property_id, available_balance, updated_at)
  values (p_property_id, v, now())
  on conflict (property_id) do update set available_balance = excluded.available_balance, updated_at = now();
  return v;
end; $$;
revoke execute on function public.recompute_property_balance(uuid) from public, anon, authenticated;

-- Existing callers (collect, claim, release) keep working: the amount is ignored, the truth is recomputed.
create or replace function public.pay_portal_increment_property_balance(p_property_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.recompute_property_balance(p_property_id);
end; $$;

create or replace function public.trg_collections_recompute_balance()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_property_balance(old.property_id);
    return old;
  end if;
  perform public.recompute_property_balance(new.property_id);
  if tg_op = 'UPDATE' and old.property_id is distinct from new.property_id then
    perform public.recompute_property_balance(old.property_id);
  end if;
  return new;
end; $$;
revoke execute on function public.trg_collections_recompute_balance() from public, anon, authenticated;

drop trigger if exists collections_recompute_balance_ins on public.collections;
create trigger collections_recompute_balance_ins after insert or delete on public.collections
  for each row execute function public.trg_collections_recompute_balance();
drop trigger if exists collections_recompute_balance_upd on public.collections;
create trigger collections_recompute_balance_upd
  after update of status, payout_id, amount, fee_amount, lenco_collection_id, property_id on public.collections
  for each row execute function public.trg_collections_recompute_balance();

select public.recompute_property_balance(id) from public.properties;

-- 3 and 4. Held payouts are retried daily and the landlord is told.
alter table public.settings add column if not exists payout_retry_pending boolean not null default false;
alter table public.settings add column if not exists payout_hold_reason text;
alter table public.settings add column if not exists payout_hold_notified_at timestamptz;

-- 6. One payout account per real destination per property.
with ranked as (
  select id, property_id,
    first_value(id) over (
      partition by property_id, type, coalesce(provider,''), coalesce(phone_number,''), coalesce(bank_code,''), coalesce(account_number,'')
      order by is_default desc nulls last, created_at asc, id asc) as keep_id,
    row_number() over (
      partition by property_id, type, coalesce(provider,''), coalesce(phone_number,''), coalesce(bank_code,''), coalesce(account_number,'')
      order by is_default desc nulls last, created_at asc, id asc) as rn
  from public.payout_recipients
)
update public.payouts p set payout_recipient_id = r.keep_id
from ranked r where r.rn > 1 and p.payout_recipient_id = r.id;

with ranked as (
  select id,
    row_number() over (
      partition by property_id, type, coalesce(provider,''), coalesce(phone_number,''), coalesce(bank_code,''), coalesce(account_number,'')
      order by is_default desc nulls last, created_at asc, id asc) as rn
  from public.payout_recipients
)
delete from public.payout_recipients pr using ranked r where pr.id = r.id and r.rn > 1;

create unique index if not exists payout_recipients_unique_destination
  on public.payout_recipients (property_id, type, coalesce(provider,''), coalesce(phone_number,''), coalesce(bank_code,''), coalesce(account_number,''));

-- 2. Stuck payouts are checked every 15 minutes.
select cron.unschedule('reconcile-stuck-payouts-15min')
  where exists (select 1 from cron.job where jobname = 'reconcile-stuck-payouts-15min');
select cron.schedule('reconcile-stuck-payouts-15min', '*/15 * * * *', $$select private.invoke_cron_function('reconcile-stuck-payouts')$$);
