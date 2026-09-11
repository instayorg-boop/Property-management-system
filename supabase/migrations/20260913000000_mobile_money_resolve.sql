-- Superseded by name resolution: Lenco's /access/v2/resolve/mobile-money endpoint turned out to be
-- confirmed after all, so adding a mobile-money payout recipient now works the same way a bank
-- account does (resolve-mobile-money -> create-mobile-money-recipient, landlord confirms the
-- resolved name) instead of proving phone ownership via SMS OTP. payout_recipient_otp_codes was
-- only ever used for that SMS-OTP step and is now dead — dropped rather than left as unused debt.
-- payout_withdrawal_otp_codes is untouched: that's the separate email-OTP second factor on actually
-- sending a withdrawal, unrelated to how a recipient gets added.

drop table if exists public.payout_recipient_otp_codes;
