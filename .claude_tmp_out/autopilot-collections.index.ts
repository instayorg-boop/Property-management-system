// Autopilot: the daily collections job. For every property with autopilot_enabled it walks the
// reminder ladder for each tenant who still owes rent, hands tenants over to the landlord when
// they stay overdue, optionally (setting, off by default) contacts the guardian AFTER the
// handover, and tells the landlord when a month's rent is fully collected.
//
// Ladder (days are from the due date, editable via settings.autopilot_config):
//   due day -> "due today"; late_days (1, 3, 7, 14) -> gentle / firm / firm / final notice;
//   then every 7 days (weekly_repeat) until paid.
// Pre-due reminders stay with send-rent-reminders (reminder_lead_days). When autopilot is on,
// that function's guardian escalation is switched off from Settings (escalation_enabled=false).
//
// Guard rails: sends only inside the 08:00-19:00 Africa/Lusaka window, one message per tenant per
// day (a single stage is chosen per run), the per-property daily SMS cap, and reminder_log's
// unique (tenant, period, type) key makes every stage idempotent.
//
// Dry run: POST { "dryRun": true } (optionally { "propertyId": "..." }) returns what WOULD be
// sent without sending, claiming, or notifying anything.
//
// Deploy:  supabase functions deploy autopilot-collections
// Invoke:  POST with header x-cron-secret: <CRON_SECRET> (pg_cron: autopilot-collections-daily)

import { createClient } from "npm:@supabase/supabase-js@2";
import { currentPeriodDate, todayYMD } from "../_shared/billingPeriod.ts";
import { sendSms } from "../_shared/sms.ts";
import { isWithinSendWindow } from "../_shared/quietHours.ts";
import { withinDailySmsCap } from "../_shared/smsCap.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
type EmergencyContact = { name?: string; relation?: string; phones?: string[] };
type Config = { due_today: boolean; late_days: number[]; handover_day: number; guardian_enabled: boolean; weekly_repeat: boolean };

const DEFAULTS: Config = { due_today: true, late_days: [1, 3, 7, 14], handover_day: 14, guardian_enabled: false, weekly_repeat: true };
const GUARDIAN_DELAY_DAYS = 3; // guardian is only contacted this many days after the landlord handover
const APP_URL = Deno.env.get("APP_URL") ?? "https://pay.instay.co";

function findGuardian(c: unknown): EmergencyContact | null {
  if (!Array.isArray(c)) return null;
  return (c as EmergencyContact[]).find((x) => x?.relation === "Guardian") ?? null;
}
const first = (n: string) => n.trim().split(/\s+/)[0] || n;
const money = (n: number) => `K${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const portal = (t: string) => `https://pay.instay.co/p/${t}`;

async function claim(supabase: SupabaseClient, tenantId: string, period: string, type: string): Promise<boolean> {
  const { error } = await supabase.from("reminder_log").insert({ tenant_id: tenantId, billing_period_id: period, reminder_type: type });
  if (error) {
    if (error.code !== "23505") console.error("[autopilot] claim failed", tenantId, type, error.message);
    return false;
  }
  return true;
}
async function alreadyClaimed(supabase: SupabaseClient, tenantId: string, period: string, type: string): Promise<boolean> {
  const { data } = await supabase.from("reminder_log").select("id").eq("tenant_id", tenantId).eq("billing_period_id", period).eq("reminder_type", type).maybeSingle();
  return !!data;
}

async function deliver(supabase: SupabaseClient, propertyId: string, phone: string, category: string, message: string) {
  if (!(await withinDailySmsCap(supabase, propertyId))) {
    await supabase.from("sms_send_log").insert({ property_id: propertyId, recipient_phone: phone, category, status: "skipped_cap", message });
    return { sent: false, detail: "daily cap reached" };
  }
  const r = await sendSms(phone, message);
  await supabase.from("sms_send_log").insert({ property_id: propertyId, recipient_phone: phone, category, status: r.ok ? "sent" : "failed", message });
  return { sent: r.ok, detail: r.ok ? undefined : r.detail };
}

function tenantMessage(stage: string, name: string, owed: number, link: string, landlord: string): string {
  const n = first(name);
  const who = landlord ? first(landlord) : "your landlord";
  switch (stage) {
    case "ap_due":
      return `Hi ${n}, your rent of ${money(owed)} is due today. Pay in under a minute: ${link} Thank you!`;
    case "ap_late_1":
      return `Hi ${n}, we haven't received your rent of ${money(owed)} yet. If you've already paid, please ignore this. Otherwise pay here: ${link}`;
    case "ap_late_3":
      return `Hi ${n}, your rent of ${money(owed)} is now overdue. Late fees may apply. Please pay now to avoid extra charges: ${link}`;
    case "ap_late_7":
      return `Hi ${n}, your rent of ${money(owed)} is 7 days overdue and late fees are adding up. Please pay today or contact ${who} to talk about a plan: ${link}`;
    case "ap_late_14":
      return `Hi ${n}, FINAL NOTICE: your rent of ${money(owed)} is seriously overdue. Please pay within 48 hours or contact ${who} today: ${link}`;
    default:
      return `Hi ${n}, your rent of ${money(owed)} is still unpaid. Please pay today: ${link}`;
  }
}

