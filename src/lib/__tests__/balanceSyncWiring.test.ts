// Phase 3E focused tests for the "write event, then sync" wiring — logPayments/generateRentCharge/
// voidLedgerEntry all now insert their event first and call sync_tenant_balance_if_new_model
// after, falling back to a manual balance write only when sync didn't do it itself.
//
// Scope note: generateRentCharge takes its Supabase client as an explicit parameter, so its full
// call order (including the dryRun/failure short-circuits) is directly testable here with a fake
// client. logPayments and voidLedgerEntry's actual orchestration lives in TenantsContext.tsx (a
// React context), which this project has no React-rendering test infrastructure for — the parts
// of that wiring that ARE pure functions (needsBalanceFallbackWrite) and the parts that are
// lib/tenants.ts primitives they call in sequence (addLedgerEvent, syncTenantBalanceIfNewModel,
// voidLedgerEntry) are tested directly below; the exact call-ordering inside the two React context
// methods was verified by code review and the successful build, not by an automated test.
//
// Run with:
//   NODE_OPTIONS="--experimental-loader ./src/lib/__tests__/stubSupabaseClientLoader.mjs" \
//     npx tsx src/lib/__tests__/balanceSyncWiring.test.ts

import assert from "node:assert/strict";
import { supabase } from "../supabaseClient.ts";
import { addLedgerEvent, syncTenantBalanceIfNewModel, needsBalanceFallbackWrite, voidLedgerEntry, VoidRefusedError } from "../tenants.ts";
import { generateRentCharge, type TenantForCharge, type SettingsForBilling } from "../../../supabase/functions/_shared/generateRentCharge.ts";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`ok - ${name}`);
    })
    .catch((e) => {
      console.error(`FAIL - ${name}`);
      throw e;
    });
}

// A minimal fake mimicking just the surface addLedgerEvent/syncTenantBalanceIfNewModel/
// voidLedgerEntry actually call, recording call order for assertions.
function installFakeSupabase(opts: {
  insertError?: { message: string } | null;
  rpcResponses?: Record<string, { data: unknown; error: { message: string } | null }>;
}) {
  const calls: string[] = [];
  const fake = supabase as unknown as { from: unknown; rpc: unknown };
  fake.from = (table: string) => ({
    insert: (_payload: unknown) => {
      calls.push(`insert:${table}`);
      return Promise.resolve({ error: opts.insertError ?? null });
    },
  });
  fake.rpc = (fnName: string, _args: unknown) => {
    calls.push(`rpc:${fnName}`);
    const response = opts.rpcResponses?.[fnName] ?? { data: null, error: null };
    return { maybeSingle: () => Promise.resolve(response) };
  };
  return calls;
}

