// Server-side safety net: runs every few minutes via pg_cron. Asks Lenco directly about any
// collection still pending / pay-offline and any payout still pending / processing, and applies
// the result exactly like the webhook would. Needed because the Lenco webhook may not be
// registered, and the portal's own polling only runs while a tenant keeps the page open.
// Auth: shared CRON_SECRET only (same as pay-portal-scheduled-payouts).
//
// Settles payments through the same ../_shared/reconcileCollection.ts as lenco-webhook and
// pay-portal-check-collection. Redeploy all of them together whenever that file changes.

import { createClient } from "npm:@supabase/supabase-js@2";
import { reconcileSuccessfulCollection } from "../_shared/reconcileCollection.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized" }, 401);

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) return json({ error: "LENCO_SECRET_KEY is not configured" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const headers = { Authorization: `Bearer ${lencoSecretKey}`, accept: "application/json" };
  const now = Date.now();
  const minAge = new Date(now - 60_000).toISOString();
  const maxAge = new Date(now - 3 * 86_400_000).toISOString();
  const summary = { collectionsChecked: 0, collectionsResolved: 0, payoutsChecked: 0, payoutsResolved: 0 };

  const { data: collections } = await supabase
    .from("collections")
    .select("id")
    .in("status", ["pending", "pay-offline"])
    .lt("created_at", minAge)
    .gt("created_at", maxAge)
    .limit(50);

  for (const c of collections ?? []) {
    summary.collectionsChecked++;
    try {
      const res = await fetch(`https://api.lenco.co/access/v2/collections/status/${c.id}`, { headers });
      const body = await res.json();
      const st: string | undefined = res.ok ? body?.data?.status : undefined;
      if (st !== "successful" && st !== "failed") continue;
      const { data: updated } = await supabase
        .from("collections")
        .update({
          status: st,
          lenco_collection_id: body.data.id ?? null,
          failure_reason: st === "failed" ? body.data.reasonForFailure ?? null : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", c.id)
        .in("status", ["pending", "pay-offline"])
        .select("id, tenant_id, property_id, amount, fee_amount, line_items")
        .maybeSingle();
      if (updated) {
        summary.collectionsResolved++;
        if (st === "successful") await reconcileSuccessfulCollection(supabase, updated);
      }
    } catch (err) {
      console.error("[reconcile-pending] collection check failed", c.id, String(err));
    }
  }

  const { data: payouts } = await supabase
    .from("payouts")
    .select("id")
    .in("status", ["pending", "processing"])
    .lt("created_at", minAge)
    .gt("created_at", maxAge)
    .limit(50);

  for (const p of payouts ?? []) {
    summary.payoutsChecked++;
    try {
      const res = await fetch(`https://api.lenco.co/access/v2/transfers/status/${p.id}`, { headers });
      const body = await res.json();
      const st: string | undefined = res.ok ? body?.data?.status : undefined;
      if (st !== "successful" && st !== "failed") continue;
      const { data: updated } = await supabase
        .from("payouts")
        .update({
          status: st,
          lenco_transaction_id: body.data.id ?? undefined,
          failure_reason: st === "failed" ? body.data.reasonForFailure ?? body.data.failure_reason ?? null : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id)
        .in("status", ["pending", "processing"])
        .select("id");
      if (updated && updated.length > 0) {
        summary.payoutsResolved++;
        if (st === "failed") await supabase.rpc("pay_portal_release_payout_collections", { p_payout_id: p.id });
      }
    } catch (err) {
      console.error("[reconcile-pending] payout check failed", p.id, String(err));
    }
  }

  return json({ ok: true, ...summary });
});
