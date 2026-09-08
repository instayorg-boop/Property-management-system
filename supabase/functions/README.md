# Edge functions

These exist for operations that must never run with a secret key in the browser — money
transfers and third-party API calls. Everything else in this app talks to Supabase directly
from the client with the anon key (see `../../docs/BACKEND.md`); these are the exception.

`send-whatsapp` is still a **placeholder**: it accepts the real request shape and responds
successfully, but doesn't call the WhatsApp API yet (no credentials configured). Its top comment
says exactly what to fill in when you're ready to wire it up.

`sync-lenco-banks`, `resolve-bank-account`, `create-payout-recipient` and `lenco-webhook` are
**real** and confirmed against this account's live Lenco API reference. `lenco-payout` is real
plumbing (looks up the recipient, writes a `payouts` row) but its actual transfer-call endpoint
is still an unconfirmed guess — see that file's top comment before relying on it.

| Function | Purpose | Called by |
|---|---|---|
| `send-whatsapp` | Sends an invoice over WhatsApp | `src/landlord/invoiceUtils.ts` (`sendInvoiceViaWhatsApp`) — already wired to invoke this |
| `lenco-payout` | Initiates a bank transfer to the landlord | `src/lib/payoutApi.ts` (`sendPayout`) — Dashboard's payout drawer, "Send payout now" |
| `lenco-webhook` | Receives transfer/collection confirmations *from* Lenco, verifies `X-Lenco-Signature`, updates `payouts` | Lenco's servers, once registered (email support@lenco.co with this function's URL — no self-serve webhook URL setting) |
| `sync-lenco-banks` | Refreshes the local `banks` cache from Lenco's bank list | Manually, or on a schedule — see that function's comment |
| `resolve-bank-account` | Resolves an account number + bank code to the account holder's name | `src/lib/payoutApi.ts` (`resolveBankAccount`) — Settings page, on "Check account" |
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
```

`LENCO_SECRET_KEY` is the one Lenco dashboard key that must never reach the frontend — it's read
inside every `lenco-*`/`sync-lenco-banks`/`resolve-bank-account`/`create-payout-recipient`
function, server-side only. There's no separate `LENCO_WEBHOOK_SECRET` — per Lenco's own webhook
docs, the signing key is derived as `sha256(LENCO_SECRET_KEY)`, so `lenco-webhook` computes it
from the same secret rather than needing a second one set. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` don't need setting — Supabase injects those into every edge function
automatically.

Until `WHATSAPP_TOKEN` is set, `send-whatsapp` logs the request and returns a `placeholder: true`
response instead of erroring. Every other Lenco-calling function returns a real `500` if
`LENCO_SECRET_KEY` is missing — a bank picker with no banks, or an unconfirmable account number,
isn't a usable fallback. `lenco-webhook` is the one exception: it still replies `200` even without
the secret (just ignoring the payload, logged) rather than `500`, because a non-2xx response makes
Lenco retry the same event every 30 minutes for 24h — better to silently drop it than get stuck in
a retry loop over a config gap.
