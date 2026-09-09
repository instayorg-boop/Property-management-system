-- Adds updated_at to the tables the PWA offline write queue can conflict-check against
-- (tenants, rooms, maintenance_reports). Needed so the client can tell "someone else changed
-- this record while I was offline" apart from "no one touched it" — see src/lib/offline/sync.ts.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.tenants add column if not exists updated_at timestamptz not null default now();
alter table public.rooms add column if not exists updated_at timestamptz not null default now();
alter table public.maintenance_reports add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_updated_at on public.tenants;
create trigger set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.rooms;
create trigger set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.maintenance_reports;
create trigger set_updated_at
  before update on public.maintenance_reports
  for each row execute function public.set_updated_at();
