-- The public tenant-payment portal's search (pay_portal_search_tenants) currently returns each
-- tenant's owed_amount, which SelectTenant.tsx displays as a red/green balance pill — meaning
-- ANY unauthenticated visitor to a property's payment link can browse every tenant's outstanding
-- balance before proving who they are. Name + room is a much smaller exposure (anyone who knows a
-- tenant lives there already knows their name) and is needed for the search-by-name flow to work
-- at all; balance is the part that needs to stay behind proof-of-identity (an OTP gate, coming in
-- a later migration).
--
-- Additive per this project's convention: the old pay_portal_search_tenants (with owed_amount) is
-- left untouched — its only caller, payPortal.ts's searchPortalTenants, is being repointed at this
-- v2 function in the same change, but the old one stays in case anything else still depends on it.
--
-- Run via `supabase db push`, or paste into the Supabase SQL editor.

create or replace function public.pay_portal_search_tenants_v2(p_property_slug text)
returns table(id uuid, name text, room text)
language sql
stable security definer
set search_path to ''
as $$
  select t.id, t.name, r.number
  from public.tenants t
  join public.properties p on p.id = t.property_id
  left join public.rooms r on r.id = t.room_id
  where p.slug = p_property_slug and t.active = true;
$$;

grant execute on function public.pay_portal_search_tenants_v2(text) to anon, authenticated;
