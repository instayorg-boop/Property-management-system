# IPM audit: summary

*2026-10-14 · branch `shadcn-ui-migration-wip` @ `704f2d4` · code audit plus read-only live DB checks (project `rlmcuhejgfftcdshbrbe`, see [07](07-live-db-findings.md)) · no code or data was changed*

## 1. Overall completion: about 50% of a launchable v1

- **Screens and features:** about 85% built. You've built roughly twice the surface a v1 needs.
- **The money core:** about 35% trustworthy.
  - The live DB runs **three ledger models at once** (legacy, event-model, and a `ledger_v2` that exists only in the database).
  - The live balance function **re-bills rent tenants already paid**.
  - Payouts and collections have timeout bugs that lose or double money.
- **Build:** `npm run build` fails (8 TypeScript errors).
- **Schema drift:** repo and DB have drifted both ways. Nine live migrations aren't in git, and one repo migration (`late_fee_config`) was never applied, which **breaks first login for every new landlord**.

**Good news:** there are no paying customers and no real money in the system yet. 6 test landlords, 20 tenants, and every successful collection is simulated. You can reset data instead of migrating it.

The gap is about 20 focused dev-days, roughly 4–5 weeks solo. Almost none of it is UI.

## 2. Top 5 blockers

| # | Blocker | Evidence |
|---|---|---|
| 1 | **Tenant data and balances are publicly readable, and balances are publicly writable.** Old v1 portal functions are still live and callable with the public anon key. `pay_portal_search_tenants(slug)` returns every tenant's name, room and balance for any property, and slugs are just the property name. `pay_portal_log_payment_v2` lets anyone with a tenant's 6-character SMS link mark them paid with no money. | Live ACLs ([07](07-live-db-findings.md) L1, L2); `20260914010000:15-26` |
| 2 | **Balances are wrong.** The live balance function counts reclassified, already-paid rent rows as owed. About 10 of 20 tenants show K6,000–7,500 instead of one month's rent, and the portal would ask them to pay it. Separately, recording a deposit still pushes new tenants onto the legacy model, and nothing advances `days_overdue` (all 20 tenants are 0). So penalties, escalations and overdue status never fire. | 07 L4, L9; `calculate_tenant_balance` (live); `AddTenant.tsx:1142-1156` |
| 3 | **Payouts can pay the same rent twice, or pay out money that never arrived.** A timeout after Lenco accepts marks the payout failed and frees the money again. Landlords can call `release` on a successful payout. The v2 reclaim cron reverses payouts after 15 minutes without asking Lenco. The scheduled job already tried to send K21,140 of **simulated** collections from the real pooled wallet. Two payouts have been stuck in `processing` since 2 Oct. | `lenco-payout/index.ts:320-322`; 07 L3, L6, L7 |
| 4 | **A tenant's successful payment can be recorded as failed and never credited.** A timeout marks the collection failed, and the later Lenco "success" webhook is ignored. Reconciliation isn't atomic and only logs its failures. Two real collections have been stuck since 7 Oct. | `pay-portal-collect-payment/index.ts:328-329`; `lenco-webhook/index.ts:155`; 07 L7 |
| 5 | **You can't trust what's deployed.** <ul><li>Schema drift both ways; three ledgers.</li><li>New-landlord onboarding is broken: the repo route is missing and live `settings` lacks `late_fee_*` columns.</li><li>`npm run build` fails.</li><li>`CRON_SECRET` sits in plain text in a cron job.</li><li>Payouts are scheduled twice daily.</li><li>Missing secrets fail *open*: SMS logged as sent, OTP returned to the browser.</li><li>Three different "collected" numbers on screen.</li></ul> | 07 L5, L6, L8; 01 §1, §4; 02 W9 |

## 3. v1 scope (MUST SHIP only)

A landlord can:
1. sign up and set up **one property with its rooms**;
2. **add tenants**, with the deposit kept separately from rent;
3. have **rent charged automatically each month** on **one ledger, one balance function, owned by the server**;
4. have tenants get **SMS reminders with their real balance**;
5. have tenants **pay by MoMo through their link**, and log **cash payments** themselves;
6. see **one monthly statement** that the dashboard and PDF both use;
7. receive **payouts that can't double-pay or pay out money that never arrived**.

Also in scope:
- **For you:** wallet reconciliation alerts, error monitoring, fail-closed config, a committed schema baseline, and real Privacy/Terms.
- **Late fees are manual**, and **subscription billing is manual**.
- **Hidden:** AI assistant, AI maintenance priority, tasks/briefings, offline writes, staff/payroll, WhatsApp, and invoices.

**Decision you need to make first:** pick **one** ledger. You have event-model `ledger_entries`, which the app uses, and `ledger_entries_v2`, which only exists in the DB and is flagged on for a test landlord. Since there are no real customers, the cheapest path is to pick one, delete the other, and reset test data. Item 7 in [05-v1-plan.md](05-v1-plan.md) assumes event-model `ledger_entries` because the app already uses it. If you prefer v2, the plan's sizes still roughly hold, but the frontend has to be re-pointed.

## 4. First 3 things to do tomorrow

1. **About 1 hour: close the public holes in one migration.**
   - Drop `pay_portal_search_tenants`, `pay_portal_get_tenant`, `pay_portal_get_ledger`, `pay_portal_submit_maintenance_report` (all v1) and `pay_portal_log_payment_v2`.
   - Revoke `pay_portal_claim_payout_collections` and `pay_portal_release_payout_collections` from `authenticated`.
   - Rotate `CRON_SECRET`, delete duplicate cron job `daily-payout-check`, and unschedule `ledger_v2_reclaim_stuck_payouts`.
   - Then check the Lenco dashboard for the 2 stuck payouts and 2 stuck collections ([07](07-live-db-findings.md) L7) and mark them correctly by hand.
2. **About half a day: stop drift.** `supabase db pull` the live schema into the repo (this captures the 9 `ledger_v2_*` migrations). Decide whether `late_fee_config` should be applied or removed from the code, and do it. Commit, and make `npm run build` pass.
3. **About half a day: make the ledger decision and reset test data.** Choose one ledger, delete the reclassified legacy rows (or reset the 20 test tenants entirely), and verify every tenant's balance equals unpaid charges. Then patch the three Lenco timeout paths so a network error leaves the row pending instead of failing or releasing it.

After that, follow [05-v1-plan.md](05-v1-plan.md) from week 2.

---

### Files in this audit
- [01-inventory.md](01-inventory.md): routes, pages, edge functions, tables, RLS rules, cron jobs and integrations, with status.
- [02-workflows.md](02-workflows.md): 10 workflows traced end to end, plus the money-correctness register (M1–M14).
- [03-launch-risks.md](03-launch-risks.md): security, money/audit trail, error handling, day-one embarrassments.
- [04-scoring.md](04-scoring.md): 49 features scored and bucketed MUST / SHOULD / LATER / CUT.
- [05-v1-plan.md](05-v1-plan.md): ordered build list with days and done-definitions, plus the parking lot.
- [06-live-db-checks.md](06-live-db-checks.md): the read-only SQL used.
- [07-live-db-findings.md](07-live-db-findings.md): **live results, which override 01–05 where they disagree.**
