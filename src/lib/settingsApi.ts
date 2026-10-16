import { supabase } from "./supabaseClient";
import type { Tables, TablesUpdate } from "./database.types";

export type SettingsRow = Tables<"settings">;

export async function getOrCreateSettings(propertyId: string): Promise<SettingsRow> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) throw error;
  const { data: userData } = await supabase.auth.getUser();
  const authEmail = userData.user?.email ?? "";
  if (data) {
    if (!data.account_email?.trim() && authEmail) {
      const { error: fillError } = await supabase
        .from("settings")
        .update({ account_email: authEmail })
        .eq("property_id", propertyId);
      if (!fillError) return { ...data, account_email: authEmail };
    }
    return data;
  }

  const landlordName = (userData.user?.user_metadata?.full_name as string | undefined)?.trim() ?? "";

  const { data: created, error: insertError } = await supabase
    .from("settings")
    .insert({
      property_id: propertyId,
      invoices_on: false,
      collection_target_pct: 90,
      landlord_name: landlordName,
      landlord_phone: "",
      payment_methods: [{ type: "cash" }],
      management_fee_rate: 0,
      billing_period: "Monthly",
      due_day: 1,
      grace_period_days: 5,
      daily_penalty_rate: 15,
      late_fee_enabled: false,
      late_fee_mode: "prorated_rent",
      late_fee_percent: 1,
      late_fee_cap_enabled: false,
      late_fee_cap_amount: null,
      reminder_lead_days: 3,
      escalation_days: 7,
      pre_due_reminders_enabled: true,
      escalation_enabled: true,
      task_overdue_rent_enabled: true,
      task_stale_maintenance_enabled: true,
      task_collections_target_enabled: true,
      contact_order: "student",
      notification_phone: "",
      payment_sms_mode: "daily_digest",
      sms_notification_prefs: { newMaintenanceReport: true, overdueEscalated: true, upcomingPayout: true },
      send_onboarding_sms: true,
      send_payment_receipt_sms: true,
      napsa_insurable_earnings_ceiling: 37236,
      minimum_wage_reference: 1978.99,
      payout_day: "Friday",
      account_email: authEmail,
      subscription_plan: null,
      subscription_renews_at: null,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

export async function updateSettings(propertyId: string, patch: TablesUpdate<"settings">): Promise<void> {
  const { data, error } = await supabase.from("settings").update(patch).eq("property_id", propertyId).select("property_id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Settings were not saved: no settings record exists for this property.");
  }
}
