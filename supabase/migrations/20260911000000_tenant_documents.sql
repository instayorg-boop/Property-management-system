-- Documents attached to a tenant (tenancy agreement, ID, acceptance letter, etc). Unlike the
-- existing expense/maintenance photo buckets (public, plain getPublicUrl), this bucket is
-- PRIVATE — these files can include a national ID or a signed agreement, so access goes through
-- short-lived signed URLs generated for the owning landlord only, not a guessable public link.

create table if not exists public.tenant_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  file_path text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists tenant_documents_tenant_id_idx on public.tenant_documents(tenant_id);

alter table public.tenant_documents enable row level security;

create policy "tenant_documents_select" on public.tenant_documents for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "tenant_documents_insert" on public.tenant_documents for insert
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "tenant_documents_delete" on public.tenant_documents for delete
  using (property_id in (select id from public.properties where owner_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('tenant-documents', 'tenant-documents', false)
on conflict (id) do nothing;

-- Objects are stored at `${property_id}/${tenant_id}/${uuid}-${filename}` — the policies check
-- the first path segment against the caller's owned properties, same ownership rule as the table.
create policy "tenant_documents_storage_select" on storage.objects for select
  using (
    bucket_id = 'tenant-documents'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
create policy "tenant_documents_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'tenant-documents'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
create policy "tenant_documents_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'tenant-documents'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
