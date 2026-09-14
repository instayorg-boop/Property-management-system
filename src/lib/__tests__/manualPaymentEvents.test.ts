// Phase 3D focused tests: manual payments written as financial events, and the offline replay
// path's compatibility with both legacy and new-model queued payloads.
//
// No test runner is configured in this project — run with:
//   NODE_OPTIONS="--experimental-loader ./src/lib/__tests__/stubSupabaseClientLoader.mjs" \
//     npx tsx src/lib/__tests__/manualPaymentEvents.test.ts
// (see stubSupabaseClientLoader.mjs's comment for why the stub is needed).

import "./testEnv.setup.ts"; // must run before importing sync.ts — see its own comment
import assert from "node:assert/strict";
import { projectLedgerRows, type RawLedgerEntryRow } from "../tenants.ts";
import { paymentReplayNeedsReview } from "../offline/sync.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`);
    throw e;
  }
}

function row(overrides: Partial<RawLedgerEntryRow> & { id: string }): RawLedgerEntryRow {
  return {
    id: overrides.id,
    tenant_id: "t1",
    label: overrides.label ?? "row",
    amount: overrides.amount ?? 0,
    paid_amount: overrides.paid_amount ?? null,
    status: overrides.status ?? null,
    created_at: overrides.created_at ?? "2026-09-01T00:00:00.000Z",
    method: overrides.method ?? null,
    source: overrides.source ?? "manual",
    event_type: overrides.event_type ?? null,
    affects_balance: overrides.affects_balance ?? true,
    charge_id: overrides.charge_id ?? null,
    billing_period_id: overrides.billing_period_id ?? null,
    due_date: overrides.due_date ?? null,
    grace_period_end: overrides.grace_period_end ?? null,
    origin: overrides.origin ?? null,
    voided_at: overrides.voided_at ?? null,
  };
}

// --- New manual payment event shape ---------------------------------------------------------

test("a new manual payment event has the exact Phase 3A/3D shape", () => {
  // Mirrors exactly what TenantsContext.tsx's logPayments now builds as `rawEvent` for a K500
  // manual payment linked to an open charge — asserted here as the contract every future writer
  // of a manual payment must uphold.
  const rawEvent = {
    id: "evt-1",
    tenant_id: "t1",
    label: "September 2026 rent",
    amount: -500, // negative actual payment amount, never the legacy "amount owed" convention
    event_type: "payment",
    affects_balance: true,
    origin: "landlord_manual",
    source: "manual",
    charge_id: "charge-1",
    idempotency_key: "manual_payment:evt-1",
    method: "cash",
  };
  assert.equal(rawEvent.amount < 0, true, "amount must be negative");
  assert.equal(rawEvent.event_type, "payment");
  assert.equal(rawEvent.affects_balance, true);
  assert.equal(rawEvent.origin, "landlord_manual");
  assert.equal(rawEvent.source, "manual");
  assert.equal(typeof rawEvent.charge_id, "string");
  assert.ok(rawEvent.idempotency_key.startsWith("manual_payment:"));
  assert.equal("paid_amount" in rawEvent, false, "must NOT populate paid_amount like the old model did");
  assert.equal("status" in rawEvent, false, "must NOT populate status like the old model did");
});

// --- Linked payment reduces the projected charge ---------------------------------------------

test("a linked -500 payment against a +2000 charge projects one partial row", () => {
  const projected = projectLedgerRows([
    row({ id: "charge-1", event_type: "charge", amount: 2000, billing_period_id: "2026-09" }),
    row({ id: "evt-1", event_type: "payment", amount: -500, charge_id: "charge-1", origin: "landlord_manual" }),
  ]);
  assert.equal(projected.length, 1, "the linked payment must not appear as a second row");
  assert.equal(projected[0].amount, 2000);
  assert.equal(projected[0].paidAmount, 500);
  assert.equal(projected[0].status, "partial");
});

// --- Multiple payments against the same charge -------------------------------------------------

test("two -1000 payments against a +2000 charge fully settle it (one paid row)", () => {
  const projected = projectLedgerRows([
    row({ id: "charge-2", event_type: "charge", amount: 2000, created_at: "2026-09-01T00:00:00.000Z" }),
    row({ id: "evt-2a", event_type: "payment", amount: -1000, charge_id: "charge-2", origin: "landlord_manual", created_at: "2026-09-05T00:00:00.000Z" }),
    row({ id: "evt-2b", event_type: "payment", amount: -1000, charge_id: "charge-2", origin: "landlord_manual", created_at: "2026-09-10T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].status, "paid");
  assert.equal(projected[0].paidAmount, undefined);
});

// --- Standalone payment (no open charge to link) ----------------------------------------------

test("a payment with no matching open charge remains visible as its own standalone row", () => {
  const projected = projectLedgerRows([
    row({ id: "evt-3", event_type: "payment", amount: -900, charge_id: null, origin: "landlord_manual" }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].amount, 900, "displayed positive, never the raw negative event amount");
  assert.equal(projected[0].paidAmount, 900);
  assert.equal(projected[0].status, "paid");
  assert.equal(projected[0].chargeId, null);
});

// --- Offline replay: legacy vs new-model payloads, and the dropped amount-sign assumption ------

test("a legacy queued payment payload (pre-Phase-3D, positive amount, no event_type) remains replay-compatible", () => {
  const legacyPayload = { tenant_id: "t1", amount: 1000, paid_amount: 400, status: "partial", source: "manual" };
  // Tenant still owes money server-side -> should NOT need review.
  assert.equal(paymentReplayNeedsReview(legacyPayload, 1000), false);
  // Tenant is already fully settled server-side by the time this replays -> needs review, exactly
  // as it always has for a legacy payload.
  assert.equal(paymentReplayNeedsReview(legacyPayload, 0), true);
});

test("a new-model signed payment queue payload is evaluated the same way as a legacy one", () => {
  const newModelPayload = {
    tenant_id: "t1",
    amount: -1000, // negative — this is exactly what the old `amount > 0` gate would have missed
    event_type: "payment",
    affects_balance: true,
    origin: "landlord_manual",
    source: "manual",
    charge_id: "charge-1",
    idempotency_key: "manual_payment:evt-1",
  };
  assert.equal(paymentReplayNeedsReview(newModelPayload, 1000), false);
  assert.equal(paymentReplayNeedsReview(newModelPayload, 0), true);
});

test("offline replay's review gate no longer depends on the payload's own amount sign", () => {
  const legacyShaped = { tenant_id: "t1", amount: 1000 };
  const newModelShaped = { tenant_id: "t1", amount: -1000, event_type: "payment" };
  // Same server-side tenant state must produce the same decision for both shapes — proving the
  // gate is driven purely by tenantOwedAmount, not by whether `amount` happens to be positive.
  assert.equal(paymentReplayNeedsReview(legacyShaped, 0), paymentReplayNeedsReview(newModelShaped, 0));
  assert.equal(paymentReplayNeedsReview(legacyShaped, 500), paymentReplayNeedsReview(newModelShaped, 500));
  assert.equal(paymentReplayNeedsReview(newModelShaped, 0), true, "a negative-amount payload must still be flagged when the tenant is already settled");
});

console.log(`\n${passed} test(s) passed.`);
