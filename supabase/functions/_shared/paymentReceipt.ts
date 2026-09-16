// Tenant-facing payment receipt — "A payment of K{amount} has been received. Your outstanding
// balance is K{balance}. [To settle it, visit your tenant portal: {link}] Thank you." — the portal
// link only appears when there's still a balance left to pay; a tenant who just cleared their
// balance to zero doesn't need a "go pay more" link. Called after a payment has ALREADY been fully
// applied (reconcileCollection for online payments, or right after a manual payment is logged) so
// `tenants.owed_amount` read here is the real post-payment balance, not a stale pre-payment one.
//
// `capClient` is separate from `supabase` because this is also called from an RLS-bound client (the
// manual-payment path, send-payment-receipt-sms) where increment_sms_daily_counter's EXECUTE has
// been revoked from `authenticated` — the cap check always needs the service-role client, even when
// the tenant/settings/log reads/writes go through the caller's own RLS-scoped one.
import { sendSms } from "./sms.ts";
import { withinDailySmsCap } from "./smsCap.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function sendPaymentReceiptSms(supabase: SupabaseClient, capClient: SupabaseClient, tenantId: string, amount: number): Promise<void> {
  const { data: tenant } = await supabase.from("tenants").select("phones, owed_amount, property_id, portal_token").eq("id", tenantId).maybeSingle();
  if (!tenant) return;

  const phone = tenant.phones?.[0];
  if (!phone) return;

  const { data: settings } = await supabase
    .from("settings")
    .select("send_payment_receipt_sms")
    .eq("property_id", tenant.property_id)
    .maybeSingle();
  if (settings && settings.send_payment_receipt_sms === false) return;

  const balance = Number(tenant.owed_amount ?? 0);
  const portalLink = balance > 0 ? ` To settle it, visit your tenant portal: https://pay.instay.co/p/${tenant.portal_token}` : "";
  const message = `A payment of K${Number(amount).toLocaleString()} has been received. Your outstanding balance is K${balance.toLocaleString()}.${portalLink} Thank you.`;

  if (!(await withinDailySmsCap(capClient, tenant.property_id))) {
    await supabase.from("sms_send_log").insert({ property_id: tenant.property_id, recipient_phone: phone, category: "payment_receipt", status: "skipped_cap", message });
    return;
  }

  const result = await sendSms(phone, message);
  await supabase.from("sms_send_log").insert({ property_id: tenant.property_id, recipient_phone: phone, category: "payment_receipt", status: result.ok ? "sent" : "failed", message });
}
