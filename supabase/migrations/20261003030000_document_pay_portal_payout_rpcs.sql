-- Reconciliation migration, same purpose and caveats as 20260915000000_sync_dashboard_changes.sql:
-- these five functions were created/edited live in the Supabase dashboard SQL editor and had no
-- local file. Dumped verbatim via `pg_get_functiondef` against the live database on 2026-09-30 —
-- CREATE OR REPLACE so this is safe to run against a database that already has them, and is NOT a
-- behavior change. Do not "clean up" the bodies here without also applying the change live; this
-- file exists purely so the payout/balance logic is versioned and diffable going forward.

-- What's sitting in property_balances.available_balance for one property (pay-portal's own running
-- total, kept in sync by pay_portal_increment_property_balance below) — not currently read by any
-- tracked frontend or edge-function code, but is the source of truth pay_portal_claim_payout_collections
-- reconciles.
create or replace function public.pay_portal_get_property_balance(p_property_id uuid)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_balance numeric;
begin
  if auth.role() <> 'service_role' then
    if not exists (select 1 from public.properties where id = p_property_id and owner_id = auth.uid()) then
      raise exception 'not authorized for this property';
    end if;
  end if;

  select available_balance into v_balance from public.property_balances where property_id = p_property_id;
  return coalesce(v_balance, 0);
end;
$function$;

-- Single atomic UPSERT that both pay_portal_claim_payout_collections and
-- pay_portal_release_payout_collections use to adjust property_balances.available_balance —
-- confirmed race-free (see the 20260915000000 migration's note on this table).
create or replace function public.pay_portal_increment_property_balance(p_property_id uuid, p_amount numeric)
returns void
language sql
security definer
set search_path to ''
as $function$
  insert into public.property_balances (property_id, available_balance, updated_at)
  values (p_property_id, p_amount, now())
  on conflict (property_id) do update
    set available_balance = public.property_balances.available_balance + excluded.available_balance,
        updated_at = now();
$function$;

-- Reserves collections for a specific pending payout: successful, not already linked to another
-- payout (payout_id is null), oldest first, `for update skip locked` so two concurrent payout runs
-- can't double-claim the same row. This is the actual withdrawable-balance definition the frontend's
-- getLencoBalance() (src/lib/payoutApi.ts) was recently changed to mirror.
create or replace function public.pay_portal_claim_payout_collections(p_property_id uuid, p_payout_id uuid, p_max_amount numeric default null::numeric)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_total numeric := 0;
  v_rec record;
  v_portion numeric;
  v_payout_property_id uuid;
  v_payout_status text;
begin
  if auth.role() <> 'service_role' then
    if not exists (
      select 1 from public.properties where id = p_property_id and owner_id = auth.uid()
    ) then
      raise exception 'not authorized for this property';
    end if;
  end if;

  select property_id, status into v_payout_property_id, v_payout_status
  from public.payouts where id = p_payout_id;

  if v_payout_property_id is null then
    raise exception 'payout not found';
  end if;
  if v_payout_property_id <> p_property_id then
    raise exception 'payout does not belong to this property';
  end if;
  if v_payout_status <> 'pending' then
    raise exception 'payout is not pending';
  end if;

  for v_rec in
    select id, amount, coalesce(fee_amount, 0) as fee_amount
    from public.collections
    where property_id = p_property_id
      and status = 'successful'
      and payout_id is null
    order by created_at asc
    for update skip locked
  loop
    v_portion := v_rec.amount - v_rec.fee_amount;
    if p_max_amount is not null and v_total + v_portion > p_max_amount then
      exit;
    end if;
    update public.collections set payout_id = p_payout_id where id = v_rec.id;
    v_total := v_total + v_portion;
  end loop;

  if v_total > 0 then
    perform public.pay_portal_increment_property_balance(p_property_id, -v_total);
  end if;

  return v_total;
end;
$function$;

-- Undoes a claim (payout failed/cancelled): unlinks the collections and credits the amount back to
-- property_balances.
create or replace function public.pay_portal_release_payout_collections(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_owner uuid;
  v_property_id uuid;
  v_released numeric;
begin
  if auth.role() <> 'service_role' then
    select p.owner_id into v_owner
    from public.payouts po
    join public.properties p on p.id = po.property_id
    where po.id = p_payout_id;
    if v_owner is null or v_owner <> auth.uid() then
      raise exception 'not authorized for this payout';
    end if;
  end if;

  select property_id into v_property_id from public.payouts where id = p_payout_id;

  with released as (
    update public.collections
    set payout_id = null
    where payout_id = p_payout_id
    returning amount - coalesce(fee_amount, 0) as portion
  )
  select coalesce(sum(portion), 0) into v_released from released;

  if v_released > 0 and v_property_id is not null then
    perform public.pay_portal_increment_property_balance(v_property_id, v_released);
  end if;
end;
$function$;

-- Assistant chat's "payouts summary" tool (supabase/functions/assistant-chat). NOTE: available_balance
-- here is gross successful collections minus payouts, NOT the payout_id-based claimable figure the
-- three functions above use — it can go negative/stale the same way the frontend's old getLencoBalance()
-- did, for the same reason (older payouts predating the payout_id linkage). Left as-is since fixing the
-- assistant's number was out of scope for this pass; flagged here so it isn't mistaken for already fixed.
create or replace function public.assistant_get_payouts_summary(p_property_id uuid)
returns table(available_balance numeric, recent_payouts jsonb)
language sql
stable
set search_path to 'public'
as $function$
  select
    coalesce((select sum(c.amount) from collections c where c.property_id = p_property_id and c.status = 'successful'), 0)
    - coalesce((select sum(p.amount) from payouts p where p.property_id = p_property_id and p.status in ('successful','processing')), 0)
    as available_balance,
    coalesce((
      select jsonb_agg(jsonb_build_object('amount', p.net_amount, 'status', p.status, 'created_at', p.created_at) order by p.created_at desc)
      from (select * from payouts where property_id = p_property_id order by created_at desc limit 5) p
    ), '[]'::jsonb) as recent_payouts;
$function$;
