-- OTP-gated phone verification during landlord sign-up (GetStarted.tsx), so the phone that ends
-- up in Settings > SMS as the alert number is already proven to belong to the person signing up,
-- instead of relying on them finding Settings later to set it up — see request-signup-otp /
-- verify-signup-otp. Same shape as portal_otp_codes (pay_portal_otp migration): service-role-only
-- (RLS enabled, no policies), codes hashed with sha256Hex, never stored in plaintext.
-- There's no user/tenant id yet at this point in the flow, so codes are keyed by phone number.

create table if not exists public.signup_otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists signup_otp_codes_phone_created_at_idx on public.signup_otp_codes(phone, created_at desc);

alter table public.signup_otp_codes enable row level security;
