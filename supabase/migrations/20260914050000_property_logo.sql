-- A property's own logo/photo — shown next to its name in the sidebar's account card and, more
-- importantly, on every tenant-facing portal page (PortalHeader's avatarUrl slot has been wired up
-- everywhere since 20260914010000, waiting on this to actually exist). Public bucket + plain
-- getPublicUrl, same convention as expense-photos/maintenance-photos — nothing sensitive in a
-- property logo, unlike tenant-documents' private+signed-URL approach.

alter table public.properties add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('property-logos', 'property-logos', true)
on conflict (id) do nothing;

-- Objects stored at `${property_id}/${uuid}.<ext>` — same ownership-by-folder-prefix pattern as
-- tenant-documents' storage policies. Public buckets skip RLS entirely for reads (that's what
-- getPublicUrl relies on), so only insert/update/delete need policies here.
drop policy if exists "property_logos_storage_insert" on storage.objects;
create policy "property_logos_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'property-logos'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
drop policy if exists "property_logos_storage_update" on storage.objects;
create policy "property_logos_storage_update" on storage.objects for update
  using (
    bucket_id = 'property-logos'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
drop policy if exists "property_logos_storage_delete" on storage.objects;
create policy "property_logos_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'property-logos'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );

-- Portal read: add logo_url to the one function that already looks up a property by slug.
drop function if exists public.pay_portal_get_property(text);

create function public.pay_portal_get_property(p_property_slug text)
returns table(id uuid, name text, due_day integer, logo_url text)
language sql
stable security definer
set search_path to ''
as $$
  select p.id, p.name, s.due_day, p.logo_url
  from public.properties p
  left join public.settings s on s.property_id = p.id
  where p.slug = p_property_slug;
$$;

grant execute on function public.pay_portal_get_property(text) to anon, authenticated;
