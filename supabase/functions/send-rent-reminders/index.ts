import { createClient } from "npm:@supabase/supabase-js@2";
import { planRentCharge, type TenantForCharge, type SettingsForBilling } from "../_shared/generateRentCharge.ts";
import { currentPeriodDate, todayYMD, subtractDaysYMD } from "../_shared/billingPeriod.ts";
import { sendSms } from "../_shared/sms.ts";
import { withinDailySmsCap } from "../_shared/smsCap.ts";
import { isLedgerV2EnabledForLandlord, getLedgerV2DueAndOverdue } from "../_shared/ledgerV2.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

type EmergencyContact = { name?: string; relation?: string; phones?: string[] };

const APP_URL = Deno.env.get("APP_URL") ?? "https://portal.instayhomes.com";

function findGuardian(emergencyContacts: unknown): EmergencyContact | null {
  if (!Array.isArray(emergencyContacts)) return null;
  return (emergencyContacts as EmergencyContact[]).find((c) => c?.relation === "Guardian") ?? null;
}

async function claimReminder(supabase: SupabaseClient, tenantId: string, billingPeriodId: string, reminderType: "pre_due" | "escalation"): Promise<boolean> {
  const { error } = await supabase.from("reminder_log").insert({ tenant_id: tenantId, billing_period_id: billingPeriodId, reminder_type: reminderType });
  if (error) {
    if (error.code === "23505") return false;
    console.error("[send-rent-reminders] failed to claim reminder", tenantId, reminderType, error.message);
    return false;
  }
  return true;
}

function portalLink(portalToken: string): string {
  return `https://portal.instayhomes.com/p/${portalToken}`;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

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
    // No body (a plain pg_cron POST), process every property, same convention as generate-rent-charges.
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

    // Collected across the whole run and written as ONE bundled notification per property below,
    // instead of one row per tenant.
    const escalatedTenants: { name: string; daysOverdue: number }[] = [];

    const { data: propertyRow } = await supabase.from("properties").select("owner_id").eq("id", settings.property_id).maybeSingle();
    const ledgerV2 = propertyRow ? await isLedgerV2EnabledForLandlord(supabase, propertyRow.owner_id) : false;

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
      const ledgerV2Due = ledgerV2 ? await getLedgerV2DueAndOverdue(supabase, tenant.id) : null;
      const owedNow = ledgerV2Due ? ledgerV2Due.owed : Number(tenant.owed_amount ?? 0);
      if (owedNow <= 0) continue;

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

      const daysOverdue = ledgerV2Due ? ledgerV2Due.daysOverdue : (tenant.days_overdue ?? 0);
      if (daysOverdue >= (settings.escalation_days ?? Infinity)) {
        const billingPeriodId = plan?.billingPeriodId ?? `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`;
        const claimed = await claimReminder(supabase, tenant.id, billingPeriodId, "escalation");
        if (claimed) {
          // Recorded once the run finishes (see the bundled insert below), not here per tenant,
          // a landlord with several tenants escalating the same day should see one card, not several.
          escalatedTenants.push({ name: tenant.name, daysOverdue });

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

    // One bundled landlord-facing notification per property per run, listing everyone who
    // escalated this run instead of a separate card for each tenant.
    if (escalatedTenants.length > 0) {
      const names = escalatedTenants.map((t) => `${t.name} (${t.daysOverdue}d)`).join(", ");
      const title = escalatedTenants.length === 1 ? "Overdue tenant escalated" : `${escalatedTenants.length} tenants escalated to guardian`;
      const body =
        escalatedTenants.length === 1
          ? `${escalatedTenants[0].name} is ${escalatedTenants[0].daysOverdue} days overdue, their guardian has been contacted.`
          : `${names}. Guardians have been contacted. Open your dashboard (${APP_URL}/tenants) to see who and what's next.`;
      await supabase.from("notifications").insert({
        property_id: settings.property_id,
        category: "overdue",
        type: "overdueEscalated",
        title,
        body,
        metadata: { tenants: escalatedTenants, count: escalatedTenants.length },
      });
    }
  }

  return new Response(JSON.stringify({ date: today, results }), { headers: { "Content-Type": "application/json" } });
});
