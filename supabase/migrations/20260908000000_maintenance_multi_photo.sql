-- Adds multi-photo support for maintenance reports. Additive only — the old `photo_url` column
-- stays in place and is backfilled into the new array column; nothing existing is dropped.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

alter table public.maintenance_reports
  add column if not exists photo_urls text[] not null default '{}';

update public.maintenance_reports
set photo_urls = array[photo_url]
where photo_urls = '{}' and photo_url is not null and photo_url <> '';

-- --- Tenant-facing pay portal ------------------------------------------------------------------
--
-- The existing pay_portal_submit_maintenance_report function was created directly in the
-- Supabase dashboard and was never committed to this repo's migration history, so its exact prior
-- body isn't known here — rather than guess at it with `create or replace` and risk breaking
-- something, this adds a new function alongside it (the app is being updated to call this one
-- instead; the old one is simply left unused, not deleted, so nothing is lost either way).
--
-- The tenant's room (already known client-side from pay_portal_get_tenant) is passed in as the
-- report's location, since the portal form itself doesn't ask for one.
create or replace function public.pay_portal_submit_maintenance_report_v2(
  p_property_slug text,
  p_tenant_id uuid,
  p_location text,
  p_description text,
  p_photo_urls text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
  v_tenant_name text;
begin
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

grant execute on function public.pay_portal_submit_maintenance_report_v2(text, uuid, text, text, text[]) to anon, authenticated;
