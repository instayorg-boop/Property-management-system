// Phase 4 — daily rent-reminder + overdue-escalation SMS engine. Reads exactly the settings the
// Reminders tab already exposes (reminder_lead_days, escalation_days, contact_order) and finally
// makes them do something (Settings.tsx used to say "nothing sends yet" — this is that automation).
//
// Two independent checks per active tenant, each capped at most once per billing period via the
// unique (tenant_id, billing_period_id, reminder_type) constraint on reminder_log — the insert
// itself is the idempotency gate: if it fails with 23505 (already logged), this run has nothing
// left to do for that tenant/type and moves on, safe to re-invoke (a retried cron tick, a manual
// re-trigger) without double-sending.
//
// Pre-due reminder: reuses planRentCharge (the exact same due-date/billing-period math
// generate-rent-charges uses) rather than recomputing it, so a reminder and its charge can never
// disagree about which period or due date they're talking about. Sent to the tenant or the
// guardian first depending on contact_order ("student" | "guardian" — the existing enum, see
// SettingsContext.tsx), falling back to whichever contact actually has a phone on file.
//
// Escalation: triggers off tenants.days_overdue (the app's own already-synced overdue counter,
// not a re-derived date) crossing escalation_days, and always contacts the guardian specifically —
// matching the existing Settings copy ("the parent/guardian is contacted automatically"). The
// guardian is read from tenants.emergency_contacts (relation === "Guardian"), NOT the legacy
// guardian_phone/guardian_name columns, which nothing in this app populates. Also writes the
// landlord-facing in-app 'overdue' notification unconditionally (independent of whether an SMS
// could actually be sent), so a missing guardian contact never hides the escalation from the
// landlord — only the guardian text itself is skipped in that case.
//
// Deploy:  supabase functions deploy send-rent-reminders
// Invoke:  POST with header x-cron-secret: <CRON_SECRET>, optional JSON body { propertyId?: string }

import { createClient } from "npm:@supabase/supabase-js@2";
import { planRentCharge, type TenantForCharge, type SettingsForBilling } from "../_shared/generateRentCharge.ts";
import { currentPeriodDate, todayYMD, subtractDaysYMD } from "../_shared/billingPeriod.ts";
import { sendSms } from "../_shared/sms.ts";
import { withinDailySmsCap } from "../_shared/smsCap.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

type EmergencyContact = { name?: string; relation?: string; phones?: string[] };

function findGuardian(emergencyContacts: unknown): EmergencyContact | null {
  if (!Array.isArray(emergencyContacts)) return null;
  return (emergencyContacts as EmergencyContact[]).find((c) => c?.relation === "Guardian") ?? null;
}

/** Logs the reminder first — the unique constraint IS the idempotency check. Returns true only if
 * this call actually claimed it (i.e. it wasn't already sent for this tenant/period/type). */
async function claimReminder(supabase: SupabaseClient, tenantId: string, billingPeriodId: string, reminderType: "pre_due" | "escalation"): Promise<boolean> {
  const { error } = await supabase.from("reminder_log").insert({ tenant_id: tenantId, billing_period_id: billingPeriodId, reminder_type: reminderType });
  if (error) {
    if (error.code === "23505") return false; // already sent for this period — not an error
    console.error("[send-rent-reminders] failed to claim reminder", tenantId, reminderType, error.message);
    return false;
  }
  return true;
}

function portalLink(portalToken: string): string {
  return `https://pay.instay.co/p/${portalToken}`;
}

/** First word of a full name — SMS addresses people by first name, not the combined name (which is
 * what's stored; there's no separate first/last name column, and splitting one out would ripple
 * into the tenant list, invoices, receipts, and the tenant portal for no real gain here — this is
 * enough to keep messages short and predictable). Applied to both the tenant and the guardian. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/** 'YYYY-MM-DD' -> '18 Sep 2026', matching the display-date format used elsewhere in this app
 * (e.g. AddTenant.tsx's move-in/deposit dates). */
