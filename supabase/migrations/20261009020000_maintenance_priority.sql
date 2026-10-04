-- Lets a report be triaged at a glance (a burst pipe vs a squeaky door shouldn't look the same in
-- the list) — defaults every existing row to 'medium' since there's no way to infer true severity
-- from history.
alter table public.maintenance_reports
  add column if not exists priority text not null default 'medium'
  check (priority in ('low', 'medium', 'high', 'urgent'));
