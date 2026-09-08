-- Adds the tenant's own phone number to pay_portal_get_tenant_v2's return, so the mobile-money
-- payment step can pre-fill the phone number and auto-detect the network (MTN/Airtel/Zamtel)
-- instead of asking the tenant to retype a number they just proved they own via OTP. Safe to
-- return here specifically because this function already requires a verified session (see
-- pay_portal_verify_session in 20260908040000_pay_portal_otp.sql) — showing someone their own
-- phone number back to them isn't an exposure.

drop function if exists public.pay_portal_get_tenant_v2(text, uuid, text);

create or replace function public.pay_portal_get_tenant_v2(p_property_slug text, p_tenant_id uuid, p_session_token text)
returns table(id uuid, name text, room text, room_type text, status text, rent_amount numeric, owed_amount numeric, days_overdue integer, phone text)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid or expired session';
  end if;

  return query
  select t.id, t.name, r.number, rt.name, t.status, t.rent_amount, t.owed_amount, t.days_overdue, t.phones[1]
  from public.tenants t
  join public.properties p on p.id = t.property_id
  left join public.rooms r on r.id = t.room_id
  left join public.room_types rt on rt.id = t.room_type_id
  where p.slug = p_property_slug and t.id = p_tenant_id;
end;
$$;

grant execute on function public.pay_portal_get_tenant_v2(text, uuid, text) to anon, authenticated;
