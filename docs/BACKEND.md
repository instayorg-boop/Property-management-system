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
