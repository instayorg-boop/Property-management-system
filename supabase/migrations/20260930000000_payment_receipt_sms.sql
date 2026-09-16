-- Tenant-facing payment receipt SMS: "Payment received: K{amount}. Your outstanding balance is
-- K{balance}. Thank you." — sent to the TENANT (not the landlord) right after any payment settles,
-- online or manual. Separate from every landlord-facing SMS type built so far (which all go through
-- payment_sms_mode/sms_notification_prefs) — this is a receipt to the person who just paid, so it's
-- always instant, never digested, and controlled by its own toggle.
alter table public.settings
  add column if not exists send_payment_receipt_sms boolean not null default true;
