-- Per-tenant overrides for rent due day / grace period, editable from the Add Tenant page.
-- Null means "use the property's default from Settings" — most tenants will have no override.
alter table public.tenants add column if not exists due_day integer;
alter table public.tenants add column if not exists grace_period_days integer;
