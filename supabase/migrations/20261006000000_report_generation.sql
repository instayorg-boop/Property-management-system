-- Backs the new /reports "generate a document" flow (generate-report edge function): a private
-- storage bucket for the finished PDF/CSV files, and a table recording each generation so the
-- Reports hub's "Report history" tab has something real to list instead of a permanent empty state.
--
-- Same ownership pattern as tenant_documents (20260911000000): RLS on the table keyed on
-- property_id -> properties.owner_id, and storage.objects policies keyed on the first path segment
-- of the object name being an owned property_id. Objects live at
-- `${property_id}/${report_type}-${YYYY-MM-DD}-${uuid}.${ext}`.

create table if not exists public.report_history (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  report_type text not null check (report_type in ('income-expenses', 'occupancy-rate', 'arrears-delinquency')),
  format text not null check (format in ('pdf', 'csv')),
  date_from date not null,
  date_to date not null,
  file_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists report_history_property_created_idx on public.report_history (property_id, created_at desc);

alter table public.report_history enable row level security;

create policy "report_history_select" on public.report_history for select
  using (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "report_history_insert" on public.report_history for insert
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy "report_history_delete" on public.report_history for delete
  using (property_id in (select id from public.properties where owner_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy "reports_storage_select" on storage.objects for select
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
create policy "reports_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
create policy "reports_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1]::uuid in (select id from public.properties where owner_id = auth.uid())
  );
