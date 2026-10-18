// Tier 1 money logic: the late-fee and pro-rata formulas in src/landlord/invoiceUtils.ts.
//
// These are the figures the Rent page, the Dashboard, invoices, the payment portal and every
// receipt ultimately quote, so a change here is a change to what tenants are told they owe.
// Everything below is pure: no database, no network, no clock dependence except where a date is
// passed in explicitly.
//
// Run with: npm test -- invoiceMath

import assert from "node:assert/strict";
import type { Tenant } from "../TenantsContext.ts";
import {
  DEFAULT_LATE_FEE_CONFIG,
  calcLatePenalty,
  calcPenalty,
  calcTotalOwed,
  computeInvoiceDates,
  daysInMonth,
  getProrataInfo,
  setLateFeeConfig,
  type LateFeeConfig,
} from "../invoiceUtils.ts";

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

/** Only the handful of fields these formulas actually read. Cast rather than spelled out in full:
 * a real Tenant carries twenty-odd unrelated fields, and listing them would hide which ones the
 * case under test depends on. */
function tenant(fields: { rentAmount?: number; owedAmount?: number; daysOverdue?: number; moveInDate?: string }): Tenant {
  return {
    rentAmount: fields.rentAmount ?? 1800,
    owedAmount: fields.owedAmount ?? 0,
    daysOverdue: fields.daysOverdue,
    moveInDate: fields.moveInDate ?? "1 Jan 2026",
  } as unknown as Tenant;
}

const config = (overrides: Partial<LateFeeConfig>): LateFeeConfig => ({ ...DEFAULT_LATE_FEE_CONFIG, ...overrides });

// ---------------------------------------------------------------------------------------------
// daysInMonth: every other formula here divides by it, so a leap year getting this wrong would
// quietly skew a whole February of penalties.
// ---------------------------------------------------------------------------------------------

test("daysInMonth knows month lengths, including a leap February", () => {
  assert.equal(daysInMonth(2026, 0), 31); // January
  assert.equal(daysInMonth(2026, 1), 28); // February 2026, not a leap year
  assert.equal(daysInMonth(2028, 1), 29); // February 2028, a leap year
  assert.equal(daysInMonth(2026, 3), 30); // April
});

// ---------------------------------------------------------------------------------------------
// Pro rata: a tenant moving in mid-month owes for the days they actually have the room.
// ---------------------------------------------------------------------------------------------

test("moving in on the 1st is never pro rata, it is a whole month", () => {
  const info = getProrataInfo(tenant({ moveInDate: "1 Oct 2026" }), new Date(2026, 9, 1));
  assert.equal(info.isProrata, false);
});

test("moving in mid-month charges from the move-in day to month end, inclusive", () => {
  const info = getProrataInfo(tenant({ moveInDate: "18 Oct 2026" }), new Date(2026, 9, 1));
  assert.equal(info.isProrata, true);
  assert.equal(info.totalDays, 31);
  // 18 Oct through 31 Oct is 14 days, the move-in day included: the tenant has the room that night.
  assert.equal(info.days, 14);
});

test("a later period for the same tenant is a whole month, not pro rata again", () => {
  const info = getProrataInfo(tenant({ moveInDate: "18 Oct 2026" }), new Date(2026, 10, 1));
  assert.equal(info.isProrata, false);
});

test("an unparseable move-in date reports no proration rather than guessing", () => {
  const info = getProrataInfo(tenant({ moveInDate: "not a date" }), new Date(2026, 9, 1));
  assert.deepEqual(info, { isProrata: false, days: 0, totalDays: 0 });
});

// ---------------------------------------------------------------------------------------------
// Late fees. Three modes, a cap, and an off switch. The off switch matters most: a property that
// does not charge late fees must never have one appear on a receipt.
// ---------------------------------------------------------------------------------------------

test("late fees disabled means no penalty, however overdue the tenant is", () => {
  assert.equal(calcLatePenalty(1800, 90, config({ enabled: false })), 0);
});

test("nothing overdue means no penalty", () => {
  assert.equal(calcLatePenalty(1800, 0, config({})), 0);
  assert.equal(calcLatePenalty(1800, undefined, config({})), 0);
});

