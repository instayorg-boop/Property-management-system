// Phase 3C focused tests for the centralized ledger projection in src/lib/tenants.ts.
//
// No test runner is configured in this project (no vitest/jest in package.json) — this is a
// plain assertion script, run with:
//   NODE_OPTIONS="--experimental-loader ./src/lib/__tests__/stubSupabaseClientLoader.mjs" \
//     npx tsx src/lib/__tests__/ledgerProjection.test.ts
// (see the loader file's own comment for why the stub is needed).

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

// Minimal builder — every field defaults to the "not set" value a real row would have unless
// overridden, so each test only spells out what actually matters for that case.
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

test("legacy paid row passes through unchanged", () => {
  const projected = projectLedgerRows([
    row({ id: "l1", amount: 1000, status: "paid", source: "manual", created_at: "2026-09-01T10:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].amount, 1000);
  assert.equal(projected[0].paidAmount, undefined);
  assert.equal(projected[0].status, "paid");
  assert.equal(projected[0].eventType, undefined); // legacy rows carry no new-model metadata
});

test("legacy partial row passes through unchanged", () => {
  const projected = projectLedgerRows([
    row({ id: "l2", amount: 1000, paid_amount: 400, status: "partial", created_at: "2026-09-01T10:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].amount, 1000);
  assert.equal(projected[0].paidAmount, 400);
  assert.equal(projected[0].status, "partial");
});

test("new +2000 charge with no payments yet projects as unpaid", () => {
  const projected = projectLedgerRows([
    row({ id: "c1", event_type: "charge", amount: 2000, billing_period_id: "2026-09", created_at: "2026-09-01T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].amount, 2000);
  assert.equal(projected[0].paidAmount, undefined);
  assert.equal(projected[0].status, "unpaid");
  assert.equal(projected[0].eventType, "charge");
  assert.equal(projected[0].billingPeriodId, "2026-09");
});

test("-1000 payment against a +2000 charge projects one partial charge row, not two rows", () => {
  const projected = projectLedgerRows([
    row({ id: "c2", event_type: "charge", amount: 2000, created_at: "2026-09-01T00:00:00.000Z" }),
    row({ id: "p1", event_type: "payment", amount: -1000, charge_id: "c2", created_at: "2026-09-05T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 1, "the linked payment must not appear as its own independent row");
  assert.equal(projected[0].amount, 2000);
  assert.equal(projected[0].paidAmount, 1000);
  assert.equal(projected[0].status, "partial");
  assert.ok(projected[0].amount >= 0 && (projected[0].paidAmount ?? 0) >= 0, "no negative amount surfaced");
});

test("a second -1000 payment against the same charge fully settles it", () => {
  const projected = projectLedgerRows([
    row({ id: "c3", event_type: "charge", amount: 2000, created_at: "2026-09-01T00:00:00.000Z" }),
    row({ id: "p2", event_type: "payment", amount: -1000, charge_id: "c3", created_at: "2026-09-05T00:00:00.000Z" }),
    row({ id: "p3", event_type: "payment", amount: -1000, charge_id: "c3", created_at: "2026-09-10T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].paidAmount, undefined, "a fully-paid row doesn't carry paidAmount, matching legacy convention");
  assert.equal(projected[0].status, "paid");
});

test("fully paid charge (single payment covering it exactly) projects as paid", () => {
  const projected = projectLedgerRows([
    row({ id: "c4", event_type: "charge", amount: 1500, created_at: "2026-09-01T00:00:00.000Z" }),
    row({ id: "p4", event_type: "payment", amount: -1500, charge_id: "c4", created_at: "2026-09-02T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].status, "paid");
  assert.equal(projected[0].paidAmount, undefined);
});

test("a voided payment does not reduce the charge it was linked to", () => {
  const projected = projectLedgerRows([
    row({ id: "c5", event_type: "charge", amount: 2000, created_at: "2026-09-01T00:00:00.000Z" }),
    row({ id: "p5", event_type: "payment", amount: -2000, charge_id: "c5", voided_at: "2026-09-06T00:00:00.000Z", created_at: "2026-09-05T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 1, "the voided payment itself must not appear as a separate row either");
  assert.equal(projected[0].status, "unpaid", "voiding the only payment leaves the charge fully outstanding again");
  assert.equal(projected[0].paidAmount, undefined);
});

test("a standalone payment (no charge_id) remains visible as its own history row", () => {
  const projected = projectLedgerRows([
    row({ id: "p6", event_type: "payment", amount: -750, created_at: "2026-09-01T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].amount, 750, "negative event amount is never surfaced directly");
  assert.equal(projected[0].paidAmount, 750);
  assert.equal(projected[0].status, "paid");
  assert.equal(projected[0].chargeId, null);
});

test("a waived-penalty audit row (affects_balance=false) stays visible but never affects a linked charge", () => {
  const projected = projectLedgerRows([
    row({ id: "c6", event_type: "charge", amount: 1000, created_at: "2026-09-01T00:00:00.000Z" }),
    row({
      id: "w1",
      event_type: "penalty",
      amount: -50,
      charge_id: "c6",
      affects_balance: false,
      label: "Late penalty waived",
      created_at: "2026-09-10T00:00:00.000Z",
    }),
  ]);
  assert.equal(projected.length, 2, "the audit row stays visible as its own entry, separate from the charge");
  const charge = projected.find((r) => r.id === "c6")!;
  const audit = projected.find((r) => r.id === "w1")!;
  assert.equal(charge.status, "unpaid", "an affects_balance=false row must not reduce the charge's outstanding amount");
  assert.equal(audit.affectsBalance, false);
});

console.log(`\n${passed} test(s) passed.`);
