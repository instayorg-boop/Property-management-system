# Backend architecture

The app talks to a single Supabase project (Postgres + Storage + RPC functions).
No custom server exists — the React app calls Supabase directly from the browser
using the anon key. This doc explains how that's wired so you can extend it
without re-deriving the conventions from scratch.

## Local setup

```
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Ask a teammate for the project's URL/anon key (Supabase dashboard → Project
Settings → API) — they're not committed, `.env` is gitignored.

## Where things live

```
src/lib/           Supabase access layer — one file per domain, thin typed
                    wrappers around supabase-js. Nothing here is React.
  supabaseClient.ts   the actual client (createClient<Database>(...))
  database.types.ts   generated types — regenerate after any schema change,
                       don't hand-edit beyond small deltas
  properties.ts, settingsApi.ts, rooms.ts, tenants.ts, invoices.ts,
  expenses.ts, maintenance.ts, staff.ts   CRUD per table/domain
  storage.ts          photo upload (compresses + size-caps before upload)
  payPortal.ts         the public tenant portal's data access (see below —
                       deliberately NOT the same path as the dashboard)

src/landlord/*Context.tsx   React Context providers — the dashboard's state
                    layer. Each one calls the matching src/lib/*.ts module
                    on mount, holds the result in useState, and every
                    mutator (addTenant, logPayment, ...) does an optimistic
                    local update + a background Supabase write. Pages never
                    call src/lib/ directly — only through these contexts.
```

## Data model

One Supabase project, single `properties` row per property (the app is
currently single-workspace/single-landlord — see "Auth" below). Every other
table hangs off `property_id`:

- `settings` — one row per property, all the landlord config (billing
  cycle, penalty rate, payment methods, statutory figures, ...)
- `room_types`, `rooms`, `institutions`
- `tenants`, `ledger_entries` (a tenant's payment history — not embedded on
  the tenant row, so it's queryable directly)
- `invoices`, `invoice_tenants` (join table for institution-grouped invoices)
- `expense_categories`, `expenses`
- `maintenance_reports`
- `employees`, `clock_entries`, `payroll_runs`

Run `npx supabase gen types typescript` (or use the Supabase MCP tool /
dashboard) against the project to see the live schema — `database.types.ts`
is that output, checked in so the app type-checks without a live connection.

## Conventions worth knowing before you extend this

**IDs are generated client-side.** Every `addX`/`insertX` mutator calls
`crypto.randomUUID()` in the Context, updates local state immediately, and
fires the Supabase insert in the background using that same id. This is
why e.g. `addTenant()` can return a real `Tenant` synchronously instead of
a `Promise` — several call sites (`TenantFormDrawer.tsx`) depend on that.
If you add a new mutator, follow the same pattern rather than awaiting the
insert before updating state, or you'll change the calling convention for
every consumer.

**Writes are fire-and-forget with `console.error` on failure**, not
retried or surfaced to the user. There's no toast/error UI in this app yet.
If you're adding something where silent failure is unacceptable (payroll,
money), consider whether that gap needs closing as part of your change.

**Derived fields are stored, not computed.** `tenants.owed_amount`,
`.status`, `.days_overdue`, `.on_time_count` are columns, not views over
`ledger_entries` — this mirrors how the original frontend-only version
modeled a tenant, and `invoiceUtils.ts`'s calculations still run
client-side over these stored fields. It's a known tradeoff (see the memory
note in this repo's git history / the Claude session that built this), not
an oversight — normalizing it into computed values is a real but nontrivial
follow-up if arrears logic ever needs to get more sophisticated.

**Row-Level Security is on but permissive.** Every dashboard table has
`enable row level security` + a policy that's just `using (true)` —
tagged `-- TODO(auth)` in each migration. That's because there's no real
login yet (see below); it is not a mistake, but it also means the anon key
currently has full read/write on every dashboard table. Do not add
anything sensitive to this schema assuming it's protected.

## The public tenant-payment portal is a different security model

`src/pages/pay/*` (routes under `/pay/:propertySlug/...`) is reachable by
anyone with the link, unauthenticated, by design — it's how tenants check
their balance and pay rent. It does **not** use the dashboard's Context
providers or `src/lib/*.ts` — those would leak the entire `tenants` table
(and everything else) to any visitor, since the RLS policy is permissive
for the dashboard's benefit.

Instead it goes exclusively through `src/lib/payPortal.ts`, which calls a
handful of Postgres `SECURITY DEFINER` functions (`pay_portal_get_tenant`,
`pay_portal_search_tenants`, `pay_portal_log_payment`, etc. — see the
migrations named `pay_portal_*` in the project's migration history). Each
function returns only the exact narrow fields that screen needs — never a
raw table row. **If you touch anything under `src/pages/pay/`, keep it on
this pattern.** Reaching for `useTenants()` or `supabase.from("tenants")`
there is the mistake that caused a real data leak once already in this
project (full tenant PII exposed to any portal visitor) before it was
caught and fixed this way.

## How a payment is allocated

Until 18 October 2026 there were four different answers to the question "what
did this payment pay for". The portal's checkout preview worked one out in
TypeScript, `pay-portal-collect-payment` worked one out again when it wrote the
`collections` row, the webhook and the polling fallback each decided again on
settlement, and `pay-portal-reconcile-pending` had quietly drifted onto an
older `ledger_v2`/`post_payment` reconciliation path of its own. They agreed
most of the time, which is worse than disagreeing all of the time: the cases
where they did not agree surfaced only as a tenant balance nobody could
explain. There is now one rule, implemented once, in Postgres.

**`allocate_payment(p_tenant_id uuid, p_amount numeric, p_live_penalty numeric
default 0) returns jsonb`** decides what a payment pays for at the moment the
payment is made, and returns the line items that decision produced. Oldest open
charge first. Nothing downstream re-derives it: the returned line items *are*
the allocation, and every caller persists them rather than recomputing them.

**`tenant_charge_status(p_tenant_id uuid)`** is what `allocate_payment` reads.
It returns every payable charge for a tenant with the amount settled against
it, the amount remaining and a status. Its real job is unification. A rent
charge (`event_type = 'charge'`) and a one-off charge (`event_type` of
`adjustment` or `penalty`, positive amount, no `charge_id`) were previously
counted by different code in different places; they now come back from one
function in one shape. It also applies overflow spillover, so an overpayment
against one charge flows onto the next open charge instead of being left as an
untargeted credit that later absorbs something it should not have.

**`pay_portal_preview_payment(...)`** is the portal's checkout preview. It is
`SECURITY DEFINER` and session-verified like the rest of the `pay_portal_*`
family (see the portal section above), and it exists for one reason: the
preview a tenant sees before paying and the allocation that actually happens
are now produced by the same code, instead of two implementations that had to
be kept in step by hand.

**`pay_portal_get_ledger_v2`** was rewritten to union four sources into the
single list the portal shows: legacy rows, the output of
`tenant_charge_status`, standalone payments, and any remaining adjustments not
already accounted for by a charge.

On the edge-function side, all four payment-settlement paths now share one
module, `supabase/functions/_shared/reconcileCollection.ts`:
`pay-portal-collect-payment`, `lenco-webhook`, `pay-portal-check-collection`
and `pay-portal-reconcile-pending`. The last of those is worth calling out,
because it is the kind of drift that is invisible until it matters: it had been
left behind on an older `ledger_v2`/`post_payment` reconciliation path while
the other three moved on, so a payment rescued by the pending-reconciler could
end up allocated differently from the identical payment settled by the webhook.
It now goes through the same shared module as the rest. If you add a fifth
settlement path, route it through `reconcileCollection.ts` rather than writing
ledger rows directly.

**Payment idempotency keys changed shape.** They were
`lenco_payment:<collection id>`, one ledger row per collection. They are now
`lenco_payment:<collection id>:<line index>`, one row per allocated line item,
which is what makes a single payment legible as the several things it settled.
Anything that looked a payment row up by the old key silently stopped matching
when this changed (see the receipt function below for exactly that bug).

## A new tenant now gets a real rent charge

Ticking "rent collected today" while adding a tenant used to write a payment
with `charge_id = null`. That was not laziness: a brand new tenant genuinely
has no rent charge to point at yet, because the nightly generator creates the
first one later. The consequence was subtle and bad. That untargeted payment
sat in the ledger looking for something to settle, and silently absorbed the
first one-off charge added afterwards, so the tenant's balance read zero while
money was genuinely owed.

`AddTenant.tsx` now creates the move-in rent charge first and then logs the
payment against it. The charge is written with origin `tenant_setup`, a
`billing_period_id`, due and grace dates, and the idempotency key
`rent_charge:<tenant id>:<YYYY-MM>`: deliberately the same shape
`supabase/functions/_shared/generateRentCharge.ts` produces, so the nightly
generator's duplicate guard recognises it and skips the month rather than
charging the tenant twice.

Two supporting changes made that possible. `logPayments` in
`TenantsContext.tsx` now honours an explicitly passed charge id even when the
optimistic local ledger has not refreshed yet, which matters because the charge
and the payment are created in the same breath. And `addLedgerEvent` in
`src/lib/tenants.ts` gained optional `billingPeriodId`, `dueDate` and
`gracePeriodEnd` arguments, so a caller outside the generator can write a
properly shaped charge.

## Service fees are not collected money

A portal payment charges the tenant the rent *plus* a service fee on top.
`collections.amount` is the total debited from the tenant's phone,
`collections.fee_amount` is the fee, and the rent, the only part that is the
landlord's money, is `amount - fee_amount`. Three places were reporting the
gross figure as if the landlord had collected it:

- `fetchPaymentsReceived` in `generate-report`, which backs the "Payments
  received" PDF and CSV, now reports rent only.
- `collected` in `getLencoBalance` (`src/lib/payoutApi.ts`).
- `available_balance` in the Postgres function `assistant_get_payouts_summary`.

Equally important, and the reason this section exists rather than a commit
message: several paths were already correct, and should not be "fixed" again by
the next person who finds this class of bug. The income vs expenses report and
the automatic reports both read rent out of `ledger_entries` and never touch
`collections.amount`. The dashboard collections trend and the report document
go through `report_collected`, which is also ledger based. The Payouts page's
lifetime collected figure and its payments list were already subtracting the
fee. And `sweep-company-revenue` keeps the fee on purpose: that one *is* the
company's revenue, and removing it there would be the actual bug.

## Portal and ledger display

`pay_portal_get_tenant_v2` was dropped and recreated with three additional
returned columns: `due_day`, `last_payment_amount` and `last_payment_at`. Two
display bugs needed them.

First, the due day. The portal was showing the property's due day to every
tenant, so a tenant who bills on their own move-in date was told the wrong
date. It now resolves the tenant's own `due_day` and falls back to the
property's, which is how the landlord dashboard had always resolved it.
`TenantPaymentDrawer.tsx` was brought onto the same rule,
`tenant.dueDay ?? property due day`.

Second, "last payment" on the portal home. It used to pick the newest ledger
row whose status read "paid", which is not the same thing as a payment: a
settled charge also reads as paid, so the figure shown was sometimes a charge.
It now reads the real last payment off the tenant record.

In the landlord ledger (`TenantProfile.tsx`), a one-off charge row now always
reads "Charge" or "Credit" and never relabels itself "Paid" once it has been
settled, the same way a rent charge always reads "Invoice" whatever its state.
Before this, a settled charge and the payment that settled it both read "Paid",
so one payment looked like two.

## The tenant receipt PDF

`pay-portal-generate-receipt` was redesigned. It now works in pixels on A4 at
794x1123 rather than in millimetres, embeds the app's own type pairing, Inter
and Fraunces, with safe fallbacks (it had been using jsPDF's built-in
Helvetica), and draws with the app's own colour tokens from `src/index.css`:
brand navy `#1e3a8a`, brand soft `#e8ecf9`, ink `#212529`, muted `#6c757d` and
line `#dde2ea`. The previous green palette appeared nowhere else in the
product.

The layout, top to bottom: a full-width brand masthead carrying the property,
the receipt number, the amount at 64px and the paid mark; then "Paid by" and
"Paid to"; the itemised table; a totals band that separates the total charged
to the tenant's phone from the rent actually settled and the balance left after
it; the mobile-money method and the Lenco reference; and a centred "Powered by
Instay Manage" lockup at the foot. A part payment gets an amber band directly
under the masthead stating the shortfall, so a tenant cannot mistake a partial
receipt for a cleared month.

One real bug was fixed in the same pass. The function looked its ledger row up
by the old `lenco_payment:<collection id>` key, which stopped matching the
moment keys became per line item, so that lookup had been silently returning
nothing.

## Deployment state as of 18 October 2026

Stated plainly, because the three answers differ:

- **Database migrations: all applied to production.** That includes
  `allocate_payment`, `tenant_charge_status`, `pay_portal_preview_payment`, the
  rewritten `pay_portal_get_ledger_v2`, the dropped and recreated
  `pay_portal_get_tenant_v2`, and the `assistant_get_payouts_summary` fix.
- **Edge functions: `generate-report` and `pay-portal-generate-receipt` are
  edited on disk but not yet deployed.** The shared
  `reconcileCollection.ts` consumers are deployed. Until those two are pushed,
  the "Payments received" report still shows gross collections and receipts
  still render in the old design. See `supabase/functions/README.md` for the
  deploy commands.
- **Frontend: not yet deployed.** The `AddTenant.tsx`, `TenantsContext.tsx`,
  `TenantProfile.tsx`, `TenantPaymentDrawer.tsx`, `payoutApi.ts` and portal
  changes are all on disk only.

## Auth (or: the lack of it)

There is no real login yet — `/sign-in` is a UI stub. This was a deliberate
scope decision to get the data model and CRUD working first. When auth
lands:

1. Wire Supabase Auth (email/password) on `SignIn.tsx` / `GetStarted.tsx`.
2. Add route guarding around `DashboardLayout`.
3. Tighten every `*_allow_all_pre_auth` RLS policy to check
   `properties.owner_id = auth.uid()` (will need an `owner_id` column added
   to `properties` first, plus a `profiles` table linked to `auth.users`).
4. The pay-portal functions don't need to change — they were already built
   assuming no session.

## Not built yet

- Real auth (above).
- Payment processing is a UI stub (`TenantBalance.tsx`'s "Pay" flow fakes a
  2-second delay then calls `logPayment` directly — no actual payment
  gateway integration).
- Invoice numbering (`INV-{year}-{seq}`) is a client-side counter seeded
  from `max(invoice_number)` on load — correct for one active session, not
  atomic across concurrent tabs/devices. Revisit if multi-device editing
  becomes real (a `generate_invoice_number` SQL function was built and then
  deliberately dropped because it can't be called from the current
  synchronous call sites without a wider refactor of
  `GenerateInvoicesOverlay.tsx` — worth resurrecting if you do that refactor).
