-- The Help & Support topic cards (HelpSupport.tsx) showed "N guides" under each title, which the
-- content owner (Marcus) doesn't want -- see src/landlord/pages/Settings.tsx's card treatment for
-- the pattern this should match instead: a short one-line description of what's inside, the same
-- way a landlord doesn't get a preview of which articles exist, just what the topic is about.

alter table public.help_groups add column if not exists description text not null default '';

update public.help_groups set description = case slug
  when 'getting-started' then 'Set up your property and find your way around the dashboard.'
  when 'tenants' then 'Add, edit, move out, and manage every tenant on your property.'
  when 'rooms' then 'Set up room types, rooms, and reservations.'
  when 'rent-payments' then 'Log payments, track balances, and automate reminders.'
  when 'payouts' then 'Move collected rent to your bank account or mobile money.'
  when 'maintenance' then 'See tenant requests come in and mark them resolved.'
  when 'expenses' then 'Record costs against your property as they happen.'
  when 'reports' then 'Read your overdue rent, income, and occupancy reports.'
  when 'account-settings' then 'Manage your account, property details, and preferences.'
  when 'notifications-tasks' then 'Stay on top of what needs your attention each day.'
  else description
end
where description = '';
