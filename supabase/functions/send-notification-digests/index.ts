// Phase 5, the hourly job with three jobs bundled into it:
//
// 1. Payment digesting (the whole point of `payment_sms_mode` in Settings): never sends per
//    payment, only ever a batched summary (hourly, daily or weekly), and only when there's
//    actually new activity since the last digest. Uses notification_digest_state as a watermark
//    per (property, digest_type) so each cadence tracks its own "already included up to here"
//    pointer against the same `notifications` rows (which the trigger still writes one per
//    payment, just hidden from the in-app feed via visible_in_feed=false, this job is their only
//    consumer). This now also writes the ONE visible in-app notification for the period, so the
//    bell shows "3 payments received this week" instead of 3 separate cards.
// 2. 75%/100%-of-rent-paid milestone notifications, once per billing period, for properties that
//    aren't on Autopilot (Autopilot already sends an equivalent "collection complete" notification
//    at 100% from autopilot-collections, so this would double up there).
// 3. Sweeping pending_instant_sms, anything the instant-alert path deferred because it landed
//    outside the send window (see send-instant-notification-sms) goes out here, once this run
//    lands inside the window.
//
// Deploy:  supabase functions deploy send-notification-digests
// Invoke:  POST with header x-cron-secret: <CRON_SECRET> (scheduled hourly, see
//          20260926000000_notification_digests.sql)

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendSms } from "../_shared/sms.ts";
import { isWithinSendWindow } from "../_shared/quietHours.ts";
import { withinDailySmsCap } from "../_shared/smsCap.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const APP_URL = Deno.env.get("APP_URL") ?? "https://portal.instayhomes.com";

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

function lusakaParts(): { hour: number; weekday: number } {
  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { timeZone: "Africa/Lusaka", hour: "numeric", hour12: false }));
  // "en-US" weekday short name mapped to 0=Sun..6=Sat, matched against JS's own getDay() numbering.
  const weekdayName = now.toLocaleString("en-US", { timeZone: "Africa/Lusaka", weekday: "short" });
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  return { hour, weekday };
}

const DAILY_DIGEST_HOUR = 18; // 18:00 Africa/Lusaka
const WEEKLY_DIGEST_WEEKDAY = 1; // Monday
const WEEKLY_DIGEST_HOUR = 18;

