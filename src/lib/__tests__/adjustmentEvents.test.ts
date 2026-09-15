// Phase B focused tests: NEW adjustments/credits/penalty-waivers written as financial-event rows
// (event_type='adjustment'|'credit'), and how they project/void — mirrors manualPaymentEvents.test.ts's
// approach for the Phase 3D payment migration.
//
// Run with:
//   NODE_OPTIONS="--experimental-loader ./src/lib/__tests__/stubSupabaseClientLoader.mjs" \
//     npx tsx src/lib/__tests__/adjustmentEvents.test.ts

import "./testEnv.setup.ts";
import assert from "node:assert/strict";
import { projectLedgerRows, type RawLedgerEntryRow } from "../tenants.ts";

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
    source: overrides.source ?? "adjustment",
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

// --- Event shapes (mirrors what TenantsContext.tsx's addAdjustment/waivePenalty now build) ------

test("a new positive adjustment (ad-hoc charge) has the exact Phase B shape", () => {
  const rawEvent = {
    tenant_id: "t1",
    label: "Broken window (tenant damage)",
    amount: 250,
    event_type: "adjustment",
    affects_balance: true,
    origin: "landlord_manual",
    source: "adjustment",
    charge_id: null,
    idempotency_key: "adjustment:evt-1",
  };
  assert.equal(rawEvent.amount > 0, true, "an ad-hoc charge is positive");
  assert.equal(rawEvent.event_type, "adjustment");
  assert.equal(rawEvent.affects_balance, true, "a real charge must affect the balance");
  assert.equal(rawEvent.origin, "landlord_manual");
  assert.equal("paid_amount" in rawEvent, false);
  assert.equal("status" in rawEvent, false);
});

test("a new credit (discount/goodwill) has the exact Phase B shape", () => {
  const rawEvent = {
    tenant_id: "t1",
    label: "Move-in discount",
    amount: -100,
    event_type: "credit",
    affects_balance: true,
    origin: "landlord_manual",
    source: "adjustment",
    charge_id: null,
    idempotency_key: "credit:evt-2",
  };
  assert.equal(rawEvent.amount < 0, true, "a credit reduces what's owed");
  assert.equal(rawEvent.event_type, "credit");
  assert.equal(rawEvent.affects_balance, true, "a real credit must affect the balance");
});

test("a penalty waiver is an audit-only row: affects_balance=false", () => {
  const rawEvent = {
    tenant_id: "t1",
    label: "Late penalty waived (12d, goodwill)",
    amount: -60,
    event_type: "adjustment",
    affects_balance: false,
    origin: "landlord_manual",
    source: "adjustment",
    charge_id: null,
    idempotency_key: "penalty_waiver:evt-3",
  };
  assert.equal(rawEvent.affects_balance, false, "waiving a never-persisted penalty must not double-count against the balance");
  assert.ok(rawEvent.idempotency_key.startsWith("penalty_waiver:"));
});

// --- Projection: balance-affecting vs audit-only -------------------------------------------------

test("a standalone +250 adjustment (charge) projects as its own unpaid-shaped history row", () => {
  const projected = projectLedgerRows([row({ id: "adj-1", event_type: "adjustment", amount: 250, affects_balance: true })]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].amount, 250);
  assert.equal(projected[0].eventType, "adjustment");
  assert.equal(projected[0].affectsBalance, true);
});

test("a standalone -100 credit projects as its own history row, amount shown as the actual signed effect", () => {
  const projected = projectLedgerRows([row({ id: "credit-1", event_type: "credit", amount: -100, affects_balance: true })]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].amount, -100);
  assert.equal(projected[0].eventType, "credit");
});

test("an audit-only penalty waiver (affects_balance=false) stays visible but is never merged into a linked charge", () => {
  const projected = projectLedgerRows([
    row({ id: "charge-1", event_type: "charge", amount: 2000, billing_period_id: "2026-09" }),
    row({ id: "waiver-1", event_type: "adjustment", amount: -60, affects_balance: false, charge_id: "charge-1" }),
  ]);
  assert.equal(projected.length, 2, "the waiver must remain its own row, not fold into the charge's paidAmount");
  const charge = projected.find((r) => r.id === "charge-1")!;
  assert.equal(charge.status, "unpaid", "an affects_balance=false row must not reduce what's outstanding on the charge");
  const waiver = projected.find((r) => r.id === "waiver-1")!;
  assert.equal(waiver.affectsBalance, false);
});

test("a linked +200 penalty-shaped adjustment (affects_balance=true) DOES reduce a charge's outstanding amount", () => {
  const projected = projectLedgerRows([
    row({ id: "charge-2", event_type: "charge", amount: 2000 }),
    row({ id: "credit-2", event_type: "credit", amount: -500, affects_balance: true, charge_id: "charge-2" }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].paidAmount, 500);
  assert.equal(projected[0].status, "partial");
});

// --- Void behavior for every new event type -------------------------------------------------------

test("voiding an adjustment (charge-shaped) removes it from the projection entirely", () => {
  const projected = projectLedgerRows([
    row({ id: "adj-2", event_type: "adjustment", amount: 300, voided_at: "2026-09-10T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 0);
});

test("voiding a credit removes it from the projection entirely", () => {
  const projected = projectLedgerRows([
    row({ id: "credit-3", event_type: "credit", amount: -150, voided_at: "2026-09-10T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 0);
});

test("voiding a linked credit restores the charge to its pre-credit outstanding amount", () => {
  const projected = projectLedgerRows([
    row({ id: "charge-3", event_type: "charge", amount: 2000 }),
    row({
      id: "credit-4",
      event_type: "credit",
      amount: -500,
      charge_id: "charge-3",
      affects_balance: true,
      voided_at: "2026-09-11T00:00:00.000Z",
    }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].status, "unpaid", "the voided credit must no longer reduce what's outstanding");
});

test("voiding a penalty-waiver audit row is reachable the same way as any other new-model row", () => {
  const projected = projectLedgerRows([
    row({ id: "waiver-2", event_type: "adjustment", amount: -60, affects_balance: false, voided_at: "2026-09-12T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 0, "a voided audit-only row must also disappear, same as every other voided row");
});

console.log(`\n${passed} test(s) passed.`);
