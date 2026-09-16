// Phase 3B — generates ONE explicit rent-charge ledger event per active tenant for a single
// billing period (defaults to the current calendar month, Africa/Lusaka). Never backfills: this
// function only ever targets the one billing period it's given/defaults to, and
// generateRentCharge (../_shared/generateRentCharge.ts) skips any tenant not yet moved in or
// already moved out as of that period — there is no loop over historical months anywhere here.
//
// Idempotent: safe to invoke twice (a retried cron run, a manual re-trigger) for the same period —
// see generateRentCharge's unique-idempotency-key handling.
//
// Does NOT touch tenants.owed_amount/status, and is NOT wired to a schedule by any migration —
// deploying this function does not make it run automatically. Deploy and schedule are a
// deliberate separate step, once the read-side compatibility work (see chat history) is in place.
//
// Deploy:  supabase functions deploy generate-rent-charges
// Invoke:  POST with header x-cron-secret: <CRON_SECRET>, optional JSON body
//          { propertyId?: string, billingPeriodId?: 'YYYY-MM', dryRun?: boolean }
// dryRun:true returns each tenant's computed ChargePlan without writing anything — use this to
// review a period's charges before actually generating them.

import { createClient } from "npm:@supabase/supabase-js@2";
import { generateRentCharge, type GenerateResult } from "../_shared/generateRentCharge.ts";
import { currentPeriodDate } from "../_shared/billingPeriod.ts";

function parsePeriodId(billingPeriodId: string): Date {
  const [year, month] = billingPeriodId.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { propertyId?: string; billingPeriodId?: string; dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // No body (e.g. a plain pg_cron POST with none attached) — fall back to defaults below.
  }

  const periodDate = body.billingPeriodId ? parsePeriodId(body.billingPeriodId) : currentPeriodDate();
  const dryRun = body.dryRun === true;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let settingsQuery = supabase.from("settings").select("property_id, due_day, grace_period_days");
  if (body.propertyId) settingsQuery = settingsQuery.eq("property_id", body.propertyId);
  const { data: settingsRows, error: settingsError } = await settingsQuery;
  if (settingsError) {
    return new Response(JSON.stringify({ error: "Failed to load settings", detail: settingsError.message }), { status: 500 });
  }

  const results: GenerateResult[] = [];

  for (const settings of settingsRows ?? []) {
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, rent_amount, move_in_date, move_out_date, active, due_day, grace_period_days")
      .eq("property_id", settings.property_id)
      .eq("active", true);

    if (tenantsError) {
      results.push({ tenantId: settings.property_id, status: "error", message: tenantsError.message });
      continue;
    }

    for (const tenant of tenants ?? []) {
      results.push(await generateRentCharge(supabase, tenant, settings, periodDate, { dryRun }));
    }
  }

  return new Response(JSON.stringify({ billingPeriodId: `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`, dryRun, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
