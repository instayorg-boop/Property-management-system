-- Two more fields the tenant portal was missing that the landlord-side Tenant Profile page
-- already shows: the property's due day (needed to compute "next due date", the same way
-- TenantProfile.tsx's dueDateIn/furthestPaidMonth do) and the tenant's own emergency contacts.
-- Both are read-only additions to existing SECURITY DEFINER functions, gated the same way as
-- everything else already returned by them.

drop function if exists public.pay_portal_get_property(text);

create function public.pay_portal_get_property(p_property_slug text)
returns table(id uuid, name text, due_day integer)
language sql
stable security definer
set search_path to ''
as $$
  select p.id, p.name, s.due_day
  from public.properties p
  left join public.settings s on s.property_id = p.id
  where p.slug = p_property_slug;
$$;

grant execute on function public.pay_portal_get_property(text) to anon, authenticated;

drop function if exists public.pay_portal_get_tenant_v2(text, uuid, text);

create function public.pay_portal_get_tenant_v2(p_property_slug text, p_tenant_id uuid, p_session_token text)
returns table(
  id uuid, name text, room text, room_type text, status text, rent_amount numeric,
  owed_amount numeric, days_overdue integer, phone text, move_in_date text,
  emergency_contacts jsonb
)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid or expired session';
  end if;

  return query
  select t.id, t.name, r.number, rt.name, t.status, t.rent_amount, t.owed_amount, t.days_overdue,
         t.phones[1], t.move_in_date, t.emergency_contacts
  from public.tenants t
  join public.properties p on p.id = t.property_id
  left join public.rooms r on r.id = t.room_id
  left join public.room_types rt on rt.id = t.room_type_id
  where p.slug = p_property_slug and t.id = p_tenant_id;
end;
$$;

grant execute on function public.pay_portal_get_tenant_v2(text, uuid, text) to anon, authenticated;
