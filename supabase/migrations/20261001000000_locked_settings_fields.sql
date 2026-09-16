-- Two fields the landlord shouldn't be able to change freely, same principle as a social platform
-- locking a username after a few changes: the property name (shown on invoices, the tenant portal,
-- receipts — changing it often is confusing for tenants) and the account email (an identity field,
-- not something to casually retype). Enforced in the database, not just hidden in the UI, so it
-- can't be bypassed by calling the API directly.

alter table public.properties
  add column if not exists name_change_count int not null default 0;

create or replace function public.enforce_property_name_change_limit()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name then
    if old.name_change_count >= 3 then
      raise exception 'Property name can only be changed 3 times.';
    end if;
    new.name_change_count := old.name_change_count + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_property_name_change_limit on public.properties;
create trigger trg_enforce_property_name_change_limit
  before update on public.properties
  for each row execute function public.enforce_property_name_change_limit();

create or replace function public.prevent_account_email_change()
returns trigger
language plpgsql
as $$
begin
  if old.account_email is not null and old.account_email <> '' and new.account_email is distinct from old.account_email then
    raise exception 'Email address cannot be changed once set.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_account_email_change on public.settings;
create trigger trg_prevent_account_email_change
  before update on public.settings
  for each row execute function public.prevent_account_email_change();
