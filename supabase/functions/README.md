# Edge functions

These exist for operations that must never run with a secret key in the browser — money
transfers and third-party API calls. Everything else in this app talks to Supabase directly
from the client with the anon key (see `../../docs/BACKEND.md`); these three are the exception.

All three are currently **placeholders**: they accept the real request shape and respond
successfully, but don't call the third-party API yet (no credentials configured). Each file's
top comment says exactly what to fill in when you're ready to wire it up.

| Function | Purpose | Called by |
|---|---|---|
| `send-whatsapp` | Sends an invoice over WhatsApp | `src/landlord/invoiceUtils.ts` (`sendInvoiceViaWhatsApp`) — already wired to invoke this |
| `lenco-payout` | Initiates a bank transfer to the landlord | Nothing yet — no "send payout now" UI exists |
| `lenco-webhook` | Receives payment/payout confirmations *from* Lenco | Lenco's servers, once registered — not the app |

## Deploy

```
npx supabase login
npx supabase functions deploy send-whatsapp --project-ref <your-project-ref>
npx supabase functions deploy lenco-payout --project-ref <your-project-ref>
npx supabase functions deploy lenco-webhook --project-ref <your-project-ref> --no-verify-jwt
```

`lenco-webhook` needs `--no-verify-jwt` because Lenco calls it directly (no Supabase session) —
see that function's own comment for why it must verify Lenco's own signature instead.

## Secrets (set once real credentials exist)

```
npx supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... --project-ref <your-project-ref>
npx supabase secrets set LENCO_SECRET_KEY=... --project-ref <your-project-ref>
npx supabase secrets set LENCO_WEBHOOK_SECRET=... --project-ref <your-project-ref>
```

Until these are set, all three functions log the request and return a `placeholder: true`
response instead of erroring — so the app keeps working end-to-end with no real delivery.
