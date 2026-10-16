# 03 — Launch risk review

Ordered by "would this lose someone's money or embarrass you on day one". All findings are from code. Items marked † should be confirmed against the live DB with [06-live-db-checks.md](06-live-db-checks.md).

---

## A. Security and data isolation

### S1. Anyone with a tenant's SMS link can mark that tenant as paid — CRITICAL (High)
1. The portal's "session token" was changed to be the tenant's **permanent 6-character `portal_token`** (`20260914010000_pay_portal_durable_token_session.sql:15-26`). That token is in every reminder SMS (`send-rent-reminders/index.ts`, `portalLink()`).
2. `pay_portal_log_payment_v2` is still `grant execute … to anon, authenticated` (`20260916000000_phase1_portal_payment_safety.sql:76`). It deducts any `p_amount` from `owed_amount` and writes a `paid` ledger row (`:22-73`). No money moves.
3. `tenantId` comes back from `pay-portal-resolve-token` (`index.ts:73-80`).

So a tenant, or anyone they forward the link to, can clear their arrears from browser devtools in two calls. The function's only client wrapper is dead code (`20260916000000:9-11`).

**Fix:** `drop function pay_portal_log_payment_v2` (0.5 day, including a retest of every portal RPC).

### S2. Landlord can release a paid-out payout and withdraw it again from the pooled wallet — CRITICAL (High†)
`pay_portal_release_payout_collections` checks ownership only, not `status` (`20261003030000_document_pay_portal_payout_rpcs.sql:113-145`). No `REVOKE` is issued, so authenticated users keep the default EXECUTE. Lenco transfers come from one IPM wallet (`lenco-payout/index.ts:257-261`), so the second withdrawal is funded by other landlords' rent. Landlords also have raw `UPDATE`/`DELETE` on `payouts` (`20260908020000_payouts.sql:34-37`).

**Fix:**
- Revoke both claim and release RPCs from `authenticated`; only service-role edge functions call them.
- Release only `pending`/`failed` payouts.
- Drop landlord write policies on `payouts`.

### S3. Portal tokens are guessable and unthrottled — HIGH (High)
- 6 characters from 31 symbols is about 887M values.
- Tokens are generated with `Math.random()` (`src/lib/tenants.ts:123-129`) and Postgres `random()` (`20260912020000:16-35`), neither of which is a CSPRNG.
- Tokens never expire or rotate.
- `pay-portal-resolve-token` has **no rate limiting** and returns tenant name + room (`index.ts:52-80`).

Every guess hit exposes the balance, ledger, documents and payment page, and (with S1) a free "paid". The `/tenants/:code` landlord URL reuses the same token, so it ends up in screenshots and browser history.

**Fix:** rate-limit by IP, lengthen to ≥10 characters from a CSPRNG for new tokens, and add a "regenerate link" action.

### S4. Dev fallbacks fail open if a secret is missing — HIGH (High)
| If unset | What happens | Evidence |
|---|---|---|
| `AT_API_KEY` | Every SMS logged as **sent**, nothing delivered | `_shared/sms.ts:35-38` |
| `RESEND_API_KEY` | Withdrawal/add-recipient OTP **returned to the browser** | `request-withdrawal-otp/index.ts:123-126`; `_shared/email.ts:1-6` says no key is configured |
| `AT_API_KEY` (legacy OTP) | OTP returned to the browser | `pay-portal-request-otp/index.ts:118-124` |
| `DEV_MODE_PAYMENTS=true` | Client can request `devSimulate:"success"`, which **credits the tenant with no money** | `pay-portal-collect-payment/index.ts:251-263` |
| `AT_USERNAME` | Defaults to `sandbox`; real numbers never receive SMS | `_shared/sms.ts:21` |

Nothing in the repo tells you which of these are set in production.

**Fix:** fail closed in production (refuse to start), and add a `/health` check that reports config.

> **Live update (07):** S1 and S2 are confirmed by the live ACLs. Worse than S6 predicted, the ungated v1 functions `pay_portal_search_tenants`, `pay_portal_get_tenant` and `pay_portal_get_ledger` **are live and anon-executable**. Anyone can list every tenant's name, room and balance from a property slug (07 L1). `assistant_query` turned out to be safe, which downgrades S5 to MEDIUM. `pay_portal_increment_property_balance` **is** revoked, so ignore that bullet in S6.

