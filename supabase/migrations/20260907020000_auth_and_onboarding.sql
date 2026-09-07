-- Adds real landlord accounts (Supabase Auth) and scopes every table to the signed-in owner,
-- replacing the permissive `using (true)` policies that were a placeholder until auth existed.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query), or via
-- `supabase db push` with this file under supabase/migrations.
--
-- IMPORTANT — one-time manual step after you run this file:
-- Existing data (created before any account existed) has no owner yet. Once you've signed up
-- through the app's Get Started page, claim your existing property by running:
--
--   update public.properties
--   set owner_id = (select id from auth.users where email = 'you@example.com')
--   where owner_id is null;
--
-- Until that UPDATE runs, a signed-in user won't see the old property (RLS below hides rows with
-- no matching owner) — the onboarding flow will just have them create a fresh one instead, which is
-- also a fine outcome if you'd rather start clean.

-- --- Ownership ---------------------------------------------------------------

alter table public.properties
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.settings
  add column if not exists onboarding_completed boolean not null default false;

create index if not exists properties_owner_id_idx on public.properties(owner_id);

-- --- RLS: properties -----------------------------------------------------------

drop policy if exists "properties_select" on public.properties;
drop policy if exists "properties_insert" on public.properties;
drop policy if exists "properties_update" on public.properties;
drop policy if exists "properties_delete" on public.properties;
drop policy if exists "Allow all" on public.properties;

alter table public.properties enable row level security;

create policy "properties_select" on public.properties for select using (owner_id = auth.uid());
create policy "properties_insert" on public.properties for insert with check (owner_id = auth.uid());
create policy "properties_update" on public.properties for update using (owner_id = auth.uid());
create policy "properties_delete" on public.properties for delete using (owner_id = auth.uid());

-- --- RLS: tables scoped directly by property_id ---------------------------------
-- clock_entries, employees, expense_categories, expenses, institutions, invoices,
-- maintenance_reports, payroll_runs, room_types, rooms, settings, tenants

do $$
declare
  t text;
  owned_tables text[] := array[
    'clock_entries', 'employees', 'expense_categories', 'expenses', 'institutions',
    'invoices', 'maintenance_reports', 'payroll_runs', 'room_types', 'rooms', 'settings', 'tenants'
  ];
begin
  foreach t in array owned_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
    execute format('drop policy if exists "Allow all" on public.%I', t);

    execute format(
      'create policy "%s_select" on public.%I for select using (property_id in (select id from public.properties where owner_id = auth.uid()))',
      t, t
    );
    execute format(
      'create policy "%s_insert" on public.%I for insert with check (property_id in (select id from public.properties where owner_id = auth.uid()))',
      t, t
    );
    execute format(
      'create policy "%s_update" on public.%I for update using (property_id in (select id from public.properties where owner_id = auth.uid()))',
      t, t
    );
    execute format(
      'create policy "%s_delete" on public.%I for delete using (property_id in (select id from public.properties where owner_id = auth.uid()))',
      t, t
    );
  end loop;
end $$;

-- --- RLS: ledger_entries (scoped via its tenant's property) ----------------------

drop policy if exists "ledger_entries_select" on public.ledger_entries;
drop policy if exists "ledger_entries_insert" on public.ledger_entries;
drop policy if exists "ledger_entries_update" on public.ledger_entries;
drop policy if exists "ledger_entries_delete" on public.ledger_entries;
drop policy if exists "Allow all" on public.ledger_entries;

alter table public.ledger_entries enable row level security;

create policy "ledger_entries_select" on public.ledger_entries for select using (
  tenant_id in (select id from public.tenants where property_id in (select id from public.properties where owner_id = auth.uid()))
);
create policy "ledger_entries_insert" on public.ledger_entries for insert with check (
  tenant_id in (select id from public.tenants where property_id in (select id from public.properties where owner_id = auth.uid()))
);
create policy "ledger_entries_update" on public.ledger_entries for update using (
  tenant_id in (select id from public.tenants where property_id in (select id from public.properties where owner_id = auth.uid()))
);
create policy "ledger_entries_delete" on public.ledger_entries for delete using (
  tenant_id in (select id from public.tenants where property_id in (select id from public.properties where owner_id = auth.uid()))
);

-- --- RLS: invoice_tenants (scoped via its invoice's property) --------------------

drop policy if exists "invoice_tenants_select" on public.invoice_tenants;
drop policy if exists "invoice_tenants_insert" on public.invoice_tenants;
drop policy if exists "invoice_tenants_update" on public.invoice_tenants;
drop policy if exists "invoice_tenants_delete" on public.invoice_tenants;
drop policy if exists "Allow all" on public.invoice_tenants;

alter table public.invoice_tenants enable row level security;

create policy "invoice_tenants_select" on public.invoice_tenants for select using (
  invoice_id in (select id from public.invoices where property_id in (select id from public.properties where owner_id = auth.uid()))
);
create policy "invoice_tenants_insert" on public.invoice_tenants for insert with check (
  invoice_id in (select id from public.invoices where property_id in (select id from public.properties where owner_id = auth.uid()))
);
create policy "invoice_tenants_update" on public.invoice_tenants for update using (
  invoice_id in (select id from public.invoices where property_id in (select id from public.properties where owner_id = auth.uid()))
);
create policy "invoice_tenants_delete" on public.invoice_tenants for delete using (
  invoice_id in (select id from public.invoices where property_id in (select id from public.properties where owner_id = auth.uid()))
);

-- --- Public tenant-payment portal is unaffected ----------------------------------
-- The pay_portal_* functions (see docs/BACKEND.md) are SECURITY DEFINER, so they read/write
-- through the function owner's privileges, not the anonymous caller's — they bypass every policy
-- above and keep working for tenants who aren't signed in at all.
