-- A public bucket to hold screenshots embedded in Help & Support articles (help_blocks.image_url)
-- -- a dedicated bucket rather than reusing "Company assets" so this content stays easy to find
-- and clear out independently of branding assets.

insert into storage.buckets (id, name, public)
values ('help-screenshots', 'help-screenshots', true)
on conflict (id) do nothing;

-- Public bucket, read needs no policy (public buckets skip RLS for reads, same convention as
-- property-logos/expense-photos). Writes are rare, admin/content-tooling only (screenshotting
-- dashboard pages for help articles), not a landlord-facing feature, so any authenticated user
-- may write -- there's nothing property-scoped or sensitive in a documentation screenshot.
drop policy if exists "help_screenshots_storage_insert" on storage.objects;
create policy "help_screenshots_storage_insert" on storage.objects for insert
  with check (bucket_id = 'help-screenshots' and auth.role() = 'authenticated');
drop policy if exists "help_screenshots_storage_update" on storage.objects;
create policy "help_screenshots_storage_update" on storage.objects for update
  using (bucket_id = 'help-screenshots' and auth.role() = 'authenticated');
drop policy if exists "help_screenshots_storage_delete" on storage.objects;
create policy "help_screenshots_storage_delete" on storage.objects for delete
  using (bucket_id = 'help-screenshots' and auth.role() = 'authenticated');