/** A tenant whose move-in date is still in the future owes nothing that is due yet. */
function hasMovedIn(moveIn: string | null | undefined): boolean {
  if (!moveIn) return true;
  const d = new Date(moveIn);
  if (Number.isNaN(d.getTime())) return true;
  const now = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()) <= new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function currentPeriodLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const deferredSent = await sweepPendingInstantSms(supabase);

  const { hour: lusakaHour, weekday: lusakaWeekday } = lusakaParts();
  const isDailyWindow = lusakaHour === DAILY_DIGEST_HOUR;
  const isWeeklyWindow = lusakaWeekday === WEEKLY_DIGEST_WEEKDAY && lusakaHour === WEEKLY_DIGEST_HOUR;

  const results: Record<string, unknown>[] = [];

  // --- 1. Payment digests (hourly / daily / weekly) --------------------------------------------
  const { data: settingsRows, error: settingsError } = await supabase
    .from("settings")
    .select("property_id, payment_sms_mode, notification_phone, autopilot_enabled")
    .neq("payment_sms_mode", "off");
  if (settingsError) {
    return new Response(JSON.stringify({ error: "Failed to load settings", detail: settingsError.message }), { status: 500 });
  }

  for (const settings of settingsRows ?? []) {
    const digestType =
      settings.payment_sms_mode === "hourly_digest" ? "payment_hourly" : settings.payment_sms_mode === "weekly_digest" ? "payment_weekly" : "payment_daily";
    // Daily/weekly digests only actually evaluate during their one designated window, every
    // other run this property is simply skipped, leaving its watermark untouched so the next
    // real window picks up everything that accumulated since the previous digest.
    if (digestType === "payment_daily" && !isDailyWindow) continue;
    if (digestType === "payment_weekly" && !isWeeklyWindow) continue;

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

    if (!newPayments || newPayments.length === 0) continue; // no new activity, never send "nothing happened"

    const total = newPayments.reduce((sum: number, n: { metadata: { amount?: number } }) => sum + Number(n.metadata?.amount ?? 0), 0);
    const latestCreatedAt = newPayments[newPayments.length - 1].created_at;

    const { data: owingTenants } = await supabase
      .from("tenants")
      .select("id, move_in_date")
      .eq("property_id", settings.property_id)
      .eq("active", true)
      .gt("owed_amount", 0);
    // Tenants who have not moved in yet are not "outstanding".
    const outstandingCount = (owingTenants ?? []).filter((t: { move_in_date: string | null }) => hasMovedIn(t.move_in_date)).length;

    const paymentWord = newPayments.length === 1 ? "payment" : "payments";
    const periodWord = digestType === "payment_daily" ? "Today's collections" : digestType === "payment_weekly" ? "This week's collections" : "Collections update";
    const countWord = digestType === "payment_daily" || digestType === "payment_weekly" ? `${newPayments.length} ${paymentWord}` : `${newPayments.length} new ${paymentWord}`;
    const message = `${periodWord}: ${countWord} · K${total.toLocaleString()} collected. ${outstandingCount ?? 0} tenants outstanding.`;

    let sent = false;
    if (settings.notification_phone && (await withinDailySmsCap(supabase, settings.property_id))) {
      const result = await sendSms(settings.notification_phone, message);
      await supabase.from("sms_send_log").insert({ property_id: settings.property_id, recipient_phone: settings.notification_phone, category: "payment_digest", status: result.ok ? "sent" : "failed", message });
      sent = result.ok;
    }

    // The one VISIBLE in-app notification for this period, this is what shows in the bell/panel
    // instead of the hidden per-payment rows the trigger wrote.
    const spanWord = digestType === "payment_weekly" ? "this week" : digestType === "payment_daily" ? "today" : "recently";
    await supabase.from("notifications").insert({
      property_id: settings.property_id,
      category: "payment",
      type: "paymentDigest",
      title: `${newPayments.length} ${paymentWord} received`,
      body: `K${total.toLocaleString()} collected ${spanWord}. ${outstandingCount ?? 0} tenant${outstandingCount === 1 ? "" : "s"} still outstanding. Open Online Payments to see who paid.`,
      metadata: { count: newPayments.length, total, outstanding: outstandingCount, digest_type: digestType },
      visible_in_feed: true,
    });

    // Watermark advances regardless of whether the SMS itself went out (no phone configured, cap
    // hit, provider failure), this batch of notifications has been accounted for either way, a
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

  // --- 2. 75% / 100% paid milestones (non-Autopilot properties, checked once a day) ------------
  if (isDailyWindow) {
    const { data: allProperties } = await supabase
      .from("settings")
      .select("property_id, autopilot_enabled, notification_phone")
      .eq("autopilot_enabled", false);

    const period = currentPeriodLabel();

    for (const property of allProperties ?? []) {
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, move_in_date, owed_amount")
        .eq("property_id", property.property_id)
        .eq("active", true);

      const counted = (tenants ?? []).filter((t: { move_in_date: string | null }) => hasMovedIn(t.move_in_date));
      if (counted.length === 0) continue;

      const paidCount = counted.filter((t: { owed_amount: number | null }) => Number(t.owed_amount ?? 0) <= 0).length;
      const pct = Math.round((paidCount / counted.length) * 100);

      for (const milestone of [75, 100] as const) {
        if (pct < milestone) continue;
        const type = milestone === 100 ? "milestone100Paid" : "milestone75Paid";
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("property_id", property.property_id)
          .eq("type", type)
          .contains("metadata", { period })
          .limit(1);
        if (existing && existing.length > 0) continue;

        const title = milestone === 100 ? "All tenants paid this month" : "75% of tenants have paid";
        const body =
          milestone === 100
            ? `Every tenant has settled up for ${period}. Nice work.`
            : `${paidCount} of ${counted.length} tenants (${pct}%) have paid so far this month. Open Rent to see who's left.`;
        await supabase.from("notifications").insert({
          property_id: property.property_id,
          category: "system",
          type,
          title,
          body,
          metadata: { period, paid: paidCount, total: counted.length, pct },
          visible_in_feed: true,
        });
        results.push({ propertyId: property.property_id, milestone, pct, period });

        // At 100%, also auto-build the month's income vs expenses report and text a direct,
        // no-login link to it, so the landlord can see the numbers without opening the dashboard.
        if (milestone === 100) {
          try {
            const reportRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-auto-report`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
              body: JSON.stringify({ property_id: property.property_id }),
            });
            const reportJson = await reportRes.json();
            if (reportRes.ok && reportJson?.token && property.notification_phone) {
              const link = `${APP_URL}/report/${reportJson.token}`;
              const smsMessage = `All tenants paid for ${period}! Your income vs expenses report is ready, no login needed: ${link}`;
              if (await withinDailySmsCap(supabase, property.property_id)) {
                const sendResult = await sendSms(property.notification_phone, smsMessage);
                await supabase.from("sms_send_log").insert({
                  property_id: property.property_id,
                  recipient_phone: property.notification_phone,
                  category: "auto_report",
                  status: sendResult.ok ? "sent" : "failed",
                  message: smsMessage,
                });
              }
            } else if (!reportRes.ok) {
              console.error("[send-notification-digests] generate-auto-report failed", property.property_id, reportJson);
            }
          } catch (e) {
            console.error("[send-notification-digests] auto report failed", property.property_id, String(e));
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ deferredSent, results }), { headers: { "Content-Type": "application/json" } });
});