test("a negative days-overdue is treated as not overdue, never as a credit", () => {
  assert.equal(calcLatePenalty(1800, -5, config({})), 0);
});

test("fixed mode charges the flat daily amount per day overdue", () => {
  const cfg = config({ mode: "fixed", fixedAmountPerDay: 25 });
  assert.equal(calcLatePenalty(1800, 4, cfg), 100);
});

test("percent mode charges a percentage of rent per day overdue", () => {
  const cfg = config({ mode: "percent_of_rent", percentPerDay: 1.5 });
  // 1.5% of 1800 is 27 a day, over 3 days.
  assert.equal(calcLatePenalty(1800, 3, cfg), 81);
});

test("prorated mode charges a day of rent per day overdue, against that month's length", () => {
  const cfg = config({ mode: "prorated_rent" });
  // A 31-day month: 1800/31 is 58.06 a day, 5 days rounds to 290.
  assert.equal(calcLatePenalty(1800, 5, cfg, new Date(2026, 9, 15)), 290);
  // The same tenant, same lateness, in a 28-day month costs more per day: 1800/28 is 64.29.
  assert.equal(calcLatePenalty(1800, 5, cfg, new Date(2026, 1, 15)), 321);
});

test("a cap stops the penalty growing past it", () => {
  const cfg = config({ mode: "fixed", fixedAmountPerDay: 50, capEnabled: true, capAmount: 300 });
  assert.equal(calcLatePenalty(1800, 4, cfg), 200, "under the cap, charged in full");
  assert.equal(calcLatePenalty(1800, 20, cfg), 300, "over the cap, held at the cap");
});

test("a cap that is not enabled is ignored even when an amount is set", () => {
  const cfg = config({ mode: "fixed", fixedAmountPerDay: 50, capEnabled: false, capAmount: 300 });
  assert.equal(calcLatePenalty(1800, 20, cfg), 1000);
});

// ---------------------------------------------------------------------------------------------
// What a tenant actually owes right now. calcTotalOwed is what the payment portal charges and
// what "pay in full" uses, so arrears plus penalty must be exact.
// ---------------------------------------------------------------------------------------------

test("total owed is arrears plus the accrued penalty", () => {
  setLateFeeConfig(config({ mode: "fixed", fixedAmountPerDay: 20 }));
  const t = tenant({ rentAmount: 1800, owedAmount: 1800, daysOverdue: 3 });
  assert.equal(calcPenalty(t), 60);
  assert.equal(calcTotalOwed(t), 1860);
  setLateFeeConfig(DEFAULT_LATE_FEE_CONFIG);
});

test("a tenant in credit owes nothing, the negative balance is never a penalty discount", () => {
  setLateFeeConfig(config({ enabled: false }));
  assert.equal(calcTotalOwed(tenant({ owedAmount: -500 })), 0);
  setLateFeeConfig(DEFAULT_LATE_FEE_CONFIG);
});

test("owing money with no lateness is just the balance", () => {
  setLateFeeConfig(config({}));
  assert.equal(calcTotalOwed(tenant({ owedAmount: 900, daysOverdue: 0 })), 900);
  setLateFeeConfig(DEFAULT_LATE_FEE_CONFIG);
});

// ---------------------------------------------------------------------------------------------
// Due dates. The clamp is the case that bites: a due day of 31 in a 30-day month.
// ---------------------------------------------------------------------------------------------

test("the due date is the due day of the invoice's own month", () => {
  const { dueDate } = computeInvoiceDates(new Date(2026, 9, 1), 18);
  assert.equal(dueDate.getFullYear(), 2026);
  assert.equal(dueDate.getMonth(), 9);
  assert.equal(dueDate.getDate(), 18);
});

test("a due day past the end of the month clamps to the last day, it never rolls into the next", () => {
  const { dueDate } = computeInvoiceDates(new Date(2026, 3, 1), 31); // April has 30 days
  assert.equal(dueDate.getMonth(), 3, "still April");
  assert.equal(dueDate.getDate(), 30);

  const feb = computeInvoiceDates(new Date(2026, 1, 1), 30).dueDate; // February 2026 has 28
  assert.equal(feb.getMonth(), 1, "still February");
  assert.equal(feb.getDate(), 28);
});

console.log(`\n${passed} test(s) passed.`);