async function main() {
  // --- needsBalanceFallbackWrite (the shared decision both call sites use) -------------------

  await test("needsBalanceFallbackWrite: a synchronized new-model result needs no fallback", () => {
    assert.equal(needsBalanceFallbackWrite({ synchronized: true }), false);
  });

  await test("needsBalanceFallbackWrite: a legacy/mixed tenant (synchronized=false) still needs the fallback", () => {
    assert.equal(needsBalanceFallbackWrite({ synchronized: false }), true);
  });

  await test("needsBalanceFallbackWrite: a failed/skipped sync call (null) falls back too", () => {
    assert.equal(needsBalanceFallbackWrite(null), true);
  });

  // --- manual payment: event insert, then sync (lib/tenants.ts primitives, in the order
  //     TenantsContext.tsx's logPayments actually calls them) --------------------------------

  await test("manual payment: addLedgerEvent then syncTenantBalanceIfNewModel run in order", async () => {
    const calls = installFakeSupabase({
      rpcResponses: {
        sync_tenant_balance_if_new_model: { data: { tenant_id: "t1", synchronized: true, skip_reason: null, balance: 1000, status: "partial", days_overdue: 0 }, error: null },
      },
    });
    await addLedgerEvent({
      id: "evt-1",
      tenantId: "t1",
      label: "test payment",
      amount: -500,
      eventType: "payment",
      affectsBalance: true,
      origin: "landlord_manual",
      source: "manual",
      chargeId: null,
      idempotencyKey: "manual_payment:evt-1",
    });
    const result = await syncTenantBalanceIfNewModel("t1");
    assert.deepEqual(calls, ["insert:ledger_entries", "rpc:sync_tenant_balance_if_new_model"]);
    assert.equal(result.synchronized, true);
    assert.equal(needsBalanceFallbackWrite(result), false);
  });

  await test("legacy/mixed tenant: sync reports not-synchronized, so the caller must still fall back", async () => {
    installFakeSupabase({
      rpcResponses: {
        sync_tenant_balance_if_new_model: { data: { tenant_id: "t2", synchronized: false, skip_reason: "skipped_legacy_or_mixed", balance: null, status: null, days_overdue: null }, error: null },
      },
    });
    const result = await syncTenantBalanceIfNewModel("t2");
    assert.equal(result.synchronized, false);
    assert.equal(result.skipReason, "skipped_legacy_or_mixed");
    assert.equal(needsBalanceFallbackWrite(result), true, "legacy/mixed tenants must keep getting the manual balance write");
  });

  // --- void: refusal never gets past the RPC call, success does -----------------------------

  await test("void charge (refused): throws VoidRefusedError and makes exactly one rpc call", async () => {
    const calls = installFakeSupabase({
      rpcResponses: {
        void_ledger_entry: { data: { entry_id: "c1", voided: false, refusal_reason: "charge_has_active_linked_events" }, error: null },
      },
    });
    await assert.rejects(() => voidLedgerEntry("c1", "test"), VoidRefusedError);
    assert.deepEqual(calls, ["rpc:void_ledger_entry"], "a refused void must not attempt any further write");
  });

  await test("void charge (succeeds): resolves without throwing", async () => {
    const calls = installFakeSupabase({
      rpcResponses: {
        void_ledger_entry: { data: { entry_id: "c2", voided: true, refusal_reason: null }, error: null },
      },
    });
    await voidLedgerEntry("c2", "test");
    assert.deepEqual(calls, ["rpc:void_ledger_entry"]);
    // The actual "call syncTenantBalanceIfNewModel after a successful void" step lives in
    // TenantsContext.tsx's voidLedgerEntry, one layer above this lib/tenants.ts function — not
    // exercised here; see this file's header comment.
  });

  // --- generateRentCharge: full call order, directly testable via its injectable client -----

  const settings: SettingsForBilling = { due_day: 5, grace_period_days: 3 };
  const periodDate = new Date(2026, 8, 1);
  const tenant: TenantForCharge = {
    id: "t3",
    rent_amount: 1000,
    move_in_date: "1 Jan 2026",
    move_out_date: null,
    active: true,
    due_day: null,
    grace_period_days: null,
  };

  await test("new charge: insert succeeds, then sync is called", async () => {
    const calls: string[] = [];
    const fakeSupabase = {
      from: (table: string) => ({
        insert: (_payload: unknown) => ({
          select: (_cols: string) => ({
            single: () => {
              calls.push(`insert:${table}`);
              return Promise.resolve({ data: { id: "charge-1" }, error: null });
            },
          }),
        }),
      }),
      rpc: (fnName: string, _args: unknown) => {
        calls.push(`rpc:${fnName}`);
        return Promise.resolve({ error: null });
      },
    };
    const result = await generateRentCharge(fakeSupabase, tenant, settings, periodDate);
    assert.equal(result.status, "created");
    assert.deepEqual(calls, ["insert:ledger_entries", "rpc:sync_tenant_balance_if_new_model"]);
  });

  await test("dryRun charge: never inserts and never syncs", async () => {
    const calls: string[] = [];
    const fakeSupabase = {
      from: () => {
        calls.push("from");
        throw new Error("dryRun must not touch the database at all");
      },
      rpc: () => {
        calls.push("rpc");
        throw new Error("dryRun must not call sync");
      },
    };
    const result = await generateRentCharge(fakeSupabase, tenant, settings, periodDate, { dryRun: true });
    assert.equal(result.status, "dry_run");
    assert.deepEqual(calls, [], "no database call of any kind for a dry run");
  });

  await test("failed charge insert: does not call sync", async () => {
    const calls: string[] = [];
    const fakeSupabase = {
      from: (table: string) => ({
        insert: (_payload: unknown) => ({
          select: (_cols: string) => ({
            single: () => {
              calls.push(`insert:${table}`);
              return Promise.resolve({ data: null, error: { code: "23514", message: "some constraint violation" } });
            },
          }),
        }),
      }),
      rpc: (fnName: string) => {
        calls.push(`rpc:${fnName}`);
        return Promise.resolve({ error: null });
      },
    };
    const result = await generateRentCharge(fakeSupabase, tenant, settings, periodDate);
    assert.equal(result.status, "error");
    assert.deepEqual(calls, ["insert:ledger_entries"], "a failed insert must never reach the sync call");
  });

  await test("duplicate charge (idempotency hit): does not call sync either", async () => {
    const calls: string[] = [];
    const fakeSupabase = {
      from: (table: string) => ({
        insert: (_payload: unknown) => ({
          select: (_cols: string) => ({
            single: () => {
              calls.push(`insert:${table}`);
              return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
            },
          }),
        }),
      }),
      rpc: (fnName: string) => {
        calls.push(`rpc:${fnName}`);
        return Promise.resolve({ error: null });
      },
    };
    const result = await generateRentCharge(fakeSupabase, tenant, settings, periodDate);
    assert.equal(result.status, "already_exists");
    assert.deepEqual(calls, ["insert:ledger_entries"], "no new charge was actually created, so nothing to sync");
  });

  console.log(`\n${passed} test(s) passed.`);
}

void main();
