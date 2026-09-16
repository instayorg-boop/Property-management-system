// Phase 5 — the hourly job with two jobs bundled into it:
//
// 1. Payment SMS digesting (the whole point of `payment_sms_mode` in Settings): never sends per
//    payment, only ever a batched summary, and only when there's actually new activity since the
//    last digest. Uses notification_digest_state as a watermark per (property, digest_type) so the
//    hourly and daily streams each track their own "already included up to here" pointer against
//    the same `notifications` rows — without this, the daily digest could re-describe payments the
//    hourly digest already reported as "new".
// 2. Sweeping pending_instant_sms — anything the instant-alert path deferred because it landed
//    outside the send window (see send-instant-notification-sms) goes out here, once this run
//    lands inside the window.
//
// Deploy:  supabase functions deploy send-notification-digests
// Invoke:  POST with header x-cron-secret: <CRON_SECRET> (scheduled hourly — see
//          20260926000000_notification_digests.sql)

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendSms } from "../_shared/sms.ts";
import { isWithinSendWindow } from "../_shared/quietHours.ts";
import { withinDailySmsCap } from "../_shared/smsCap.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

async function sweepPendingInstantSms(supabase: SupabaseClient): Promise<number> {
  if (!isWithinSendWindow()) return 0;

  const { data: pending } = await supabase.from("pending_instant_sms").select("id, property_id, payload");
  if (!pending || pending.length === 0) return 0;

  let sent = 0;
  for (const row of pending) {
    const { data: settings } = await supabase.from("settings").select("notification_phone").eq("property_id", row.property_id).maybeSingle();
    const phone = settings?.notification_phone;
    const payload = row.payload as { title?: string; body?: string };
    const message = `${payload.title ?? "Update"}: ${payload.body ?? ""}`;
    if (phone && (await withinDailySmsCap(supabase, row.property_id))) {
      const result = await sendSms(phone, message);
      await supabase.from("sms_send_log").insert({ property_id: row.property_id, recipient_phone: phone, category: "deferred_instant", status: result.ok ? "sent" : "failed", message });
      if (result.ok) sent += 1;
    }
    // Deferred alerts are best-effort: they've already waited for a whole quiet-hours window once,
    // so this always clears the row rather than re-queuing indefinitely on a missing phone/cap hit.
    await supabase.from("pending_instant_sms").delete().eq("id", row.id);
  }
  return sent;
}

function currentLusakaHour(): number {
  return Number(new Date().toLocaleString("en-US", { timeZone: "Africa/Lusaka", hour: "numeric", hour12: false }));
}

const DAILY_DIGEST_HOUR = 18; // 18:00 Africa/Lusaka

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const deferredSent = await sweepPendingInstantSms(supabase);

  const { data: settingsRows, error: settingsError } = await supabase
    .from("settings")
    .select("property_id, payment_sms_mode, notification_phone")
    .neq("payment_sms_mode", "off");
  if (settingsError) {
    return new Response(JSON.stringify({ error: "Failed to load settings", detail: settingsError.message }), { status: 500 });
  }

  const isDailyWindow = currentLusakaHour() === DAILY_DIGEST_HOUR;
  const results: Record<string, unknown>[] = [];

  for (const settings of settingsRows ?? []) {
    const digestType = settings.payment_sms_mode === "hourly_digest" ? "payment_hourly" : "payment_daily";
    // Daily digest only actually evaluates during its one designated hour — every other run this
    // property is simply skipped, leaving its watermark untouched so the 18:00 run picks up
    // everything that accumulated since the previous day's digest.
    if (digestType === "payment_daily" && !isDailyWindow) continue;

    const { data: state } = await supabase
      .from("notification_digest_state")
      .select("id, last_processed_at, last_sent_at")
      .eq("property_id", settings.property_id)
      .eq("digest_type", digestType)
      .maybeSingle();

    const watermark = state?.last_processed_at ?? "1970-01-01T00:00:00Z";

    const { data: newPayments } = await supabase
      .from("notifications")
      .select("id, created_at, metadata")
      .eq("property_id", settings.property_id)
      .eq("category", "payment")
      .gt("created_at", watermark)
      .order("created_at", { ascending: true });

    if (!newPayments || newPayments.length === 0) continue; // no new activity — never send "nothing happened"

    const total = newPayments.reduce((sum: number, n: { metadata: { amount?: number } }) => sum + Number(n.metadata?.amount ?? 0), 0);
    const latestCreatedAt = newPayments[newPayments.length - 1].created_at;

    const { count: outstandingCount } = await supabase
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("property_id", settings.property_id)
      .eq("active", true)
      .gt("owed_amount", 0);

    const paymentWord = newPayments.length === 1 ? "payment" : "payments";
    const periodWord = digestType === "payment_daily" ? "Today's collections" : "Collections update";
    const countWord = digestType === "payment_daily" ? `${newPayments.length} ${paymentWord}` : `${newPayments.length} new ${paymentWord}`;
    const message = `${periodWord}: ${countWord} · K${total.toLocaleString()} collected. ${outstandingCount ?? 0} tenants outstanding.`;

    let sent = false;
    if (settings.notification_phone && (await withinDailySmsCap(supabase, settings.property_id))) {
      const result = await sendSms(settings.notification_phone, message);
      await supabase.from("sms_send_log").insert({ property_id: settings.property_id, recipient_phone: settings.notification_phone, category: "payment_digest", status: result.ok ? "sent" : "failed", message });
      sent = result.ok;
    }

    // Watermark advances regardless of whether the SMS itself went out (no phone configured, cap
    // hit, provider failure) — this batch of notifications has been accounted for either way; a
    // permanently-failing send shouldn't cause the digest to balloon forever instead of just being
    // silently missed for that one run.
    await supabase.from("notification_digest_state").upsert(
      {
        property_id: settings.property_id,
        digest_type: digestType,
        last_processed_at: latestCreatedAt,
        last_sent_at: sent ? new Date().toISOString() : state?.last_sent_at ?? null,
      },
      { onConflict: "property_id,digest_type" }
    );

    results.push({ propertyId: settings.property_id, digestType, count: newPayments.length, total, sent });
  }

  return new Response(JSON.stringify({ deferredSent, results }), { headers: { "Content-Type": "application/json" } });
});
