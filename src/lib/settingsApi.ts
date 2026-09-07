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
  if (data) return data;

  const { data: created, error: insertError } = await supabase
    .from("settings")
    .insert({
      property_id: propertyId,
      invoices_on: false,
      collection_target_pct: 90,
      landlord_name: "",
      landlord_phone: "",
      payment_methods: [{ type: "mtn", number: "0977 000 111" }, { type: "cash" }],
      management_fee_rate: 0.1,
      billing_period: "Monthly",
      due_day: 30,
      grace_period_days: 5,
      daily_penalty_rate: 15,
      reminder_lead_days: 3,
      escalation_days: 7,
      contact_order: "student",
      napsa_insurable_earnings_ceiling: 37236,
      minimum_wage_reference: 1978.99,
      payout_day: "Friday",
      account_email: "",
      subscription_plan: "Pro",
      subscription_renews_at: null,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

export async function updateSettings(propertyId: string, patch: TablesUpdate<"settings">): Promise<void> {
  const { error } = await supabase.from("settings").update(patch).eq("property_id", propertyId);
  if (error) throw error;
}
