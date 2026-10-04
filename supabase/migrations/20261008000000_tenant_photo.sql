-- A tenant's own profile photo, uploaded by the landlord — the professional-dashboard-feeling
-- avatar TenantProfile's header now has a slot for, instead of always falling back to an
-- initials circle. Public bucket + plain getPublicUrl, same convention as property-logos/
-- expense-photos/maintenance-photos — nothing sensitive in a profile photo, unlike
-- tenant-documents' private+signed-URL approach.

alter table public.tenants add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('tenant-photos', 'tenant-photos', true)
on conflict (id) do nothing;

-- Objects stored at `${property_id}/${uuid}.<ext>` — same ownership-by-folder-prefix pattern as
-- property-logos/tenant-documents. Public buckets skip RLS entirely for reads (that's what
-- getPublicUrl relies on), so only insert/update/delete need policies here.
drop policy if exists "tenant_photos_storage_insert" on storage.objects;
create policy "tenant_photos_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'tenant-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
drop policy if exists "tenant_photos_storage_update" on storage.objects;
create policy "tenant_photos_storage_update" on storage.objects for update
  using (
    bucket_id = 'tenant-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
drop policy if exists "tenant_photos_storage_delete" on storage.objects;
create policy "tenant_photos_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'tenant-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
