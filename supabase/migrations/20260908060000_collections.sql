-- Real mobile-money rent collection via Lenco, replacing TenantBalance.tsx's previous fully
-- simulated "pay" flow (a fake setTimeout spinner that just wrote a ledger row with no real
-- payment ever happening).
--
-- One row per attempted collection. Created "pending" before the Lenco call (server-side, amount
-- computed from the tenant's actual owed_amount — never trusted from the request), then updated by
-- lenco-webhook once Lenco confirms collection.successful / collection.failed. The tenant's ledger
-- is only ever updated from the webhook (a real confirmation), never from the client directly —
-- unlike the old logPortalPayment path this replaces for the "pay now" flow.
--
-- Same RLS-locked-down-with-no-policies pattern as portal_otp_codes/portal_sessions: only
-- SECURITY DEFINER functions and the service-role edge functions can touch this table.

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  amount numeric not null,
  phone text not null,
  operator text not null check (operator in ('mtn', 'airtel', 'zamtel')),
  status text not null default 'pending' check (status in ('pending', 'pay-offline', 'successful', 'failed')),
  lenco_collection_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_tenant_id_idx on public.collections(tenant_id);
create index if not exists collections_lenco_collection_id_idx on public.collections(lenco_collection_id);

alter table public.collections enable row level security;

-- --- Session-gated status check ------------------------------------------------------------
-- The only way the frontend reads a collection's status — requires the same verified OTP session
-- as everything else in the portal (see pay_portal_verify_session in 20260908040000_pay_portal_otp.sql).

create or replace function public.pay_portal_get_collection_status(p_collection_id uuid, p_tenant_id uuid, p_session_token text)
returns table(status text, failure_reason text)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid or expired session';
  end if;

  return query
  select c.status, c.failure_reason
  from public.collections c
  where c.id = p_collection_id and c.tenant_id = p_tenant_id;
end;
$$;

grant execute on function public.pay_portal_get_collection_status(uuid, uuid, text) to anon, authenticated;
