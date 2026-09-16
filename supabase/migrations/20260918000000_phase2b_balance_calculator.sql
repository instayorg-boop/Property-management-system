-- Phase 2B — the authoritative balance-calculation function (design approved in chat history).
-- Purely additive: one new read-only function. Does NOT touch tenants.owed_amount, does NOT add a
-- trigger, does NOT change any payment flow or ledger row, does NOT touch the UI, does NOT add
-- billing-period logic, and does NOT synchronize anything automatically. It exists standalone,
-- unused by any current application code path, purely as a comparison/reporting tool for a later
-- phase to act on deliberately.

create or replace function public.calculate_tenant_balance(p_tenant_id uuid)
returns table (
  balance numeric,
  total_charges numeric,
  total_payments numeric,
  total_adjustments numeric,
  total_penalties numeric
)
language sql
stable
set search_path to ''
as $$
  with contributions as (
    select
      -- Net effect on the balance. Ordered rules — a voided or non-affecting row contributes
      -- nothing regardless of anything else about it; an explicitly-typed new-model row is
      -- trusted at face value (charge/penalty positive, payment negative, adjustment/credit
      -- signed, per the approved event model); everything else falls back to the legacy
      -- interpretation of amount/paid_amount/status that predates event_type existing at all.
      case
        when le.voided_at is not null then 0
        when le.affects_balance = false then 0
        when le.event_type is not null then le.amount
        when le.source = 'adjustment' then le.amount
        when le.source in ('manual', 'lenco') then
          le.amount - coalesce(le.paid_amount, case when le.status = 'paid' then le.amount else 0 end)
        else 0
      end as contribution,

      -- Reporting buckets — independent of `contribution` above, but constructed so
      -- total_charges - total_payments + total_penalties + total_adjustments always reconciles
      -- back to sum(contribution). Each is 0 wherever contribution is 0.
      case
        when le.voided_at is not null or le.affects_balance = false then 0
        when le.event_type = 'charge' then le.amount
        when le.event_type is null and le.source in ('manual', 'lenco') then le.amount
        else 0
      end as charge_amount,

      case
        when le.voided_at is not null or le.affects_balance = false then 0
        when le.event_type = 'payment' then abs(le.amount)
        when le.event_type is null and le.source in ('manual', 'lenco') then
          coalesce(le.paid_amount, case when le.status = 'paid' then le.amount else 0 end)
        else 0
      end as payment_amount,

      case
        when le.voided_at is not null or le.affects_balance = false then 0
        when le.event_type = 'penalty' then le.amount
        else 0
      end as penalty_amount,

      case
        when le.voided_at is not null or le.affects_balance = false then 0
        when le.event_type in ('adjustment', 'credit') then le.amount
        when le.event_type is null and le.source = 'adjustment' then le.amount
        else 0
      end as adjustment_amount
    from public.ledger_entries le
    where le.tenant_id = p_tenant_id
  )
  select
    coalesce(sum(contribution), 0)      as balance,
    coalesce(sum(charge_amount), 0)     as total_charges,
    coalesce(sum(payment_amount), 0)    as total_payments,
    coalesce(sum(adjustment_amount), 0) as total_adjustments,
    coalesce(sum(penalty_amount), 0)    as total_penalties
  from contributions;
$$;

-- SECURITY: deliberately NOT `security definer`, unlike the pay_portal_* functions (those exist
-- to serve the anonymous/session-token-authenticated tenant portal, which has no real auth.uid()
-- and therefore genuinely needs to bypass RLS after verifying a session token by hand). This
-- function is landlord-dashboard-only — every caller is a real authenticated Supabase user — so it
-- runs SECURITY INVOKER (the default; the absence of the keyword *is* the choice) precisely so
-- the query inside it executes AS the calling landlord and ledger_entries'/tenants' existing RLS
-- policies (tenant_id/property_id scoped to owner_id = auth.uid(), see auth_and_onboarding.sql)
-- apply automatically — the same pattern assistant_get_overdue_tenants and the other assistant_*
-- reporting functions already use. A landlord passing a tenant_id they don't own gets an all-zero
-- row back (RLS silently filters the underlying ledger_entries to nothing), never another
-- landlord's real financial data.
--
-- PostgreSQL grants EXECUTE to PUBLIC by default on function creation — revoked here so calling
-- this requires being an authenticated Supabase user at all (defense in depth on top of RLS, not
-- a substitute for it): an anonymous/anon-role caller is blocked at the grant level before RLS
-- even comes into play, matching this function having no tenant-portal use case whatsoever.
revoke execute on function public.calculate_tenant_balance(uuid) from public;
grant execute on function public.calculate_tenant_balance(uuid) to authenticated;