### S5. Unknown surface: 19 assistant RPCs and the dashboard-created base schema — MEDIUM after live check
`assistant_query(p_view, p_filters, p_limit)` takes model-generated input (`assistant-chat/index.ts:362-367`) and its body is not in the repo. If it builds SQL from `p_view`/`p_filters` with `format()`/`EXECUTE` and is granted to `authenticated` (Postgres default), it could be an injection or cross-landlord read path. Separately, `assistant-chat` never checks that `conversationId` belongs to the caller (`:379-385`), so another landlord's chat history can be replayed into the model if its UUID is known.

**Fix for v1:** turn the assistant off. Audit the RPCs before turning it back on.

### S6. Smaller gaps — MEDIUM/LOW
- `pay_portal_increment_property_balance`: `SECURITY DEFINER`, no caller check, executable by `anon` (`20261003030000:31-43`). Revoke it.
- `send-whatsapp` has no auth check of its own. `resolve-bank-account`, `resolve-mobile-money` and `sync-lenco-banks` rely on platform `verify_jwt`, which the public anon key passes. Anyone can use your Lenco key for account-name lookups.
- Webhook signature compared with `!==`, not constant-time (`lenco-webhook/index.ts:91`).
- Old ungated `pay_portal_get_tenant` / `pay_portal_get_ledger` (v1) were never dropped in a migration.† If they still exist live, any tenant UUID reveals balance and ledger.
- `settings.account_email` is set by the landlord, is the only OTP factor for withdrawals, and is never verified against the auth email (`20261001000000_locked_settings_fields.sql:30-45` only blocks *changes*).

**Isolation verdict:** for the tables defined in migrations, landlord-to-landlord RLS is consistent and correct (High). The real exposure is RPCs and edge functions that use `SECURITY DEFINER` or the service role (S1, S2, S5), plus the schema you can't see.

## B. Money handling and audit trail

1. **Two ledger models and the wrong one is live for most tenants.** See 02 M1/M8. Nothing reconciles `tenants.owed_amount` against `calculate_tenant_balance()`.
2. **No immutable audit trail.**
   - Landlords can `UPDATE`/`DELETE` any `ledger_entries` row through RLS (`20260907020000:96-104`). Voids exist (`void_ledger_entry`), but deletes aren't blocked.
   - There is no `created_by` on ledger rows.
   - Adjustment reasons are free text inside `label`.
   - Deleting a tenant destroys `collections` (02 M10).
3. **Pooled wallet with no reconciliation.** One Lenco wallet holds every landlord's unclaimed rent. Nothing checks wallet balance against `sum(unclaimed successful collections)` daily. A single double-payout (M3/M4) silently borrows from someone else.
4. **Crash windows** in collect, reconcile and payout leave money states that nothing sweeps (02 W4, W5, W8). Each needs a cron sweep that asks Lenco for the truth.
5. **Rounding:** penalties are rounded to whole kwacha, payments keep ngwee, and JS `number` is used everywhere (02 M14). This is low risk next to the above.

## C. Error handling — what the user sees

- **Landlord:** almost every write is optimistic and fire-and-forget (`void (async () => …)()`), and failures show a toast. The optimistic state is **not rolled back** (e.g. `TenantsContext.tsx:545-548`). A landlord who misses the toast sees a payment that doesn't exist until the next refetch.
- **No React error boundary** anywhere in `src/`, so a render error blanks the whole dashboard.
- **No error monitoring** (no Sentry or equivalent in `package.json`). Every server-side money failure is a `console.error` in Supabase function logs that nobody watches (`reconcileCollection.ts`, both payout functions, both crons).
- **Tenant portal:** errors are mapped to friendly messages (e.g. "There's nothing due to pay right now"). The worst case is M5: the tenant approves on their phone, sees *Failed*, and has actually paid. They'll pay again or call the landlord.
- **Crons:** `invoke_cron_function` only `raise warning`s if vault secrets are missing (`20260928010000:36-39`). There's no alert when a night's run fails.

## D. Day-one embarrassments

1. Sign-up page is a blank screen (`/get-started` not routed).
2. `npm run build` fails (8 TS errors; `ReportGenerate.tsx:163`), so you can't deploy this branch.
3. New accounts show a fake MTN number `0977 000 111` as a payment method, due day 30, plan "Pro" (`settingsApi.ts:26-54`).
4. Month 2: tenants who paid month 1 show **Paid** and get no reminder (M1).
5. Tenant pays, portal says *Failed* (M5).
6. Landlord's "Collected" dashboard number disagrees with their PDF report and their MoMo statement (M11).
7. Reminder SMS quotes this month's rent, not the arrears balance.
8. `Privacy`/`Terms` are 35-line stubs, and you'll be handling money and tenant personal data.
9. SMS sent from AT sandbox by default if `AT_USERNAME` isn't set.
