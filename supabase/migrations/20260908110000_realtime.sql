-- Enables Supabase Realtime (Postgres logical replication) on the tables the dashboard needs to
-- update live without a manual refresh: a tenant's maintenance report should appear (and the
-- sidebar's unread badge update) the moment they submit it from the portal, and a payment landing
-- via lenco-webhook should show up on the Rent page / tenant profile without reloading.
--
-- RLS already scopes what each subscriber can actually receive (Realtime respects RLS on
-- `postgres_changes` subscriptions) — this only controls which tables broadcast changes at all.

alter publication supabase_realtime add table public.maintenance_reports;
alter publication supabase_realtime add table public.tenants;
alter publication supabase_realtime add table public.ledger_entries;
