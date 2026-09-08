-- OTP-gated identity verification for the public tenant payment portal.
--
-- Design: search-by-name (pay_portal_search_tenants_v2) lets a visitor find and claim a tenant
-- identity, but that alone unlocks nothing. They must then receive and enter an OTP sent to the
-- phone number on file before any balance/ledger data or payment action becomes available. This
-- is enforced at the DATABASE level (not just hidden in the UI) — the _v2 functions below require
-- a valid, unexpired portal_sessions token, so calling pay_portal_get_tenant_v2 or
-- pay_portal_get_ledger_v2 directly (e.g. via supabase.rpc from devtools, bypassing the frontend
-- entirely) without a real session still fails. This matters because the old
-- pay_portal_get_tenant/pay_portal_get_ledger only ever required knowing a tenant's UUID, and the
-- new search feature makes those UUIDs discoverable — this closes that gap.
--
-- Both new tables have RLS enabled with NO policies, so they're completely unreachable via
-- PostgREST/anon/authenticated — only SECURITY DEFINER functions (which run as the table owner,
-- bypassing RLS) and the edge functions (service-role key, also bypasses RLS) can touch them.
--
-- OTP codes and session tokens are stored as SHA-256 hashes, never plaintext, via pgcrypto's
-- digest() — same principle as a password hash, so a database read alone can't be used to log in
-- as a tenant.

create extension if not exists pgcrypto;

create table if not exists public.portal_otp_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portal_otp_codes_tenant_id_created_at_idx on public.portal_otp_codes(tenant_id, created_at desc);

alter table public.portal_otp_codes enable row level security;

create table if not exists public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists portal_sessions_token_hash_idx on public.portal_sessions(token_hash);

alter table public.portal_sessions enable row level security;

-- --- Session-gated versions of the sensitive pay-portal reads/writes -----------------------------
-- Each checks for a matching, unexpired portal_sessions row before doing anything else. The old
-- (ungated) versions are left untouched per this project's additive-migration convention, but
-- payPortal.ts is being repointed at these _v2 ones in the same change — see that file's comment.

create or replace function public.pay_portal_verify_session(p_tenant_id uuid, p_session_token text)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists(
    select 1 from public.portal_sessions
    where tenant_id = p_tenant_id
      and token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex')
      and expires_at > now()
  );
$$;

create or replace function public.pay_portal_get_tenant_v2(p_property_slug text, p_tenant_id uuid, p_session_token text)
returns table(id uuid, name text, room text, room_type text, status text, rent_amount numeric, owed_amount numeric, days_overdue integer)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid or expired session';
  end if;

  return query
  select t.id, t.name, r.number, rt.name, t.status, t.rent_amount, t.owed_amount, t.days_overdue
  from public.tenants t
  join public.properties p on p.id = t.property_id
  left join public.rooms r on r.id = t.room_id
  left join public.room_types rt on rt.id = t.room_type_id
  where p.slug = p_property_slug and t.id = p_tenant_id;
end;
$$;

create or replace function public.pay_portal_get_ledger_v2(p_tenant_id uuid, p_session_token text)
returns table(label text, amount numeric, paid_amount numeric, status text)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid or expired session';
  end if;

  return query
  select l.label, l.amount, l.paid_amount, l.status
  from public.ledger_entries l
  where l.tenant_id = p_tenant_id
  order by l.created_at desc;
end;
$$;

create or replace function public.pay_portal_log_payment_v2(p_tenant_id uuid, p_amount numeric, p_label text, p_session_token text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_prev_status text;
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid or expired session';
  end if;

  select status into v_prev_status from public.tenants where id = p_tenant_id;
  if v_prev_status is null then
    raise exception 'tenant not found';
  end if;

  update public.tenants
  set status = 'paid',
      owed_amount = 0,
      on_time_count = case when v_prev_status in ('overdue', 'unpaid') then on_time_count else on_time_count + 1 end,
      total_months_count = total_months_count + 1
  where id = p_tenant_id;

  insert into public.ledger_entries (tenant_id, label, amount, status)
  values (p_tenant_id, coalesce(p_label, 'Rent payment'), p_amount, 'paid');
end;
$$;

grant execute on function public.pay_portal_verify_session(uuid, text) to anon, authenticated;
grant execute on function public.pay_portal_get_tenant_v2(text, uuid, text) to anon, authenticated;
grant execute on function public.pay_portal_get_ledger_v2(uuid, text) to anon, authenticated;
grant execute on function public.pay_portal_log_payment_v2(uuid, numeric, text, text) to anon, authenticated;
