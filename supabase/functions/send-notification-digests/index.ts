import { createClient } from "npm:@supabase/supabase-js@2";
import { sendSms } from "../_shared/sms.ts";
import { isWithinSendWindow } from "../_shared/quietHours.ts";
import { withinDailySmsCap } from "../_shared/smsCap.ts";
import { opsRecipients, filterByPref } from "../_shared/recipients.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const APP_URL = Deno.env.get("APP_URL") ?? "https://portal.instayhomes.com";

// Sentinel used in notification_digest_state.team_member_id to mean "the property owner" — a fixed
// nil uuid rather than NULL, because NULL can't be used as an ON CONFLICT target (Postgres allows
// many NULLs in a unique column, so upserts against it would never find the existing row).
const OWNER_SENTINEL = "00000000-0000-0000-0000-000000000000";

type DigestType = "payment_hourly" | "payment_daily" | "payment_weekly";

function digestTypeForMode(mode: string | null | undefined): DigestType {
  return mode === "hourly_digest" ? "payment_hourly" : mode === "weekly_digest" ? "payment_weekly" : "payment_daily";
}

// Sends texts that were held back outside the send window. Routed the same way as the instant function:
// people with alerts.operations first, the owner as fallback (or as a copy when the owner asked for one) —
// and gated the same way too: a recipient whose own sms_notification_prefs turned this category off is skipped.
async function sweepPendingInstantSms(supabase: SupabaseClient): Promise<number> {
  if (!isWithinSendWindow()) return 0;

  const { data: pending } = await supabase.from("pending_instant_sms").select("id, property_id, payload");
  if (!pending || pending.length === 0) return 0;

  let sent = 0;
  for (const row of pending) {
    const payload = row.payload as { title?: string; body?: string; category?: string };
    const message = `${payload.title ?? "Update"}: ${payload.body ?? ""}`;
    const recipients = filterByPref(await opsRecipients(supabase, row.property_id), payload.category ?? "");
    for (const r of recipients) {
      let status = "skipped_cap";
      if (await withinDailySmsCap(supabase, row.property_id)) {
        const result = await sendSms(r.phone, message);
        status = result.ok ? "sent" : "failed";
        if (result.ok) sent += 1;
      }
      await supabase.from("sms_send_log").insert({ property_id: row.property_id, recipient_phone: r.phone, category: "deferred_instant", status, message, recipient_role: r.role });
    }
    await supabase.from("pending_instant_sms").delete().eq("id", row.id);
  }
  return sent;
}

function lusakaParts(): { hour: number; weekday: number } {
  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { timeZone: "Africa/Lusaka", hour: "numeric", hour12: false }));
  const weekdayName = now.toLocaleString("en-US", { timeZone: "Africa/Lusaka", weekday: "short" });
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  return { hour, weekday };
}

const DAILY_DIGEST_HOUR = 18;
const WEEKLY_DIGEST_WEEKDAY = 1;
const WEEKLY_DIGEST_HOUR = 18;

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

/**
 * Builds and sends one payment digest for one recipient (the owner, or a team member who holds
 * alerts.operations), tracking its own watermark in notification_digest_state keyed by
 * (property_id, digestType, recipientId). `recipientId` is OWNER_SENTINEL for the owner or a
 * team_members.id for a manager — this is what lets an owner on "daily" and a manager on "hourly"
 * each get correctly-paced digests from the same hourly cron run, without colliding on state.
 *
 * The feed notification (visible in the in-app notification list) is inserted at most once per
 * property per run — tied to the owner's pass — so adding manager recipients never duplicates it.
 */
