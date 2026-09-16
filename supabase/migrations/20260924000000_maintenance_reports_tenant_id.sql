-- maintenance_reports.tenant was a plain name string with no relation to tenants.id, so two
-- tenants sharing a name (including a re-added tenant reusing a departed tenant's name) show up
-- as the same person's maintenance history on the landlord side. Add a real FK; the name column
-- stays (still shown for "Landlord"-authored general reports, which have no tenant), but any
-- lookup that ties a report to a specific tenant profile must use tenant_id going forward.
-- Existing rows can't be safely backfilled by name (that's the exact ambiguity being fixed), so
-- they're left with tenant_id null; they still display via the legacy tenant-name fallback.

alter table public.maintenance_reports
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null;

create index if not exists maintenance_reports_tenant_id_idx on public.maintenance_reports(tenant_id);

-- Reissue the portal submit function so it stores tenant_id (it already verifies p_tenant_id via
-- the session check, it just wasn't persisting it).
drop function if exists public.pay_portal_submit_maintenance_report_v2(text, uuid, text, text, text, text[]);

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

  insert into public.maintenance_reports (property_id, tenant, tenant_id, location, description, photo_urls, status, unread, submitted_at)
  values (v_property_id, v_tenant_name, p_tenant_id, p_location, p_description, coalesce(p_photo_urls, '{}'), 'open', true, now());
end;
$$;

grant execute on function public.pay_portal_submit_maintenance_report_v2(text, uuid, text, text, text, text[]) to anon, authenticated;
