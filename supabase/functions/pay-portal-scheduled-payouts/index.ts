// Runs once a day via pg_cron. For every property whose settings.payout_day matches today's
// weekday, claims whatever rent has been collected since its last payout and sends it out — no
// landlord present, no OTP, so this is deliberately NOT the same authorization path as
// lenco-payout (which requires a human confirming a withdrawal code). Authorization here is a
// shared secret only pg_cron/pg_net knows, checked against CRON_SECRET below.
//
// Fee model: real tiered Lenco fee only (see FEE_TIERS), NO on-demand markup — that markup exists
// specifically to price the convenience of skipping this schedule, so it must never apply here.
//
// Claiming: pay_portal_claim_payout_collections (see migration payout_claim_tracking) atomically
// marks unclaimed successful collections with this payout's id and returns their summed rent
// portion, using `for update skip locked` so a concurrent on-demand request against the same
// property can never double-claim or get double-paid the same money. This replaces an earlier,
// buggier version of this function that summed collections by timestamp cutoff — that approach
// could permanently miss a collection whose webhook confirmation arrived late, and had no
// protection against two overlapping runs paying out the same money twice.
//
// Deploy:  supabase functions deploy pay-portal-scheduled-payouts
// Trigger: pg_cron -> pg_net.http_post, see the accompanying migration for the schedule itself.

import { createClient } from "npm:@supabase/supabase-js@2";

const FEE_TIERS: { upTo: number; fee: number }[] = [
  { upTo: 150, fee: 8.5 },
  { upTo: 300, fee: 10 },
  { upTo: 500, fee: 11 },
  { upTo: 1_000, fee: 12 },
  { upTo: 3_000, fee: 15 },
  { upTo: 5_000, fee: 18 },
  { upTo: 10_000, fee: 20 },
  { upTo: 50_000, fee: 25 },
  { upTo: 100_000_000, fee: 35 },
];

