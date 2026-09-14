// Focused tests for the delete->void rework: a voided row (legacy or new-model) must disappear
// from projectLedgerRows' output the same way, and a voided linked payment must leave its charge
// exactly as if that payment had never happened.
//
// Run with:
//   NODE_OPTIONS="--experimental-loader ./src/lib/__tests__/stubSupabaseClientLoader.mjs" \
//     npx tsx src/lib/__tests__/voidLedgerEntry.test.ts

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

test("a voided LEGACY row (event_type null) disappears from the projection", () => {
  const projected = projectLedgerRows([
    row({ id: "l1", amount: 1000, status: "paid", voided_at: "2026-09-10T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 0, "a voided legacy row must not appear at all — this was previously unfiltered");
});

test("a non-voided legacy row is unaffected by the new voided_at check", () => {
  const projected = projectLedgerRows([row({ id: "l2", amount: 1000, status: "paid" })]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].amount, 1000);
});

test("a voided NEW-MODEL standalone row disappears (unchanged behavior)", () => {
  const projected = projectLedgerRows([
    row({ id: "p1", event_type: "payment", amount: -500, voided_at: "2026-09-10T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 0);
});

test("a voided charge itself disappears entirely, even with no payments linked", () => {
  const projected = projectLedgerRows([
    row({ id: "c1", event_type: "charge", amount: 2000, voided_at: "2026-09-10T00:00:00.000Z" }),
  ]);
  assert.equal(projected.length, 0, "a voided charge must not surface as an unpaid obligation");
});

test("voiding the only payment linked to a charge leaves the charge exactly as if it were never paid", () => {
  const projected = projectLedgerRows([
    row({ id: "c2", event_type: "charge", amount: 2000, created_at: "2026-09-01T00:00:00.000Z" }),
    row({
      id: "p2",
      event_type: "payment",
      amount: -2000,
      charge_id: "c2",
      voided_at: "2026-09-06T00:00:00.000Z",
      created_at: "2026-09-05T00:00:00.000Z",
    }),
  ]);
  assert.equal(projected.length, 1, "the voided payment must not appear as its own row either");
  assert.equal(projected[0].status, "unpaid");
  assert.equal(projected[0].paidAmount, undefined);
});

test("voiding one of two payments against a charge leaves it correctly partial", () => {
  const projected = projectLedgerRows([
    row({ id: "c3", event_type: "charge", amount: 2000, created_at: "2026-09-01T00:00:00.000Z" }),
    row({ id: "p3a", event_type: "payment", amount: -1000, charge_id: "c3", created_at: "2026-09-05T00:00:00.000Z" }),
    row({
      id: "p3b",
      event_type: "payment",
      amount: -1000,
      charge_id: "c3",
      voided_at: "2026-09-11T00:00:00.000Z",
      created_at: "2026-09-10T00:00:00.000Z",
    }),
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].status, "partial");
  assert.equal(projected[0].paidAmount, 1000, "only the non-voided payment should count");
});

console.log(`\n${passed} test(s) passed.`);
