-- Lets a landlord read their own property's collection attempts (tenant mobile-money rent
-- payments) — the Online payments page's new "Payments received" tab. The table was created
-- RLS-locked-down-with-no-policies (only SECURITY DEFINER portal functions and service-role edge
-- functions could touch it), which was correct for the tenant-facing portal writes but left
-- landlords with no way to read their own collections. Select-only: writes stay exactly as
-- restricted as before, only a read path is added.

drop policy if exists "collections_select" on public.collections;

create policy "collections_select" on public.collections for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
