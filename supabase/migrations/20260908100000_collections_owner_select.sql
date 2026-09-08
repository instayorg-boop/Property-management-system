-- Lets the landlord's own signed-in session read their property's collections (real mobile-money
-- payments via Lenco) — needed so the Dashboard can compute "how much is actually sitting in
-- Lenco, ready to pay out" from real collection records instead of the whole ledger (which also
-- includes cash/manually-logged payments that never touched Lenco and have nothing to withdraw).
--
-- SELECT only — collections stays otherwise locked down (no insert/update/delete for
-- authenticated), so the amount/status can still only ever be set server-side
-- (pay-portal-collect-payment / lenco-webhook / pay-portal-check-collection).

drop policy if exists "collections_select_owner" on public.collections;
create policy "collections_select_owner" on public.collections for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
