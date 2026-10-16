// Moves IPM's own accrued revenue, collection fees (on tenant rent payments), payout fees (on
// landlord withdrawals) and subscription payments, out of the shared Lenco wallet and into IPM's
// own company bank account. Everything else (the rent itself, and the fee amount until this runs)
// stays in the shared wallet exactly as it does today, lenco-payout already nets the fee out of
// what a landlord receives, so the fee was never paid out to them in the first place; this is the
// other half, actually moving that accrued fee money (plus subscription revenue) to IPM's own
// account instead of leaving it sitting in the shared wallet indefinitely.
//
// Company bank details are read from three Supabase secrets (never stored in the DB, never shown
// on any dashboard): COMPANY_BANK_NAME, COMPANY_BANK_ACCOUNT_NUMBER, COMPANY_BANK_ACCOUNT_NAME.
// COMPANY_BANK_NAME is matched against the `banks` table (the same table Settings > Bank & payouts
// uses) to find the Lenco bank code, so this never needs its own hardcoded code.
//
// The Lenco transfer-recipient for the company account is created once (via the same endpoint
// create-payout-recipient uses for landlords) and cached in company_payout_recipient, a singleton
// table, so every later sweep reuses it instead of registering a fresh recipient each time.
//
// Source rows (collections, payouts, subscription_payments) are marked swept_at optimistically,
// before the Lenco call, so a second sweep run started while this one is still "processing" never
// double-counts the same fee. If the Lenco call fails outright (rejected before even being
// accepted), that mark is rolled back immediately. If it's accepted but Lenco later reports the
// transfer itself failed (via lenco-webhook), the webhook clears swept_at on the same rows so the
// next sweep picks them back up, this file doesn't need to know anything about that path.
//
// Deploy:  supabase functions deploy sweep-company-revenue
// Invoke:  POST with header x-cron-secret: <CRON_SECRET> (weekly, see the cron schedule this ships
//          with), or manually the same way for an on-demand sweep.
// Response: { ok: true, swept: number, sweepId?: string } or { ok: true, swept: 0 } when there was
//           nothing to move, or { error: string } on failure.

import { createClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) {
    return new Response(JSON.stringify({ error: "LENCO_SECRET_KEY is not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const supabase: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // --- 1. Find every unswept source of IPM's own revenue -----------------------------------
  const [{ data: collectionRows }, { data: payoutRows }, { data: subPaymentRows }] = await Promise.all([
    supabase.from("collections").select("id, fee_amount").eq("status", "successful").is("swept_at", null).gt("fee_amount", 0),
    supabase.from("payouts").select("id, fee_amount").eq("status", "successful").is("swept_at", null).gt("fee_amount", 0),
    supabase.from("subscription_payments").select("id, amount").eq("status", "successful").is("swept_at", null),
  ]);

  const collectionIds = (collectionRows ?? []).map((r: { id: string }) => r.id);
  const payoutIds = (payoutRows ?? []).map((r: { id: string }) => r.id);
  const subscriptionPaymentIds = (subPaymentRows ?? []).map((r: { id: string }) => r.id);

  const collectionFeeTotal = (collectionRows ?? []).reduce((s: number, r: { fee_amount: number }) => s + Number(r.fee_amount ?? 0), 0);
  const payoutFeeTotal = (payoutRows ?? []).reduce((s: number, r: { fee_amount: number }) => s + Number(r.fee_amount ?? 0), 0);
  const subscriptionTotal = (subPaymentRows ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount ?? 0), 0);
  const total = Math.round((collectionFeeTotal + payoutFeeTotal + subscriptionTotal) * 100) / 100;

  if (total <= 0) {
    return new Response(JSON.stringify({ ok: true, swept: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  // --- 2. Resolve (or create, the first time) the company's own Lenco transfer-recipient ----
  const { data: existingRecipient } = await supabase.from("company_payout_recipient").select("lenco_recipient_id").eq("id", true).maybeSingle();

  let transferRecipientId: string | null = existingRecipient?.lenco_recipient_id ?? null;

  if (!transferRecipientId) {
    const bankName = Deno.env.get("COMPANY_BANK_NAME");
    const accountNumber = Deno.env.get("COMPANY_BANK_ACCOUNT_NUMBER");
    const accountName = Deno.env.get("COMPANY_BANK_ACCOUNT_NAME");
    if (!bankName || !accountNumber || !accountName) {
      return new Response(
        JSON.stringify({ error: "COMPANY_BANK_NAME, COMPANY_BANK_ACCOUNT_NUMBER and COMPANY_BANK_ACCOUNT_NAME must all be set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: bank } = await supabase.from("banks").select("code").ilike("name", bankName).maybeSingle();
    if (!bank?.code) {
      return new Response(JSON.stringify({ error: `No bank matching "${bankName}" found in the banks table` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const recipientRes = await fetch("https://api.lenco.co/access/v2/transfer-recipients/bank-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${lencoSecretKey}`, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ accountNumber, bankId: bank.code, country: "zm" }),
      });
      const recipientJson = await recipientRes.json();
      transferRecipientId = recipientJson.data?.id ?? null;
      if (!recipientRes.ok || !transferRecipientId) {
        return new Response(JSON.stringify({ error: recipientJson.message ?? "Lenco rejected the company recipient request", detail: recipientJson }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      await supabase.from("company_payout_recipient").insert({
        id: true,
        lenco_recipient_id: transferRecipientId,
        bank_code: bank.code,
        account_number: accountNumber,
        account_name: accountName,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Failed to reach Lenco while creating the company recipient", detail: String(err) }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // --- 3. Claim the source rows up front (see the top-of-file note on why this comes before
  // the Lenco call, not after) and record the sweep attempt. -------------------------------
  const sweptAt = new Date().toISOString();
  await Promise.all([
    collectionIds.length > 0 ? supabase.from("collections").update({ swept_at: sweptAt }).in("id", collectionIds) : null,
    payoutIds.length > 0 ? supabase.from("payouts").update({ swept_at: sweptAt }).in("id", payoutIds) : null,
    subscriptionPaymentIds.length > 0 ? supabase.from("subscription_payments").update({ swept_at: sweptAt }).in("id", subscriptionPaymentIds) : null,
  ]);

  const { data: sweepRow, error: sweepInsertError } = await supabase
    .from("company_revenue_sweeps")
    .insert({
      amount: total,
      status: "processing",
      collection_ids: collectionIds,
      payout_ids: payoutIds,
      subscription_payment_ids: subscriptionPaymentIds,
    })
    .select("id")
    .single();

  if (sweepInsertError || !sweepRow) {
    // Roll back the claim, nothing was actually sent to Lenco yet.
    await Promise.all([
      collectionIds.length > 0 ? supabase.from("collections").update({ swept_at: null }).in("id", collectionIds) : null,
      payoutIds.length > 0 ? supabase.from("payouts").update({ swept_at: null }).in("id", payoutIds) : null,
      subscriptionPaymentIds.length > 0 ? supabase.from("subscription_payments").update({ swept_at: null }).in("id", subscriptionPaymentIds) : null,
    ]);
    console.error("[sweep-company-revenue] failed to record sweep row", sweepInsertError);
    return new Response(JSON.stringify({ error: "Couldn't record the sweep, nothing was moved." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  // --- 4. Actually move the money ------------------------------------------------------------
  async function rollback(failureReason: string) {
    await Promise.all([
      collectionIds.length > 0 ? supabase.from("collections").update({ swept_at: null }).in("id", collectionIds) : null,
      payoutIds.length > 0 ? supabase.from("payouts").update({ swept_at: null }).in("id", payoutIds) : null,
      subscriptionPaymentIds.length > 0 ? supabase.from("subscription_payments").update({ swept_at: null }).in("id", subscriptionPaymentIds) : null,
    ]);
    await supabase.from("company_revenue_sweeps").update({ status: "failed", failure_reason: failureReason, updated_at: new Date().toISOString() }).eq("id", sweepRow.id);
  }

  try {
    const accountsRes = await fetch("https://api.lenco.co/access/v2/accounts", {
      headers: { Authorization: `Bearer ${lencoSecretKey}`, accept: "application/json" },
    });
    const accountsJson = await accountsRes.json();
    const accountId: string | undefined = accountsJson.data?.[0]?.id;
    if (!accountsRes.ok || !accountId) {
      await rollback("Couldn't find a Lenco account to sweep from");
      return new Response(JSON.stringify({ error: "Couldn't find a Lenco account to sweep from", detail: accountsJson }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const transferRes = await fetch("https://api.lenco.co/access/v2/transfers/bank-account", {
      method: "POST",
      headers: { Authorization: `Bearer ${lencoSecretKey}`, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        accountId,
        amount: total,
        reference: sweepRow.id,
        narration: "IPM revenue sweep (collection fees, payout fees, subscriptions)",
        transferRecipientId,
        country: "zm",
      }),
    });
    const transferJson = await transferRes.json();

    if (!transferRes.ok && transferRes.status >= 500) {
      // Unknown outcome, leave the claim in place (status stays "processing"), the webhook or a
      // manual check resolves it from here, same as lenco-payout does for a landlord withdrawal.
      return new Response(JSON.stringify({ ok: true, sweepId: sweepRow.id, swept: total, status: "unknown" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!transferRes.ok) {
      await rollback(transferJson.message ?? "Lenco rejected the transfer");
      return new Response(JSON.stringify({ error: transferJson.message ?? "Lenco rejected the transfer request", detail: transferJson }), {
        status: transferRes.status === 400 ? 400 : 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lencoTransactionId: string | undefined = transferJson.data?.id;
    await supabase
      .from("company_revenue_sweeps")
      .update({ lenco_transaction_id: lencoTransactionId ?? null, updated_at: new Date().toISOString() })
      .eq("id", sweepRow.id);

    return new Response(JSON.stringify({ ok: true, sweepId: sweepRow.id, swept: total }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    // Timeout / network error: the transfer may have gone through. Never roll back here, same
    // reasoning lenco-payout uses, leave it "processing" for the webhook to resolve.
    console.error("[sweep-company-revenue] unknown outcome reaching Lenco", String(err));
    return new Response(JSON.stringify({ ok: true, sweepId: sweepRow.id, swept: total, status: "unknown" }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
});
