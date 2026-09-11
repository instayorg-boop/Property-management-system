-- Multiple payout recipients per property (bank and/or mobile money) instead of one bank account,
-- plus the two OTP tables that gate adding a mobile-money recipient (phone ownership, via SMS) and
-- authorizing an actual withdrawal (a second factor to the property's registered account email).
--
-- There is no confirmed Lenco API for resolving a mobile-money account holder's name (unlike banks,
-- where resolve-bank-account is a real, confirmed call) or for disbursing TO a mobile-money number
-- (unlike lenco-payout's confirmed bank-transfer endpoint) — so a mobile-money recipient is
-- identified by its OTP-verified phone number, not a resolved name, and actually sending a payout to
-- one is intentionally not wired up yet (see lenco-payout's own comment). This migration only adds
-- the data model and verification plumbing; it does not claim to move money to mobile money.

alter table public.payout_recipients
  add column if not exists type text not null default 'bank' check (type in ('bank', 'mobile-money')),
  add column if not exists phone_number text,
  add column if not exists provider text check (provider in ('mtn', 'airtel', 'zamtel')),
  add column if not exists is_default boolean not null default false;

-- Bank-only fields were `not null` when every recipient was necessarily a bank account — relax that
-- now that a row can be mobile-money instead, which has none of them.
alter table public.payout_recipients alter column lenco_recipient_id drop not null;
alter table public.payout_recipients alter column account_name drop not null;
alter table public.payout_recipients alter column account_number drop not null;
alter table public.payout_recipients alter column bank_code drop not null;

-- Existing rows predate multi-recipient support — each one was implicitly "the" payout account.
update public.payout_recipients set is_default = true where is_default = false;

create index if not exists payout_recipients_property_id_type_idx on public.payout_recipients(property_id, type);

-- --- OTP for adding a mobile-money recipient (proves the landlord controls that phone number) ----
-- Same shape and RLS posture as portal_otp_codes (20260908040000_pay_portal_otp.sql): RLS enabled
-- with NO policies, so only a service-role edge function can ever touch this table.

create table if not exists public.payout_recipient_otp_codes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  phone_number text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payout_recipient_otp_codes_property_id_created_at_idx
  on public.payout_recipient_otp_codes(property_id, created_at desc);

alter table public.payout_recipient_otp_codes enable row level security;

-- --- OTP for authorizing an actual withdrawal (second factor, sent to the account's registered
-- email) -------------------------------------------------------------------------------------------
-- `confirmation_token_hash` is issued once the code is verified and is what lenco-payout itself
-- requires and re-validates server-side before it will move money — the point of this table isn't
-- just to gate the UI, a client that skips straight to invoking lenco-payout without ever verifying
-- a code still can't get a transfer to execute.

create table if not exists public.payout_withdrawal_otp_codes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count int not null default 0,
  consumed_at timestamptz,
  confirmation_token_hash text,
  confirmation_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payout_withdrawal_otp_codes_property_id_created_at_idx
  on public.payout_withdrawal_otp_codes(property_id, created_at desc);
create index if not exists payout_withdrawal_otp_codes_confirmation_token_hash_idx
  on public.payout_withdrawal_otp_codes(confirmation_token_hash);

alter table public.payout_withdrawal_otp_codes enable row level security;
