// Receiving end of the Postgres trigger fired by notify_instant_sms_categories() (see
// 20260926000000_notification_digests.sql) — currently only for maintenance-report notifications.
// Payment notifications never reach this function; they're handled exclusively by the digest job.
//
// A Postgres trigger firing pg_net can't "delay itself", so quiet hours are enforced here: if it's
// outside the configured send window, this writes to pending_instant_sms instead of sending, and
// send-notification-digests sweeps that table on every hourly run.
//
// Deploy:  supabase functions deploy send-instant-notification-sms
// Invoke:  POST with header x-cron-secret: <CRON_SECRET>, body { notificationId }
// (invoked by the DB trigger, not directly by the frontend)

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendSms } from "../_shared/sms.ts";
import { isWithinSendWindow } from "../_shared/quietHours.ts";
import { withinDailySmsCap } from "../_shared/smsCap.ts";

const CATEGORY_TO_PREF: Record<string, string> = {
  maintenance: "newMaintenanceReport",
};

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { notificationId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const notificationId = body.notificationId;
  if (!notificationId) {
    return new Response(JSON.stringify({ error: "notificationId is required" }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: notification } = await supabase.from("notifications").select("id, property_id, category, title, body").eq("id", notificationId).maybeSingle();
  if (!notification) {
    return new Response(JSON.stringify({ error: "Notification not found" }), { status: 404 });
  }

  const { data: settings } = await supabase
    .from("settings")
    .select("notification_phone, sms_notification_prefs")
    .eq("property_id", notification.property_id)
    .maybeSingle();

  if (!settings?.notification_phone) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_alert_phone" }), { status: 200 });
  }

  const prefKey = CATEGORY_TO_PREF[notification.category];
  const smsPrefs = (settings.sms_notification_prefs ?? {}) as Record<string, boolean>;
  if (prefKey && smsPrefs[prefKey] === false) {
    return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), { status: 200 });
  }

  if (!isWithinSendWindow()) {
    await supabase.from("pending_instant_sms").insert({
      property_id: notification.property_id,
      notification_id: notification.id,
      payload: { title: notification.title, body: notification.body },
    });
    return new Response(JSON.stringify({ ok: true, deferred: "outside_send_window" }), { status: 200 });
  }

  const message = `${notification.title}: ${notification.body}`;

  if (!(await withinDailySmsCap(supabase, notification.property_id))) {
    await supabase.from("sms_send_log").insert({
      property_id: notification.property_id,
      recipient_phone: settings.notification_phone,
      category: notification.category,
      status: "skipped_cap",
      message,
    });
    return new Response(JSON.stringify({ ok: true, skipped: "daily_cap" }), { status: 200 });
  }

  const result = await sendSms(settings.notification_phone, message);

  await supabase.from("sms_send_log").insert({
    property_id: notification.property_id,
    recipient_phone: settings.notification_phone,
    category: notification.category,
    status: result.ok ? "sent" : "failed",
    message,
  });

  return new Response(JSON.stringify({ ok: result.ok }), { status: 200 });
});