function lencoTransferFee(amount: number): number {
  const tier = FEE_TIERS.find((t) => amount <= t.upTo);
  return tier ? tier.fee : FEE_TIERS[FEE_TIERS.length - 1].fee;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function todayWeekday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "Africa/Lusaka" });
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) {
    return new Response(JSON.stringify({ error: "LENCO_SECRET_KEY is not configured" }), { status: 500 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = todayWeekday();

  const { data: dueSettings, error: settingsError } = await supabase
    .from("settings")
    .select("property_id")
    .eq("payout_day", today);

  if (settingsError) {
    return new Response(JSON.stringify({ error: "Failed to look up properties due today", detail: settingsError.message }), { status: 500 });
  }

  const results: Record<string, unknown>[] = [];

  for (const row of dueSettings ?? []) {
    const propertyId = row.property_id as string;

    const { data: inFlight } = await supabase
      .from("payouts")
      .select("id")
      .eq("property_id", propertyId)
      .in("status", ["pending", "processing"])
      .limit(1)
      .maybeSingle();
    if (inFlight) {
      results.push({ propertyId, skipped: "a payout is already pending or processing for this property" });
      continue;
    }

    const { data: recipient } = await supabase
      .from("payout_recipients")
      .select("id, type, lenco_recipient_id, account_name, account_number, phone_number, provider")
      .eq("property_id", propertyId)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();

    if (!recipient) {
      results.push({ propertyId, skipped: "no default payout recipient set up" });
      continue;
    }

    const { data: payoutRow, error: insertError } = await supabase
      .from("payouts")
      .insert({
        property_id: propertyId,
        payout_recipient_id: recipient.id,
        amount: 0,
        status: "pending",
        narration: "Scheduled rent payout",
      })
      .select()
      .single();

    if (insertError || !payoutRow) {
      results.push({ propertyId, skipped: "failed to record payout", detail: insertError?.message });
      continue;
    }

    const { data: grossAmountRaw, error: claimError } = await supabase.rpc("pay_portal_claim_payout_collections", {
      p_property_id: propertyId,
      p_payout_id: payoutRow.id,
      p_max_amount: null,
    });

    if (claimError) {
      await supabase.from("payouts").update({ status: "failed", failure_reason: "Failed to claim collections" }).eq("id", payoutRow.id);
      results.push({ propertyId, payoutId: payoutRow.id, failed: "claim RPC error", detail: claimError.message });
      continue;
    }

    const grossAmount = round2(Number(grossAmountRaw ?? 0));
    if (grossAmount <= 0) {
      await supabase.from("payouts").delete().eq("id", payoutRow.id);
      results.push({ propertyId, skipped: "nothing collected since last payout" });
      continue;
    }

    const feeAmount = lencoTransferFee(grossAmount);
    const netAmount = round2(grossAmount - feeAmount);
    if (netAmount <= 0) {
      await supabase.rpc("pay_portal_release_payout_collections", { p_payout_id: payoutRow.id });
      await supabase.from("payouts").delete().eq("id", payoutRow.id);
      results.push({ propertyId, skipped: "amount too small to cover the transfer fee", grossAmount, feeAmount });
      continue;
    }

    const narration = `Scheduled rent payout — ${recipient.account_name ?? recipient.phone_number} (fee K${feeAmount.toFixed(2)})`;
    await supabase
      .from("payouts")
      .update({ amount: grossAmount, fee_amount: feeAmount, net_amount: netAmount, narration })
      .eq("id", payoutRow.id);

    try {
      const accountsResponse = await fetch("https://api.lenco.co/access/v2/accounts", {
        headers: { Authorization: `Bearer ${lencoSecretKey}`, accept: "application/json" },
      });
      const accountsJson = await accountsResponse.json();
      const accountId: string | undefined = accountsJson.data?.[0]?.id;
      if (!accountsResponse.ok || !accountId) {
        await supabase.from("payouts").update({ status: "failed", failure_reason: "Couldn't find a Lenco account to pay out from" }).eq("id", payoutRow.id);
        await supabase.rpc("pay_portal_release_payout_collections", { p_payout_id: payoutRow.id });
        results.push({ propertyId, payoutId: payoutRow.id, failed: "no Lenco account" });
        continue;
      }

      const isMobileMoney = recipient.type === "mobile-money";
      const lencoResponse = await fetch(
        `https://api.lenco.co/access/v2/transfers/${isMobileMoney ? "mobile-money" : "bank-account"}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${lencoSecretKey}`, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify(
            isMobileMoney
              ? {
                  accountId,
                  amount: netAmount,
                  reference: payoutRow.id,
                  narration,
                  phone: recipient.phone_number,
                  operator: recipient.provider,
                  country: "zm",
                }
              : {
                  accountId,
                  amount: netAmount,
                  reference: payoutRow.id,
                  narration,
                  transferRecipientId: recipient.lenco_recipient_id,
                  country: "zm",
                }
          ),
        }
      );
      const lencoJson = await lencoResponse.json();

      if (!lencoResponse.ok) {
        await supabase.from("payouts").update({ status: "failed", failure_reason: lencoJson.message ?? "Lenco rejected the transfer" }).eq("id", payoutRow.id);
        await supabase.rpc("pay_portal_release_payout_collections", { p_payout_id: payoutRow.id });
        results.push({ propertyId, payoutId: payoutRow.id, failed: lencoJson.message ?? "Lenco rejected the transfer" });
        continue;
      }

      const lencoTransactionId: string | undefined = lencoJson.data?.id;
      await supabase
        .from("payouts")
        .update({ status: "processing", lenco_transaction_id: lencoTransactionId ?? null })
        .eq("id", payoutRow.id);

      results.push({ propertyId, payoutId: payoutRow.id, grossAmount, feeAmount, netAmount, status: "processing" });
    } catch (err) {
      await supabase.from("payouts").update({ status: "failed", failure_reason: String(err) }).eq("id", payoutRow.id);
      await supabase.rpc("pay_portal_release_payout_collections", { p_payout_id: payoutRow.id });
      results.push({ propertyId, payoutId: payoutRow.id, failed: String(err) });
    }
  }

  return new Response(JSON.stringify({ ok: true, day: today, processed: results.length, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
