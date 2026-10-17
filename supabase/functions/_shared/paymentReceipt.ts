// Tenant-facing payment receipt — "Your payment of K{amount} for {what} (Room {n}) has been
// received. Your outstanding balance is K{balance}. [Pay the rest here: {link}] Thank you." —
// `label` names what the payment was logged against (e.g. "November 2026 rent"), falling back to
// plain "rent" when the caller has none to pass. The portal link only appears when there's still a
// balance left to pay; a tenant who just cleared their balance to zero doesn't need a "go pay more"
// link. Called after a payment has ALREADY been fully
// applied (reconcileCollection for online payments, or right after a manual payment is logged) so
// `tenants.owed_amount` read here is the real post-payment balance, not a stale pre-payment one.
//
// `capClient` is separate from `supabase` because this is also called from an RLS-bound client (the
// manual-payment path, send-payment-receipt-sms) where increment_sms_daily_counter's EXECUTE has
// been revoked from `authenticated` — the cap check always needs the service-role client, even when
// the tenant/settings/log reads/writes go through the caller's own RLS-scoped one.
import { sendSms } from "./sms.ts";
import { withinDailySmsCap } from "./smsCap.ts";
import { isLedgerV2EnabledForLandlord, getLedgerV2DueAndOverdue } from "./ledgerV2.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function sendPaymentReceiptSms(supabase: SupabaseClient, capClient: SupabaseClient, tenantId: string, amount: number, label?: string): Promise<void> {
  const { data: tenant } = await supabase.from("tenants").select("phones, owed_amount, property_id, portal_token, rooms!tenants_room_id_fkey(number)").eq("id", tenantId).maybeSingle();
  if (!tenant) return;

  const phone = tenant.phones?.[0];
  if (!phone) return;

  const { data: settings } = await supabase
    .from("settings")
    .select("send_payment_receipt_sms")
    .eq("property_id", tenant.property_id)
    .maybeSingle();
  if (settings && settings.send_payment_receipt_sms === false) return;

  const { data: propertyRow } = await supabase.from("properties").select("owner_id").eq("id", tenant.property_id).maybeSingle();
  const ledgerV2 = propertyRow ? await isLedgerV2EnabledForLandlord(supabase, propertyRow.owner_id) : false;
  const balance = ledgerV2 ? (await getLedgerV2DueAndOverdue(supabase, tenantId)).owed : Number(tenant.owed_amount ?? 0);
  const roomNumber = tenant.rooms?.number;
  // "towards your rent", "towards November 2026 rent, waived" etc. all read naturally with "for" —
  // only strip a trailing "payment"/"charge" so "Security deposit payment" doesn't read "for
  // Security deposit payment payment".
  const what = (label ?? "rent").trim().replace(/\s+(payment|charge)$/i, "");
  const roomSuffix = roomNumber ? ` (Room ${roomNumber})` : "";
  const balanceLine = balance > 0 ? ` Your outstanding balance is K${balance.toLocaleString()}.` : " Your balance is now fully settled.";
  const portalLink = balance > 0 ? ` Pay the rest here: https://portal.instayhomes.com/p/${tenant.portal_token}` : "";
  const message = `Your payment of K${Number(amount).toLocaleString()} for ${what}${roomSuffix} has been received.${balanceLine}${portalLink} Thank you.`;

  if (!(await withinDailySmsCap(capClient, tenant.property_id))) {
    await supabase.from("sms_send_log").insert({ property_id: tenant.property_id, recipient_phone: phone, category: "payment_receipt", status: "skipped_cap", message });
    return;
  }

  const result = await sendSms(phone, message);
  await supabase.from("sms_send_log").insert({ property_id: tenant.property_id, recipient_phone: phone, category: "payment_receipt", status: result.ok ? "sent" : "failed", message });
}