function formatDisplayDate(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { propertyId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // No body (a plain pg_cron POST) — process every property, same convention as generate-rent-charges.
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const periodDate = currentPeriodDate();
  const today = todayYMD();

  let settingsQuery = supabase
    .from("settings")
    .select("property_id, due_day, grace_period_days, reminder_lead_days, escalation_days, contact_order, sms_notification_prefs");
  if (body.propertyId) settingsQuery = settingsQuery.eq("property_id", body.propertyId);
  const { data: settingsRows, error: settingsError } = await settingsQuery;
  if (settingsError) {
    return new Response(JSON.stringify({ error: "Failed to load settings", detail: settingsError.message }), { status: 500 });
  }

  const results: Record<string, unknown>[] = [];

  for (const settings of settingsRows ?? []) {
    const smsPrefs = (settings.sms_notification_prefs ?? {}) as { overdueEscalated?: boolean };

    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, name, phones, emergency_contacts, rent_amount, move_in_date, move_out_date, active, due_day, grace_period_days, owed_amount, days_overdue, portal_token")
      .eq("property_id", settings.property_id)
      .eq("active", true);

    if (tenantsError) {
      results.push({ propertyId: settings.property_id, status: "error", message: tenantsError.message });
      continue;
    }

    for (const tenant of tenants ?? []) {
      if (Number(tenant.owed_amount ?? 0) <= 0) continue; // fully settled — nothing to remind or escalate

      // --- Pre-due reminder ---------------------------------------------------------------
      const chargeTenant: TenantForCharge = {
        id: tenant.id,
        rent_amount: tenant.rent_amount,
        move_in_date: tenant.move_in_date,
        move_out_date: tenant.move_out_date,
        active: tenant.active,
        due_day: tenant.due_day,
        grace_period_days: tenant.grace_period_days,
      };
      const billingSettings: SettingsForBilling = { due_day: settings.due_day, grace_period_days: settings.grace_period_days };
      const plan = planRentCharge(chargeTenant, billingSettings, periodDate);

      if (plan) {
        const reminderDate = subtractDaysYMD(plan.dueDate, settings.reminder_lead_days ?? 0);
        if (today === reminderDate) {
          const claimed = await claimReminder(supabase, tenant.id, plan.billingPeriodId, "pre_due");
          if (claimed) {
            const guardian = findGuardian(tenant.emergency_contacts);
            const tenantPhone = tenant.phones?.[0] ?? null;
            // contact_order picks who's tried first; fall back to whichever contact has a phone.
            const primary = settings.contact_order === "guardian" ? guardian?.phones?.[0] ?? tenantPhone : tenantPhone ?? guardian?.phones?.[0] ?? null;
            if (primary) {
              const link = portalLink(tenant.portal_token);
              const message = `Hi ${firstName(tenant.name)}, your rent of K${Number(plan.amount).toLocaleString()} is due on ${formatDisplayDate(plan.dueDate)}. You can make your payment through your tenant portal: ${link}`;
              if (await withinDailySmsCap(supabase, settings.property_id)) {
                const sendResult = await sendSms(primary, message);
                await supabase.from("sms_send_log").insert({ property_id: settings.property_id, recipient_phone: primary, category: "pre_due_reminder", status: sendResult.ok ? "sent" : "failed", message });
                results.push({ tenantId: tenant.id, type: "pre_due", sent: sendResult.ok, detail: sendResult.ok ? undefined : sendResult.detail });
              } else {
                await supabase.from("sms_send_log").insert({ property_id: settings.property_id, recipient_phone: primary, category: "pre_due_reminder", status: "skipped_cap", message });
                results.push({ tenantId: tenant.id, type: "pre_due", sent: false, detail: "daily cap reached" });
              }
            } else {
              results.push({ tenantId: tenant.id, type: "pre_due", sent: false, detail: "no phone on file" });
            }
          }
        }
      }

      // --- Escalation -----------------------------------------------------------------------
      const daysOverdue = tenant.days_overdue ?? 0;
      if (daysOverdue >= (settings.escalation_days ?? Infinity)) {
        const billingPeriodId = plan?.billingPeriodId ?? `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`;
        const claimed = await claimReminder(supabase, tenant.id, billingPeriodId, "escalation");
        if (claimed) {
          // Always recorded in-app for the landlord, regardless of whether a guardian SMS can go out.
          await supabase.from("notifications").insert({
            property_id: settings.property_id,
            category: "overdue",
            type: "overdueEscalated",
            title: "Overdue tenant escalated",
            body: `${tenant.name} is ${daysOverdue} days overdue — their guardian has been contacted.`,
            metadata: { tenant_id: tenant.id, days_overdue: daysOverdue },
          });

          const guardian = findGuardian(tenant.emergency_contacts);
          const guardianPhoneNumber = guardian?.phones?.[0] ?? null;
          if (guardianPhoneNumber && smsPrefs.overdueEscalated !== false) {
            const message = `Hi ${firstName(guardian!.name ?? "there")}, ${firstName(tenant.name)}'s rent is overdue. Please notify us regarding the outstanding rent.`;
            if (await withinDailySmsCap(supabase, settings.property_id)) {
              const sendResult = await sendSms(guardianPhoneNumber, message);
              await supabase.from("sms_send_log").insert({ property_id: settings.property_id, recipient_phone: guardianPhoneNumber, category: "escalation", status: sendResult.ok ? "sent" : "failed", message });
              results.push({ tenantId: tenant.id, type: "escalation", sent: sendResult.ok, detail: sendResult.ok ? undefined : sendResult.detail });
            } else {
              await supabase.from("sms_send_log").insert({ property_id: settings.property_id, recipient_phone: guardianPhoneNumber, category: "escalation", status: "skipped_cap", message });
              results.push({ tenantId: tenant.id, type: "escalation", sent: false, detail: "daily cap reached" });
            }
          } else {
            results.push({ tenantId: tenant.id, type: "escalation", sent: false, detail: guardianPhoneNumber ? "sms disabled" : "no guardian on file" });
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ date: today, results }), { headers: { "Content-Type": "application/json" } });
});