function pickStage(cfg: Config, daysOverdue: number, isDueToday: boolean): string | null {
  if (isDueToday && cfg.due_today) return "ap_due";
  if (daysOverdue <= 0) return null;
  const late = [...cfg.late_days].sort((a, b) => a - b);
  if (late.includes(daysOverdue)) return `ap_late_${daysOverdue}`;
  const last = late[late.length - 1] ?? 14;
  if (cfg.weekly_repeat && daysOverdue > last && (daysOverdue - last) % 7 === 0) return `ap_week_${daysOverdue}`;
  return null;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  let body: { propertyId?: string; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* plain cron POST */ }
  const dryRun = body.dryRun === true;

  if (!dryRun && !isWithinSendWindow()) {
    return new Response(JSON.stringify({ skipped: "outside send window" }), { headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const periodDate = currentPeriodDate();
  const today = todayYMD();

  let q = supabase.from("settings").select("property_id, due_day, grace_period_days, landlord_name, notification_phone, sms_notification_prefs, autopilot_config").eq("autopilot_enabled", true);
  if (body.propertyId) q = q.eq("property_id", body.propertyId);
  const { data: settingsRows, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results: Record<string, unknown>[] = [];

  for (const s of settingsRows ?? []) {
    const cfg: Config = { ...DEFAULTS, ...((s.autopilot_config ?? {}) as Partial<Config>) };
    const smsPrefs = (s.sms_notification_prefs ?? {}) as { overdueEscalated?: boolean };

    // Collected across the whole run and written/sent as ONE bundled notification + SMS per
    // property below, instead of one of each per tenant.
    const handoverTenants: { name: string; daysOverdue: number; owed: number }[] = [];

    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, name, phones, emergency_contacts, rent_amount, move_in_date, move_out_date, active, due_day, grace_period_days, owed_amount, days_overdue, portal_token, autopilot_paused_until, rooms!tenants_room_id_fkey(number)")
      .eq("property_id", s.property_id)
      .eq("active", true);

    let allPaid = (tenants ?? []).length > 0;

    for (const t of tenants ?? []) {
      const owed = Number(t.owed_amount ?? 0);
      if (owed > 0) allPaid = false;
      if (owed <= 0) continue;
      // Someone moving in later (rent logged ahead of time) hasn't started their tenancy: no chasing.
      const moveIn = t.move_in_date ? new Date(t.move_in_date) : null;
      if (moveIn && !Number.isNaN(moveIn.getTime())) {
        const moveInYmd = `${moveIn.getFullYear()}-${String(moveIn.getMonth() + 1).padStart(2, "0")}-${String(moveIn.getDate()).padStart(2, "0")}`;
        if (moveInYmd > today) {
          results.push({ tenant: t.name, skipped: `moves in ${moveInYmd}` });
          continue;
        }
      }
      if (t.autopilot_paused_until && t.autopilot_paused_until >= today) {
        results.push({ tenant: t.name, skipped: `paused until ${t.autopilot_paused_until}` });
        continue;
      }

      const period = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`;
      const dueDay = Math.min(t.due_day ?? s.due_day, new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0).getDate());
      const dueDate = `${period}-${String(dueDay).padStart(2, "0")}`;
      const daysOverdue = Number(t.days_overdue ?? 0);
      const phone: string | null = t.phones?.[0] ?? null;

      // 1. Tenant ladder: one stage per run.
      const stage = pickStage(cfg, daysOverdue, dueDate === today);
      if (stage) {
        const message = tenantMessage(stage, t.name, owed, portal(t.portal_token), s.landlord_name ?? "");
        if (!phone) {
          results.push({ tenant: t.name, stage, sent: false, detail: "no phone on file" });
        } else if (dryRun) {
          results.push({ tenant: t.name, stage, wouldSendTo: phone, message });
        } else if (await claim(supabase, t.id, period, stage)) {
          const r = await deliver(supabase, s.property_id, phone, stage, message);
          results.push({ tenant: t.name, stage, ...r });
        }
      }

      // 2. Handover to the landlord.
      if (daysOverdue >= cfg.handover_day) {
        const handoverType = "ap_handover";
        const message = `${t.name}${t.rooms?.number ? ` (Room ${t.rooms.number})` : ""} owes ${money(owed)} and is ${daysOverdue} days overdue. Reminders haven't worked. Call ${phone ?? "them"}. Already paid? Log it: ${APP_URL}/tenants/${t.portal_token}`;
        if (dryRun) {
          results.push({ tenant: t.name, handover: true, wouldNotify: s.notification_phone, message });
        } else if (await claim(supabase, t.id, period, handoverType)) {
          // Recorded once the run finishes (see the bundled insert/SMS below), not here per
          // tenant, a landlord with several handovers the same day gets one card and one text.
          handoverTenants.push({ name: t.name, daysOverdue, owed });
          results.push({ tenant: t.name, handover: true, bundled: true });
        }

        // 3. Guardian: opt-in, and only a few days AFTER the landlord was told.
        const guardian = findGuardian(t.emergency_contacts);
        const gPhone = guardian?.phones?.[0] ?? null;
        if (cfg.guardian_enabled && gPhone && daysOverdue >= cfg.handover_day + GUARDIAN_DELAY_DAYS) {
          const gMsg = `Hi ${first(guardian?.name ?? "there")}, ${first(t.name)}'s rent is overdue. Please ask them to contact ${s.landlord_name ? first(s.landlord_name) : "the landlord"} about it.`;
          if (dryRun) {
            results.push({ tenant: t.name, guardian: true, wouldSendTo: gPhone, message: gMsg });
          } else if (await alreadyClaimed(supabase, t.id, period, handoverType) && (await claim(supabase, t.id, period, "ap_guardian"))) {
            const r = await deliver(supabase, s.property_id, gPhone, "autopilot_guardian", gMsg);
            results.push({ tenant: t.name, guardian: true, ...r });
          }
        }
      }
    }

    // One bundled "needs your attention" notification + SMS per property per run, listing
    // everyone handed over this run instead of a separate card and text for each tenant. Details
    // (phone numbers, exact per-tenant next step) live on the dashboard, which the message points
    // to, rather than being crammed into the text itself.
    if (handoverTenants.length > 0) {
      const names = handoverTenants.map((t) => `${t.name} (${t.daysOverdue}d, ${money(t.owed)})`).join(", ");
      const totalOwed = handoverTenants.reduce((sum, t) => sum + t.owed, 0);
      const title = handoverTenants.length === 1 ? "Needs your attention" : `${handoverTenants.length} tenants need your attention`;
      const body =
        handoverTenants.length === 1
          ? `${handoverTenants[0].name} is ${handoverTenants[0].daysOverdue} days overdue (${money(handoverTenants[0].owed)}). Autopilot reminders haven't worked.`
          : `${names}. Autopilot reminders haven't worked. Open your dashboard to see contact details and next steps.`;
      await supabase.from("notifications").insert({
        property_id: s.property_id,
        category: "overdue",
        type: "autopilotHandover",
        title,
        body,
        metadata: { tenants: handoverTenants, count: handoverTenants.length, total_owed: totalOwed },
      });

      if (s.notification_phone && smsPrefs.overdueEscalated !== false) {
        const smsMessage =
          handoverTenants.length === 1
            ? `${handoverTenants[0].name} owes ${money(handoverTenants[0].owed)} and is ${handoverTenants[0].daysOverdue} days overdue. Reminders haven't worked. Open your dashboard: ${APP_URL}/tenants`
            : `${handoverTenants.length} tenants need your attention (${money(totalOwed)} owed): ${names}. Open your dashboard to see contact details: ${APP_URL}/tenants`;
        const r = await deliver(supabase, s.property_id, s.notification_phone, "autopilot_handover", smsMessage);
        results.push({ property: s.property_id, handoverBundle: true, count: handoverTenants.length, ...r });
      }
    }

    // 4. Collection report: everyone has paid for the month, any day of the month.
    if (allPaid) {
      const period = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`;
      const { data: existing } = await supabase.from("notifications").select("id").eq("property_id", s.property_id).eq("type", "collectionComplete").contains("metadata", { period }).limit(1);
      if (!existing || existing.length === 0) {
        const count = (tenants ?? []).length;
        const total = (tenants ?? []).reduce((sum: number, t: { rent_amount: number }) => sum + Number(t.rent_amount ?? 0), 0);
        const monthName = periodDate.toLocaleDateString("en-GB", { month: "long" });
        const message = `${monthName} rent complete. ${money(total)} collected from ${count} tenant${count === 1 ? "" : "s"}. Report: ${APP_URL}/reports`;
        if (dryRun) {
          results.push({ property: s.property_id, collectionComplete: true, message });
        } else {
          await supabase.from("notifications").insert({
            property_id: s.property_id,
            category: "system",
            type: "collectionComplete",
            title: `${monthName} rent complete`,
            body: `${money(total)} collected from ${count} tenant${count === 1 ? "" : "s"}. Open Reports to see the breakdown.`,
            metadata: { period, total, count },
          });
          if (s.notification_phone) await deliver(supabase, s.property_id, s.notification_phone, "autopilot_report", message);
          results.push({ property: s.property_id, collectionComplete: true });
        }
      }
    }
  }

  return new Response(JSON.stringify({ date: today, dryRun, results }), { headers: { "Content-Type": "application/json" } });
});
