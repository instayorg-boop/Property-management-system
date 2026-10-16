# 04 — Feature scoring

**Axis A — needed to collect rent and trust the numbers?**
- **Core:** without it a landlord can't collect, or can't trust the numbers.
- **Helps:** improves the product but isn't needed for that.
- **No:** not related to collecting rent.

**Axis B — effort left** in focused dev-days, including testing.

**Bucket:**
- **MUST SHIP:** v1 can't launch without it.
- **SHOULD SHIP:** already works; ship as-is and do no new work.
- **LATER:** hide it in v1 and come back after paying customers.
- **CUT:** remove or keep disabled; not worth carrying.

| # | Feature | A | B (days) | Current status | Bucket |
|---|---|---|---|---|---|
| 1 | Schema baseline committed (dump live DB into a migration) | Core | 0.5 | NOT STARTED | **MUST** |
| 2 | Production config fails closed + health check (Lenco, AT, Resend, CRON, vault) | Core | 0.5 | BROKEN (fails open) | **MUST** |
| 3 | Build passes (`tsc -b`) | Core | 0.25 | BROKEN | **MUST** |
| 4 | Landlord sign-up route + sane default settings | Core | 0.5 | BROKEN | **MUST** |
| 5 | Property + rooms/units setup | Core | 0.25 (verify) | DONE (Low conf.) | **MUST** |
| 6 | Tenants add/edit/move-out; **soft delete only** | Core | 0.5 | PARTIAL | **MUST** |
| 7 | **One ledger model; balance only written server-side** | Core | 3.5 | BROKEN (dual model) | **MUST** |
| 8 | Monthly rent-charge generation | Core | 0 after #7 | PARTIAL | **MUST** |
| 9 | Nightly balance + days-overdue sync (cron) | Core | 0.5 | NOT STARTED | **MUST** |
| 10 | Manual / cash payment logging | Core | 0.5 after #7 | PARTIAL | **MUST** |
| 11 | Ledger corrections: void, manual charge/credit | Core | 0 | DONE | **MUST** (exists) |
| 12 | Tenant pay link: resolve token → Lenco MoMo collect | Core | 1 | PARTIAL / M5 | **MUST** |
| 13 | Close portal holes (drop `log_payment_v2`, rate-limit token, CSPRNG tokens) | Core | 1 | BROKEN | **MUST** |
| 14 | Reconciliation: atomic SQL function + stuck-collection sweep | Core | 1.5 | PARTIAL | **MUST** |
| 15 | Payouts: lock RPCs/policies, no release-on-timeout, stuck-payout sweep | Core | 1.5 | BROKEN | **MUST** |
| 16 | Payout recipient setup with email OTP (needs Resend live) | Core | 0.25 | PARTIAL | **MUST** |
| 17 | Pre-due + overdue reminder SMS (quote real balance) | Core | 0.5 after #9 | BROKEN | **MUST** |
| 18 | Deposit moved out of rent ledger (minimal held/refunded/forfeited table) | Core | 1 | BROKEN | **MUST** |
| 19 | One monthly statement + dashboard numbers from the ledger | Core | 2 | BROKEN | **MUST** |
| 20 | Daily wallet reconciliation check (Lenco balance vs unclaimed) + alerts | Core | 1 | NOT STARTED | **MUST** |
| 21 | Error monitoring + React error boundary + roll back failed optimistic writes | Core | 1 | NOT STARTED | **MUST** |
| 22 | Real Privacy Policy / Terms | Core | 0.5 (content) | Stub | **MUST** |
| 23 | End-to-end money test with real small amounts | Core | 1 | NOT STARTED | **MUST** |
| 24 | Payment receipt SMS | Helps | 0 | DONE | SHOULD |
| 25 | Tenant onboarding SMS | Helps | 0 | DONE | SHOULD |
| 26 | Tenant portal: history, receipt PDF, documents | Helps | 0 | DONE | SHOULD |
| 27 | Maintenance requests (landlord + portal) | Helps | 0 | DONE (Low conf.) | SHOULD |
| 28 | Expense tracker | Helps | 0 | DONE (Low conf.) | SHOULD |
| 29 | Occupancy + arrears reports (in-app) | Helps | 0.25 (point at fixed balance) | PARTIAL | SHOULD |
| 30 | In-app notifications panel | Helps | 0 | DONE | SHOULD |
| 31 | PWA install + offline **read** cache | Helps | 0 | DONE | SHOULD |
| 32 | Global search, setup checklist | Helps | 0 | DONE | SHOULD |
| 33 | Automatic daily late-penalty accrual + waivers | Helps | 2.5 | BROKEN | LATER (v1: off by default; landlord adds a manual late-fee charge) |
| 34 | Full deposit ledger with refund payouts | Helps | 2 | NOT STARTED | LATER |
| 35 | Invoice PDF generation | Helps | 1 (re-point at ledger) | PARTIAL | LATER |
| 36 | Today's tasks / AI briefings | Helps | 1 | PARTIAL | LATER |
| 37 | Landlord SMS digests / instant alerts | Helps | 0.5 | DONE (Low conf.) | LATER |
| 38 | In-app subscription billing (IPM → landlord) | No (bill manually) | 4+ | NOT STARTED | LATER |
| 39 | Multi-property per account | Helps | 3+ | NOT STARTED | LATER |
| 40 | Room reservations | Helps | 0 | DONE? (Low) | LATER |
| 41 | Product tour | Helps | 0 | DONE | LATER |
| 42 | Disabled reports: rent roll, owner payout statement | Helps | 1 each | Disabled | LATER |
| 43 | AI assistant (Gemini + 19 unaudited RPCs) | No | 2 (audit) | PARTIAL / unsafe | **CUT for v1** (hide) |
| 44 | AI maintenance priority classification | No | 0 | DONE | CUT for v1 (turn off trigger) |
| 45 | Offline **write** queue (payments/edits while offline) | No | — | PARTIAL / unsafe (M8) | **CUT** (read-only offline) |
| 46 | Staff / payroll / clock-in kiosk | No | 5+ | Disabled | **CUT** (already hidden; leave it) |
| 47 | WhatsApp invoice sending | No | 2 | Placeholder | **CUT** |
| 48 | Tenant OTP functions (`pay-portal-request/verify-otp`) | No | 0 | Superseded | **CUT** (delete) |
| 49 | Marketing stubs: Careers, Status, Docs, Help | No | 0 | Stub | **CUT** (remove from nav) |

**MUST total: about 19 dev-days** (items 1–23). That is roughly 4–5 calendar weeks solo with buffer.
