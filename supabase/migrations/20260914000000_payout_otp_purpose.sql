-- Extends the email-OTP confirmation (previously only gating an actual withdrawal) to also gate
-- ADDING a new payout method — bank or mobile money. Adding a recipient is just as security-
-- sensitive as sending money to one (it decides where future money CAN go), so it gets the same
-- "prove it's really you via a code emailed to the account" step, not just an after-the-fact alert
-- email. `purpose` scopes a confirmation token to the action it was actually issued for — a token
-- verified for "add_recipient" cannot be reused to authorize a "withdrawal" and vice versa, checked
-- by every consumer (lenco-payout, create-payout-recipient, create-mobile-money-recipient) as part
-- of the same update-and-check that burns the token.

alter table public.payout_withdrawal_otp_codes
  add column if not exists purpose text not null default 'withdrawal' check (purpose in ('withdrawal', 'add_recipient'));
