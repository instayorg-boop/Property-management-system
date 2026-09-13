-- The tenant payment portal's whole point is a short link (pay.instay.co/p/<token>) that a
-- landlord sends once and a tenant can keep using indefinitely — but pay_portal_verify_session
-- was checking a *separate*, 30-minute-lived portal_sessions row instead of the token itself, so
-- the link would stop working within half an hour (or as soon as sessionStorage was cleared),
-- even though the token itself was never meant to expire.
--
-- Fix: verify directly against the tenant's own permanent portal_token (already the trust
-- boundary /p/:token relies on — see pay-portal-resolve-token) instead of an ephemeral session
-- row. Every function downstream of pay_portal_verify_session (get_tenant_v2, get_ledger_v2,
-- log_payment_v2, the phone/collections functions) keeps its existing signature — the "session
-- token" they're passed is now simply expected to be the tenant's portal_token, which behaves
-- exactly like a durable resource id, the same way a listing id never expires.

create or replace function public.pay_portal_verify_session(p_tenant_id uuid, p_session_token text)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists(
    select 1 from public.tenants
    where id = p_tenant_id
      and active = true
      and portal_token = upper(trim(p_session_token))
  );
$$;
