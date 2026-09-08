# Edge functions

These exist for operations that must never run with a secret key in the browser — money
transfers and third-party API calls. Everything else in this app talks to Supabase directly
from the client with the anon key (see `../../docs/BACKEND.md`); these are the exception.

`send-whatsapp`, `lenco-payout` and `lenco-webhook` are still **placeholders**: they accept the
real request shape and respond successfully, but don't call the third-party API yet (no
credentials configured). Each file's top comment says exactly what to fill in when you're ready
to wire it up.

`sync-lenco-banks`, `resolve-bank-account` and `create-payout-recipient` are **real** — they call
Lenco directly and require `LENCO_SECRET_KEY` to be set (see Secrets below); they back the
"Payout Details" section on the Settings page.

| Function | Purpose | Called by |
|---|---|---|
| `send-whatsapp` | Sends an invoice over WhatsApp | `src/landlord/invoiceUtils.ts` (`sendInvoiceViaWhatsApp`) — already wired to invoke this |
| `lenco-payout` | Initiates a bank transfer to the landlord | Nothing yet — no "send payout now" UI exists |
| `lenco-webhook` | Receives payment/payout confirmations *from* Lenco | Lenco's servers, once registered — not the app |
| `sync-lenco-banks` | Refreshes the local `banks` cache from Lenco's bank list | Manually, or on a schedule — see that function's comment |
| `resolve-bank-account` | Resolves an account number + bank code to the account holder's name | `src/lib/payoutApi.ts` (`resolveBankAccount`) — Settings page, on account-number blur |
| `create-payout-recipient` | Registers a Lenco transfer recipient and saves it to `payout_recipients` | `src/lib/payoutApi.ts` (`createPayoutRecipient`) — Settings page, on confirm |

## Deploy

```
npx supabase login
npx supabase functions deploy send-whatsapp --project-ref <your-project-ref>
npx supabase functions deploy lenco-payout --project-ref <your-project-ref>
npx supabase functions deploy lenco-webhook --project-ref <your-project-ref> --no-verify-jwt
npx supabase functions deploy sync-lenco-banks --project-ref <your-project-ref>
npx supabase functions deploy resolve-bank-account --project-ref <your-project-ref>
npx supabase functions deploy create-payout-recipient --project-ref <your-project-ref>
```

`lenco-webhook` needs `--no-verify-jwt` because Lenco calls it directly (no Supabase session) —
see that function's own comment for why it must verify Lenco's own signature instead. The other
five are all invoked by a signed-in landlord's own browser session and keep the default JWT check.

## Secrets (set once real credentials exist)

```
npx supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... --project-ref <your-project-ref>
npx supabase secrets set LENCO_SECRET_KEY=... --project-ref <your-project-ref>
npx supabase secrets set LENCO_WEBHOOK_SECRET=... --project-ref <your-project-ref>
```

`LENCO_SECRET_KEY` is the one Lenco dashboard key that must never reach the frontend — it's read
only inside `sync-lenco-banks`, `resolve-bank-account`, `create-payout-recipient` and (once wired
up) `lenco-payout`, all server-side. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` don't need setting — Supabase injects those into every edge function
automatically.

Until `WHATSAPP_TOKEN`/`LENCO_SECRET_KEY` are set, `send-whatsapp`/`lenco-payout`/`lenco-webhook`
log the request and return a `placeholder: true` response instead of erroring, so the app keeps
working end-to-end with no real delivery. `sync-lenco-banks`, `resolve-bank-account` and
`create-payout-recipient` instead return a real `500` if `LENCO_SECRET_KEY` is missing, since
they have no meaningful placeholder behavior — a bank picker with no banks or an unconfirmable
account number isn't a usable fallback.
