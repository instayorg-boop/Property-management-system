-- Lets a tenant see their own maintenance reports on the payment portal (read-only — filing a new
-- one isn't built here, only viewing what's already on file). Same trust boundary as every other
-- pay_portal_* function: the caller already proved identity via their permanent portal_token (see
-- pay_portal_verify_session), which is enough to read their own data, same as it already is for
-- balance/ledger/phone.
--
-- maintenance_reports has no tenant_id column — it only stores a free-text `tenant` name (see
-- Maintenance.tsx, which matches the same way: `r.tenant === tenant.name`), so this function
-- matches on name + property_id the same way the landlord-side UI already does. Not a new gap:
-- it's the existing matching convention, just reused here.

create or replace function public.pay_portal_get_maintenance_v1(p_tenant_id uuid, p_session_token text)
returns table(
  id uuid, location text, description text, status text, submitted_at timestamptz, photo_urls text[]
)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid session';
  end if;

  return query
  select r.id, r.location, r.description, r.status, r.submitted_at, r.photo_urls
  from public.maintenance_reports r
  join public.tenants t on t.property_id = r.property_id and t.name = r.tenant
  where t.id = p_tenant_id
  order by r.submitted_at desc;
end;
$$;

grant execute on function public.pay_portal_get_maintenance_v1(uuid, text) to anon, authenticated;
