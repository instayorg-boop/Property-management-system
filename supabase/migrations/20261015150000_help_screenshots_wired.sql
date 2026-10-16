-- Wires the 12 beautified screenshots (uploaded to the help-screenshots bucket under
-- articles/<slug>.png) into the help_blocks they illustrate, and fixes a bug found while
-- uploading them: the UPDATE policy on help-screenshots objects had no WITH CHECK, so an
-- upsert's ON CONFLICT DO UPDATE path was rejected by RLS even though a plain INSERT worked.

drop policy if exists "help_screenshots_storage_update" on storage.objects;
create policy "help_screenshots_storage_update" on storage.objects for update
  using (bucket_id = 'help-screenshots' and auth.role() = 'authenticated')
  with check (bucket_id = 'help-screenshots' and auth.role() = 'authenticated');

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/dashboard.png'
  where id = '0a0e0639-f6ff-49a6-baf6-d0daf1eb983f'; -- Getting Started / Understanding your dashboard / Your at a glance numbers

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/sidebar-nav.png'
  where id = 'f4b5aa4f-edcd-4924-abc8-d0969af71e6c'; -- Getting Started / Finding your way around / Four sections of the sidebar

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/add-tenant.png'
  where id = '8c3004d0-d7ee-4492-a8ba-4ffd97d4f194'; -- Tenants / Adding a tenant / What you will need

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/tenants-list.png'
  where id = 'b0a7d429-995b-431b-a6ce-81fa13720196'; -- Tenants / Moving a tenant out / What happens when you move a tenant out

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/rooms.png'
  where id = '4a929df5-462a-41aa-aa79-68d9f2ca43a3'; -- Rooms / Setting up room types and rooms / Creating a room type

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/rent.png'
  where id = '592b86b0-76fa-43cb-840e-2ac8cee86147'; -- Rent & Payments / Reading what a tenant owes / The four statuses

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/rent-log-payment.png'
  where id = '3feb6927-3a0e-469d-88b8-f4ed53a7097c'; -- Rent & Payments / Logging a payment / Log a manual payment

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/online-payments.png'
  where id = '328566d4-f898-4d36-948e-50652ea52d90'; -- Payouts & Withdrawals / Withdrawing your money / Start a transfer

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/maintenance.png'
  where id = '597214d8-9956-4827-ab81-c54ebc9b2035'; -- Maintenance / Managing maintenance requests / How requests reach you

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/expense-tracker.png'
  where id = '29937942-120b-45fb-ae61-43bae37be1c4'; -- Expenses / Logging an expense / Adding the expense

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/reports.png'
  where id = '33bbbb77-1466-4661-b4fc-516855550b1e'; -- Reports / Understanding your reports / What you will find in Reports

update public.help_blocks set image_url = 'https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/help-screenshots/articles/settings.png'
  where id = 'c531f585-ef29-45c6-ba31-706f7af48b69'; -- Account & Settings / Your property and business settings / Property details
