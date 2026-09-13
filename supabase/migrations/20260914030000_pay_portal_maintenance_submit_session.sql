-- pay_portal_submit_maintenance_report_v2 only ever checked that p_tenant_id belonged to
-- p_property_slug — knowing a tenant's UUID (discoverable, e.g. from the arrears/rent-roll pages'
-- URLs before this session's portalToken migration) was enough to file reports under their name,
-- with no proof of being that tenant. Every other pay_portal_* write already requires a verified
-- session (see pay_portal_verify_session); this closes that one gap using the same check.

drop function if exists public.pay_portal_submit_maintenance_report_v2(text, uuid, text, text, text[]);

create or replace function public.pay_portal_submit_maintenance_report_v2(
  p_property_slug text,
  p_tenant_id uuid,
  p_location text,
  p_description text,
  p_session_token text,
  p_photo_urls text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_property_id uuid;
  v_tenant_name text;
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid session';
  end if;

  select id into v_property_id from public.properties where slug = p_property_slug;
  if v_property_id is null then
    raise exception 'Unknown property';
  end if;

  select name into v_tenant_name from public.tenants where id = p_tenant_id and property_id = v_property_id;
  if v_tenant_name is null then
    raise exception 'Unknown tenant';
  end if;

  insert into public.maintenance_reports (property_id, tenant, location, description, photo_urls, status, unread, submitted_at)
  values (v_property_id, v_tenant_name, p_location, p_description, coalesce(p_photo_urls, '{}'), 'open', true, now());
end;
$$;

grant execute on function public.pay_portal_submit_maintenance_report_v2(text, uuid, text, text, text, text[]) to anon, authenticated;
