-- Adds move_in_date to the tenant portal's own-record read — the redesigned portal landing page
-- mirrors the landlord-side Tenant Profile page's identity row ("Tenant since <date>"), which
-- needs a real date the previous shape didn't carry.

drop function if exists public.pay_portal_get_tenant_v2(text, uuid, text);

create function public.pay_portal_get_tenant_v2(p_property_slug text, p_tenant_id uuid, p_session_token text)
returns table(
  id uuid, name text, room text, room_type text, status text, rent_amount numeric,
  owed_amount numeric, days_overdue integer, phone text, move_in_date date
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
  select t.id, t.name, r.number, rt.name, t.status, t.rent_amount, t.owed_amount, t.days_overdue, t.phones[1], t.move_in_date
  from public.tenants t
  join public.properties p on p.id = t.property_id
  left join public.rooms r on r.id = t.room_id
  left join public.room_types rt on rt.id = t.room_type_id
  where p.slug = p_property_slug and t.id = p_tenant_id;
end;
$$;

grant execute on function public.pay_portal_get_tenant_v2(text, uuid, text) to anon, authenticated;
