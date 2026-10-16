import { supabase } from "./supabaseClient";

export type SentText = {
  id: string;
  sentAt: string;
  category: string;
  status: "sent" | "failed" | "skipped_cap" | string;
  recipientPhone: string;
  recipientRole: "tenant" | "guardian" | "landlord" | null;
  message: string;
};

/** Every text logged for one tenant (to them or their guardian), newest first. */
export async function listTenantTexts(tenantId: string): Promise<SentText[]> {
  const { data, error } = await supabase
    .from("sms_send_log")
    .select("id, sent_at, category, status, recipient_phone, recipient_role, message")
    .eq("tenant_id", tenantId)
    .order("sent_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    sentAt: r.sent_at,
    category: r.category,
    status: r.status,
    recipientPhone: r.recipient_phone,
    recipientRole: (r.recipient_role as SentText["recipientRole"]) ?? null,
    message: r.message,
  }));
}

/** Plain-language name for each kind of text the system sends. */
export function textKindLabel(category: string): string {
  if (category === "pre_due_reminder") return "Rent reminder";
  if (category === "ap_due") return "Rent due today";
  if (category.startsWith("ap_late_")) return `Late rent reminder (${category.slice(8)} days)`;
  if (category.startsWith("ap_week_")) return "Weekly overdue reminder";
  if (category === "escalation" || category === "autopilot_guardian") return "Overdue notice to guardian";
  if (category === "payment_receipt") return "Payment receipt";
  if (category === "onboarding") return "Welcome text with payment link";
  return "Text message";
}