async function processPaymentDigest(
  supabase: SupabaseClient,
  propertyId: string,
  digestType: DigestType,
  phone: string | null | undefined,
  recipientId: string,
  recipientRole: "owner" | "manager",
  insertFeedNotification: boolean,
): Promise<Record<string, unknown> | null> {
  const { data: state } = await supabase
    .from("notification_digest_state")
    .select("id, last_processed_at, last_sent_at")
    .eq("property_id", propertyId)
    .eq("digest_type", digestType)
    .eq("team_member_id", recipientId)
    .maybeSingle();

  const watermark = state?.last_processed_at ?? "1970-01-01T00:00:00Z";

  const { data: newPayments } = await supabase
    .from("notifications")
    .select("id, created_at, metadata")
    .eq("property_id", propertyId)
    .eq("category", "payment")
    .gt("created_at", watermark)
    .order("created_at", { ascending: true });

  if (!newPayments || newPayments.length === 0) return null;

  const total = newPayments.reduce((sum: number, n: { metadata: { amount?: number } }) => sum + Number(n.metadata?.amount ?? 0), 0);
  const latestCreatedAt = newPayments[newPayments.length - 1].created_at;

  const { data: owingTenants } = await supabase
    .from("tenants")
    .select("id, move_in_date")
    .eq("property_id", propertyId)
    .eq("active", true)
    .gt("owed_amount", 0);
  const outstandingCount = (owingTenants ?? []).filter((t: { move_in_date: string | null }) => hasMovedIn(t.move_in_date)).length;

  const paymentWord = newPayments.length === 1 ? "payment" : "payments";
  const periodWord = digestType === "payment_daily" ? "Today's collections" : digestType === "payment_weekly" ? "This week's collections" : "Collections update";
  const countWord = digestType === "payment_daily" || digestType === "payment_weekly" ? `${newPayments.length} ${paymentWord}` : `${newPayments.length} new ${paymentWord}`;
  const message = `${periodWord}: ${countWord} · K${total.toLocaleString()} collected. ${outstandingCount ?? 0} tenants outstanding.`;

  let sent = false;
  const trimmedPhone = String(phone ?? "").trim();
  if (trimmedPhone && (await withinDailySmsCap(supabase, propertyId))) {
    const result = await sendSms(trimmedPhone, message);
    await supabase.from("sms_send_log").insert({ property_id: propertyId, recipient_phone: trimmedPhone, category: "payment_digest", status: result.ok ? "sent" : "failed", message, recipient_role: recipientRole });
    sent = result.ok;
  }

  if (insertFeedNotification) {
    const spanWord = digestType === "payment_weekly" ? "this week" : digestType === "payment_daily" ? "today" : "recently";
    await supabase.from("notifications").insert({
      property_id: propertyId,
      category: "payment",
      type: "paymentDigest",
      title: `${newPayments.length} ${paymentWord} received`,
      body: `K${total.toLocaleString()} collected ${spanWord}. ${outstandingCount ?? 0} tenant${outstandingCount === 1 ? "" : "s"} still outstanding. Open Online Payments to see who paid.`,
      metadata: { count: newPayments.length, total, outstanding: outstandingCount, digest_type: digestType },
      visible_in_feed: true,
    });
  }

  await supabase.from("notification_digest_state").upsert(
    {
      property_id: propertyId,
      digest_type: digestType,
      team_member_id: recipientId,
      last_processed_at: latestCreatedAt,
      last_sent_at: sent ? new Date().toISOString() : state?.last_sent_at ?? null,
    },
    { onConflict: "property_id,digest_type,team_member_id" },
  );

  return { propertyId, digestType, recipientRole, recipientId: recipientId === OWNER_SENTINEL ? undefined : recipientId, count: newPayments.length, total, sent };
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

  // Owner digests — one per property, cadence from settings.payment_sms_mode.
  const { data: settingsRows, error: settingsError } = await supabase
    .from("settings")
    .select("property_id, payment_sms_mode, notification_phone, autopilot_enabled, report_weekly_enabled")
    .neq("payment_sms_mode", "off");
  if (settingsError) {
    return new Response(JSON.stringify({ error: "Failed to load settings", detail: settingsError.message }), { status: 500 });
  }

  for (const settings of settingsRows ?? []) {
    const digestType = digestTypeForMode(settings.payment_sms_mode);
    if (digestType === "payment_daily" && !isDailyWindow) continue;
    if (digestType === "payment_weekly" && !isWeeklyWindow) continue;
    // The Monday weekly report replaces the weekly payment digest, so the owner is not texted twice.
    if (digestType === "payment_weekly" && settings.report_weekly_enabled) continue;

    try {
      const result = await processPaymentDigest(supabase, settings.property_id, digestType, settings.notification_phone, OWNER_SENTINEL, "owner", true);
      if (result) results.push(result);
    } catch (e) {
      console.error("[send-notification-digests] owner digest failed", settings.property_id, String(e));
    }
  }

  // Manager digests — one per qualifying team member, cadence from THEIR OWN payment_sms_mode
  // (seeded as a one-time copy of the owner's at invite time, then independently editable). No
  // "weekly report replaces it" exception here: the weekly property report only ever goes to the
  // owner, so a manager's own weekly payment digest is the only thing they'd otherwise get.
  const { data: memberRows, error: membersError } = await supabase
    .from("team_members")
    .select("id, property_id, notification_phone, payment_sms_mode, permissions")
    .eq("status", "active")
    .not("notification_phone", "is", null)
    .not("payment_sms_mode", "is", null)
    .neq("payment_sms_mode", "off");
  if (membersError) {
    console.error("[send-notification-digests] failed to load team members", membersError.message);
  }

  for (const member of memberRows ?? []) {
    const perms: string[] = member.permissions ?? [];
    const phone = String(member.notification_phone ?? "").trim();
    if (!phone || !perms.includes("alerts.operations")) continue;

    const digestType = digestTypeForMode(member.payment_sms_mode);
    if (digestType === "payment_daily" && !isDailyWindow) continue;
    if (digestType === "payment_weekly" && !isWeeklyWindow) continue;

    try {
      const result = await processPaymentDigest(supabase, member.property_id, digestType, phone, member.id, "manager", false);
      if (result) results.push(result);
    } catch (e) {
      console.error("[send-notification-digests] member digest failed", member.id, String(e));
    }
  }

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
