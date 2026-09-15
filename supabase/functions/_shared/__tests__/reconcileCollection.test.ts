// Phase A focused tests: NEW Lenco-confirmed payments recorded via the financial-event model
// (event_type='payment', origin='lenco_webhook', source='lenco') for a new-model-only tenant,
// while a legacy/mixed tenant's write path (reconcileSuccessfulCollection's pre-existing
// charge-shaped ledger writes + CAS settlement) is completely unchanged.
//
// Run with:
//   npx tsx supabase/functions/_shared/__tests__/reconcileCollection.test.ts

import assert from "node:assert/strict";
import {
  isNewModelTenant,
  findCurrentPeriodOpenChargeId,
  recordNewModelLencoPayment,
  type CollectionForReconciliation,
} from "../reconcileCollection.ts";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`);
    throw e;
  }
}

// A minimal chainable query-builder fake: every method returns `this` except the two terminal
// forms real supabase-js queries actually resolve through — `.maybeSingle()` and plain `await`
// (a thenable) — both driven by whatever `result` this particular builder was constructed with.
function makeQuery(result: { data: unknown; error: { message: string } | null }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "limit", "order", "in"]) {
    q[m] = () => q;
  }
  q.maybeSingle = () => Promise.resolve(result);
  q.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(result).then(resolve, reject);
  return q;
}

function collectionRow(overrides: Partial<CollectionForReconciliation> = {}): CollectionForReconciliation {
  return {
    id: "col-1",
    tenant_id: "t1",
    property_id: "p1",
    amount: 500,
    fee_amount: 0,
    line_items: null,
    ...overrides,
  };
}

async function main() {
  // --- isNewModelTenant ------------------------------------------------------------------------

  await test("isNewModelTenant: no legacy rows -> true", async () => {
    const fake = { from: () => makeQuery({ data: [], error: null }) };
    assert.equal(await isNewModelTenant(fake as never, "t1"), true);
  });

  await test("isNewModelTenant: at least one legacy row -> false", async () => {
    const fake = { from: () => makeQuery({ data: [{ id: "legacy-1" }], error: null }) };
    assert.equal(await isNewModelTenant(fake as never, "t1"), false);
  });

  await test("isNewModelTenant: a read failure conservatively treats the tenant as legacy", async () => {
    const fake = { from: () => makeQuery({ data: null, error: { message: "boom" } }) };
    assert.equal(await isNewModelTenant(fake as never, "t1"), false);
  });

  // --- findCurrentPeriodOpenChargeId ------------------------------------------------------------

  await test("findCurrentPeriodOpenChargeId: no open charge this period -> null", async () => {
    const fake = { from: () => makeQuery({ data: null, error: null }) };
    assert.equal(await findCurrentPeriodOpenChargeId(fake as never, "t1"), null);
  });

  await test("findCurrentPeriodOpenChargeId: an unpaid open charge is returned", async () => {
    let call = 0;
    const fake = {
      from: () => {
        call++;
        // 1st call: the charge lookup itself. 2nd call: the linked-events sum.
        return call === 1 ? makeQuery({ data: { id: "charge-1", amount: 2000 }, error: null }) : makeQuery({ data: [], error: null });
      },
    };
    assert.equal(await findCurrentPeriodOpenChargeId(fake as never, "t1"), "charge-1");
  });

  await test("findCurrentPeriodOpenChargeId: a charge already fully settled by other events is not reused", async () => {
    let call = 0;
    const fake = {
      from: () => {
        call++;
        return call === 1
          ? makeQuery({ data: { id: "charge-1", amount: 2000 }, error: null })
          : makeQuery({ data: [{ amount: -2000 }], error: null });
      },
    };
    assert.equal(await findCurrentPeriodOpenChargeId(fake as never, "t1"), null);
  });

  // --- recordNewModelLencoPayment: event shape ---------------------------------------------------

  await test("a new Lenco payment event has the exact Phase A shape", async () => {
    const inserted: Record<string, unknown>[] = [];
    let rpcCalled: string | null = null;
    const fake = {
      from: (table: string) => {
        if (table === "ledger_entries") {
          return {
            ...makeQuery({ data: null, error: null }), // charge lookup -> no open charge
            insert: (payload: Record<string, unknown>) => {
              inserted.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc: (fnName: string) => {
        rpcCalled = fnName;
        return makeQuery({ data: { tenant_id: "t1", synchronized: true, skip_reason: null, balance: 0, status: "paid", days_overdue: 0 }, error: null });
      },
    };
    await recordNewModelLencoPayment(fake as never, collectionRow(), 500);

    assert.equal(inserted.length, 1);
    const event = inserted[0];
    assert.equal(event.amount, -500, "amount must be negative — the actual payment amount");
    assert.equal(event.event_type, "payment");
    assert.equal(event.affects_balance, true);
    assert.equal(event.origin, "lenco_webhook");
    assert.equal(event.source, "lenco");
    assert.equal(event.method, "mobile-money");
    assert.equal(event.idempotency_key, "lenco_payment:col-1");
    assert.equal("paid_amount" in event, false, "must NOT populate paid_amount like the legacy charge-shaped row did");
    assert.equal("status" in event, false, "must NOT populate status like the legacy charge-shaped row did");
    assert.equal(rpcCalled, "sync_tenant_balance_if_new_model", "must sync the authoritative balance after a successful insert");
  });

  // --- duplicate webhook / idempotency ------------------------------------------------------------

  await test("a duplicate Lenco webhook delivery (23505 on the unique idempotency index) is swallowed, not thrown", async () => {
    let rpcCalled = false;
    const fake = {
      from: (table: string) => ({
        ...makeQuery({ data: null, error: null }),
        insert: () => Promise.resolve({ error: { code: "23505", message: "duplicate key" } }),
      }),
      rpc: () => {
        rpcCalled = true;
        return makeQuery({ data: null, error: null });
      },
    };
    // Must not throw.
    await recordNewModelLencoPayment(fake as never, collectionRow(), 500);
    assert.equal(rpcCalled, false, "a duplicate insert must never reach the sync call");
  });

  // --- race-condition fallback: sync unexpectedly reports not-synchronized -----------------------

  await test("if sync unexpectedly reports not-synchronized after insert, falls back to legacy CAS settlement", async () => {
    const tenantUpdates: Record<string, unknown>[] = [];
    let selectCall = 0;
    const fake = {
      from: (table: string) => {
        if (table === "ledger_entries") {
          return {
            ...makeQuery({ data: null, error: null }),
            insert: () => Promise.resolve({ error: null }),
          };
        }
        if (table === "tenants") {
          selectCall++;
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { status: "unpaid", owed_amount: 500, days_overdue: 0, on_time_count: 0, total_months_count: 0 },
                  }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              tenantUpdates.push(payload);
              return { eq: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [{ id: "t1" }], error: null }) }) }) };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc: () =>
        makeQuery({ data: { tenant_id: "t1", synchronized: false, skip_reason: "skipped_legacy_or_mixed", balance: null, status: null, days_overdue: null }, error: null }),
    };
    await recordNewModelLencoPayment(fake as never, collectionRow(), 500);
    assert.equal(tenantUpdates.length, 1, "the legacy CAS settlement fallback must run exactly once");
    assert.equal(tenantUpdates[0].owed_amount, 0);
    assert.equal(selectCall, 2, "one from(\"tenants\") call for the read, one for the update");
  });

  console.log(`\n${passed} test(s) passed.`);
}

void main();
