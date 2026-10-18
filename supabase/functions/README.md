# Edge functions

These exist for operations that must never run with a secret key in the browser — money
transfers and third-party API calls. Everything else in this app talks to Supabase directly
from the client with the anon key (see `../../docs/BACKEND.md`); these are the exception.

`sync-lenco-banks`, `resolve-bank-account`, `create-payout-recipient` and `lenco-webhook` are
**real** and confirmed against this account's live Lenco API reference. `lenco-payout` is real
plumbing (looks up the recipient, writes a `payouts` row) but its actual transfer-call endpoint
is still an unconfirmed guess — see that file's top comment before relying on it.

| Function | Purpose | Called by |
|---|---|---|
| `lenco-payout` | Initiates a bank transfer to the landlord | `src/lib/payoutApi.ts` (`sendPayout`) — Dashboard's payout drawer, "Send payout now" |
| `lenco-webhook` | Receives transfer/collection confirmations *from* Lenco, verifies `X-Lenco-Signature`, updates `payouts` | Lenco's servers, once registered (email support@lenco.co with this function's URL — no self-serve webhook URL setting) |
| `sync-lenco-banks` | Refreshes the local `banks` cache from Lenco's bank list | Manually, or on a schedule — see that function's comment |
| `resolve-bank-account` | Resolves an account number + bank code to the account holder's name | `src/lib/payoutApi.ts` (`resolveBankAccount`) — Settings page, on "Check account" |
| `create-payout-recipient` | Registers a Lenco transfer recipient and saves it to `payout_recipients` | `src/lib/payoutApi.ts` (`createPayoutRecipient`) — Settings page, on confirm |
| `pay-portal-request-otp` | Sends a 6-digit OTP (via Africa's Talking SMS) to the tenant's phone on file | `src/lib/payPortal.ts` (`requestPortalOtp`) — public payment portal, on landing on a claimed tenant |
| `pay-portal-verify-otp` | Verifies the OTP and issues a `portal_sessions` token | `src/lib/payPortal.ts` (`verifyPortalOtp`) — public payment portal, OTP entry |
| `pay-portal-collect-payment` | Calls Lenco to debit the tenant, writes the `collections` row with its allocated `line_items` | `src/lib/payPortal.ts` , public payment portal, on confirming a payment |
| `pay-portal-check-collection` | Polling fallback that settles a collection when the webhook has not arrived | `src/lib/payPortal.ts` , portal, while a payment is in flight |
| `pay-portal-reconcile-pending` | Sweeps collections left pending by a dropped webhook and settles them | Scheduled |
| `pay-portal-generate-receipt` | Renders the tenant's receipt PDF for a settled collection | `src/lib/payPortal.ts` , portal, on "Download receipt" |
| `generate-report` | Builds the landlord's report PDFs and CSVs, including "Payments received" | `src/lib/reportApi.ts` , Reports page |

`pay-portal-request-otp`/`pay-portal-verify-otp` are real and deployed. Without `AT_API_KEY` set,
`pay-portal-request-otp` doesn't send an SMS but still works end-to-end for testing — it returns
the code directly in the response as `devCode` (logged server-side too) instead of texting it,
same "keep working with no real delivery" convention as the other placeholder functions.

## One settlement path (18 October 2026)

Four functions can settle a tenant payment, and they used to decide
independently what that payment paid for: `pay-portal-collect-payment`,
`lenco-webhook`, `pay-portal-check-collection` and
`pay-portal-reconcile-pending`. They now all go through one shared module,
`_shared/reconcileCollection.ts`, which calls the Postgres function
`allocate_payment` and persists the line items it returns. The allocation
decision lives in the database, once, and these functions only record it; see
`../../docs/BACKEND.md` for the rule itself.

`pay-portal-reconcile-pending` is worth a sentence of its own. It had silently
drifted onto an older `ledger_v2`/`post_payment` reconciliation path while the
other three moved forward, so a payment rescued by the pending sweeper could be
allocated differently from the identical payment settled by the webhook. It now
matches the others. If you add a fifth way for a payment to settle, route it
through `_shared/reconcileCollection.ts` instead of writing `ledger_entries`
rows yourself.

One consequence to be aware of when reading ledger rows from a function:
payment idempotency keys are now `lenco_payment:<collection id>:<line index>`,
one row per allocated line item, not `lenco_payment:<collection id>`. Any
lookup still using the old single-row key matches nothing.
`pay-portal-generate-receipt` was doing exactly that and has been fixed.

## Not yet deployed

`generate-report` and `pay-portal-generate-receipt` are edited on disk and
**not yet deployed** as of 18 October 2026. `generate-report` stops counting
the tenant-side service fee as collected money in the "Payments received"
report, and `pay-portal-generate-receipt` carries the redesigned receipt plus
the per-line-item idempotency-key fix above. Until both are pushed, production
still serves the old behaviour.

## Deploy

```
npx supabase login
npx supabase functions deploy lenco-payout --project-ref <your-project-ref>
npx supabase functions deploy lenco-webhook --project-ref <your-project-ref> --no-verify-jwt
npx supabase functions deploy sync-lenco-banks --project-ref <your-project-ref>
npx supabase functions deploy resolve-bank-account --project-ref <your-project-ref>
npx supabase functions deploy create-payout-recipient --project-ref <your-project-ref>
npx supabase functions deploy pay-portal-request-otp --project-ref <your-project-ref>
npx supabase functions deploy pay-portal-verify-otp --project-ref <your-project-ref>
npx supabase functions deploy generate-report --project-ref <your-project-ref>
npx supabase functions deploy pay-portal-generate-receipt --project-ref <your-project-ref>
```

`lenco-webhook` needs `--no-verify-jwt` because Lenco calls it directly (no Supabase session) —
see that function's own comment for why it must verify Lenco's own signature instead. The other
functions listed above are all invoked by a signed-in landlord's own browser session and keep the default JWT check.

## Secrets (set once real credentials exist)

```
npx supabase secrets set LENCO_SECRET_KEY=... --project-ref <your-project-ref>
npx supabase secrets set AT_API_KEY=... --project-ref <your-project-ref>
npx supabase secrets set AT_USERNAME=sandbox --project-ref <your-project-ref>
```

`AT_USERNAME` defaults to `"sandbox"` if unset (Africa's Talking's sandbox environment) —
`pay-portal-request-otp` sends to `api.sandbox.africastalking.com` only when the username is
literally `"sandbox"`, and to the real `api.africastalking.com` for any other username. Set
`AT_USERNAME` to your live app username once you move off the sandbox.

`LENCO_SECRET_KEY` is the one Lenco dashboard key that must never reach the frontend — it's read
inside every `lenco-*`/`sync-lenco-banks`/`resolve-bank-account`/`create-payout-recipient`
function, server-side only. There's no separate `LENCO_WEBHOOK_SECRET` — per Lenco's own webhook
docs, the signing key is derived as `sha256(LENCO_SECRET_KEY)`, so `lenco-webhook` computes it
from the same secret rather than needing a second one set. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` don't need setting — Supabase injects those into every edge function
automatically.

Every other Lenco-calling function returns a real `500` if
`LENCO_SECRET_KEY` is missing — a bank picker with no banks, or an unconfirmable account number,
isn't a usable fallback. `lenco-webhook` is the one exception: it still replies `200` even without
the secret (just ignoring the payload, logged) rather than `500`, because a non-2xx response makes
Lenco retry the same event every 30 minutes for 24h — better to silently drop it than get stuck in
a retry loop over a config gap.
