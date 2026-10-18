// Instant SMS for a notification row (currently maintenance). Routing: people holding alerts.operations who have a
// phone number get it; if nobody does, the owner's alert phone gets it (as before). The owner is also texted when
// settings.ops_sms_owner_copy is on. Quiet hours (08:00 to 19:00 Africa/Lusaka) and the daily cap are unchanged,
// except that an URGENT maintenance request is sent immediately at any hour.
//
// Each recipient's OWN sms_notification_prefs gates whether they personally get this category (see
// _shared/recipients.ts filterByPref) — a manager who turned off "new maintenance report" texts for themselves is
// skipped even while other qualifying recipients (another manager, or the owner) still get it.
//
// Maintenance SMS wording is built here from the maintenance_reports row (tenant, location, description, priority)
// instead of the plain notification title/body, so the text says what the issue is and how serious it is.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendSms } from "../_shared/sms.ts";
import { isWithinSendWindow } from "../_shared/quietHours.ts";
import { withinDailySmsCap } from "../_shared/smsCap.ts";
import { opsRecipients, filterByPref } from "../_shared/recipients.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://portal.instayhomes.com";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// deno-lint-ignore no-explicit-any
type Db = any;

/** Drops a title prefix so "Mr Marcus Chongwani" reads as "Marcus Chongwani". */
function cleanName(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && /^(mr|mrs|ms|dr)\.?$/i.test(parts[0])) parts.shift();
  return parts.join(" ") || "A tenant";
}

function shorten(text: string | null | undefined, max = 80): string {
  const flat = String(text ?? "").replace(/\s+/g, " ").replace(/"/g, "'").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 3).trimEnd()}...`;
}

/**
 * Builds the maintenance request SMS from the report row. Priority is set a few seconds after the report is created
 * by classify-maintenance-priority (which patches the row, bumping updated_at), so wait briefly for that before
 * reading it. If it never lands, the column default (medium) is used.
 */
async function buildMaintenanceSms(
  supabase: Db,
  notification: { title: string; body: string; metadata?: { maintenance_report_id?: string } | null },
): Promise<{ title: string; body: string; urgent: boolean } | null> {
  const reportId = notification.metadata?.maintenance_report_id;
  if (!reportId) return null;

  let report: { tenant: string | null; location: string | null; description: string | null; priority: string | null; created_at: string; updated_at: string } | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data } = await supabase
      .from("maintenance_reports")
      .select("tenant, location, description, priority, created_at, updated_at")
      .eq("id", reportId)
      .maybeSingle();
    report = data;
    if (!report) return null;
    if (report.updated_at !== report.created_at) break; // classification has been written
    await sleep(1500);
  }
  if (!report) return null;

  const name = cleanName(report.tenant);
  const where = report.location?.trim() ? ` (${report.location.trim()})` : "";
  const issue = shorten(report.description);
  const link = `${APP_URL}/maintenance`;
  const priority = (report.priority ?? "medium").toLowerCase();

  if (priority === "urgent") {
    const what = issue ? `reports "${issue}"` : "reported an issue";
    return { title: "URGENT maintenance request", body: `${name}${where} ${what}. Please act now. Details: ${link}`, urgent: true };
  }

  const what = issue ? `says "${issue}"` : "submitted a request";
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  return { title: "New maintenance request", body: `${name}${where} ${what}. Priority: ${label}. Review it here: ${link}`, urgent: false };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return reply({ error: "Unauthorized" }, 401);

  let body: { notificationId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid JSON body" }, 400);
  }
  const notificationId = body.notificationId;
  if (!notificationId) return reply({ error: "notificationId is required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: notification } = await supabase.from("notifications").select("id, property_id, category, title, body, metadata").eq("id", notificationId).maybeSingle();
  if (!notification) return reply({ error: "Notification not found" }, 404);

  const recipients = await opsRecipients(supabase, notification.property_id);
  if (recipients.length === 0) return reply({ ok: true, skipped: "no_alert_phone" });

  // Descriptive maintenance wording; any other category (or a maintenance row without a linked report) keeps title: body.
  let title: string = notification.title;
  let text: string = notification.body;
  let urgent = false;
  if (notification.category === "maintenance") {
    const built = await buildMaintenanceSms(supabase, notification);
    if (built) ({ title, body: text, urgent } = built);
  }

  // Per-recipient category gate: each person's own sms_notification_prefs decides whether THEY get it.
  const eligible = filterByPref(recipients, notification.category);
  if (eligible.length === 0) return reply({ ok: true, skipped: "disabled" });

  if (!urgent && !isWithinSendWindow()) {
    await supabase.from("pending_instant_sms").insert({
      property_id: notification.property_id,
      notification_id: notification.id,
      payload: { title, body: text, category: notification.category },
    });
    return reply({ ok: true, deferred: "outside_send_window" });
  }

  const message = `${title}: ${text}`;
  const results: { role: string; status: string }[] = [];
  for (const r of eligible) {
    let status = "skipped_cap";
    if (await withinDailySmsCap(supabase, notification.property_id)) {
      const result = await sendSms(r.phone, message);
      status = result.ok ? "sent" : "failed";
    }
    await supabase.from("sms_send_log").insert({
      property_id: notification.property_id,
      recipient_phone: r.phone,
      category: notification.category,
      status,
      message,
      recipient_role: r.role,
    });
    results.push({ role: r.role, status });
  }
  return reply({ ok: true, results });
});
