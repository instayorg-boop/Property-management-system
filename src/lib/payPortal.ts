import { supabase } from "./supabaseClient";

export type PortalTenantSummary = { id: string; name: string; room: string };

// --- OTP session storage --------------------------------------------------------------------
// sessionStorage (not localStorage) — a portal session should not silently persist across
// browser restarts on a shared/public device; it dies with the tab, same as the 30-minute
// server-side expiry backing it up regardless.

const sessionKey = (tenantId: string) => `instay-portal-session:${tenantId}`;

export function getPortalSessionToken(tenantId: string): string | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(tenantId));
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw) as { token: string; expiresAt: string };
    if (new Date(expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(sessionKey(tenantId));
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

function setPortalSessionToken(tenantId: string, token: string, expiresAt: string) {
  try {
    sessionStorage.setItem(sessionKey(tenantId), JSON.stringify({ token, expiresAt }));
  } catch {
    // sessionStorage unavailable (private mode edge cases) — the tenant just has to re-verify
    // more often; not worth failing the whole flow over.
  }
}

export function clearPortalSession(tenantId: string) {
  try {
    sessionStorage.removeItem(sessionKey(tenantId));
  } catch {
    // ignore
  }
}

/** Throws a user-facing message — the caller must surface this, not swallow it, since it's the
 * whole security boundary for the page that's about to render. */
function requireSessionToken(tenantId: string): string {
  const token = getPortalSessionToken(tenantId);
  if (!token) throw new Error("Your session has expired. Verify your code again.");
  return token;
}

export async function requestPortalOtp(propertySlug: string, tenantId: string): Promise<{ maskedPhone: string; devCode?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; maskedPhone?: string; devCode?: string; error?: string }>(
    "pay-portal-request-otp",
    { body: { propertySlug, tenantId } }
  );
  if (error || !data?.ok || !data?.maskedPhone) {
    throw new Error(data?.error ?? error?.message ?? "Failed to send a code. Try again.");
  }
  return { maskedPhone: data.maskedPhone, devCode: data.devCode };
}

export async function verifyPortalOtp(propertySlug: string, tenantId: string, code: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; sessionToken?: string; expiresAt?: string; error?: string }>(
    "pay-portal-verify-otp",
    { body: { propertySlug, tenantId, code } }
  );
  if (error || !data?.ok || !data?.sessionToken || !data?.expiresAt) {
    throw new Error(data?.error ?? error?.message ?? "Incorrect code.");
  }
  setPortalSessionToken(tenantId, data.sessionToken, data.expiresAt);
}
export type PortalTenant = {
  id: string;
  name: string;
  room: string;
  roomType: string;
  status: "paid" | "overdue" | "unpaid" | "partial";
  rentAmount: number;
  owedAmount: number;
  daysOverdue?: number;
};
export type PortalLedgerRow = { label: string; amount: number; paidAmount?: number; status?: string };

function roomLabel(number: string | null) {
  return number ? `Room ${number}` : "";
}

export async function getPortalProperty(propertySlug: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.rpc("pay_portal_get_property", { p_property_slug: propertySlug });
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Deliberately narrow — name + room only, no balance. Any unauthenticated visitor can browse this
 * list (that's the point, it's how "search for yourself" works), so it must never carry anything
 * financial. See pay_portal_search_tenants_v2's migration comment for why this replaced the old
 * balance-carrying pay_portal_search_tenants. */
export async function searchPortalTenants(propertySlug: string): Promise<PortalTenantSummary[]> {
  const { data, error } = await supabase.rpc("pay_portal_search_tenants_v2", { p_property_slug: propertySlug });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, room: roomLabel(row.room) }));
}

/** Requires a verified OTP session for this tenant (see requestPortalOtp/verifyPortalOtp) — the
 * underlying pay_portal_get_tenant_v2 RPC rejects the call server-side without one, this just
 * fails fast with a clearer message before making the round trip. */
export async function getPortalTenant(propertySlug: string, tenantId: string): Promise<PortalTenant | null> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.rpc("pay_portal_get_tenant_v2", {
    p_property_slug: propertySlug,
    p_tenant_id: tenantId,
    p_session_token: sessionToken,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    room: roomLabel(row.room),
    roomType: row.room_type ?? "",
    status: row.status as PortalTenant["status"],
    rentAmount: row.rent_amount,
    owedAmount: row.owed_amount,
    daysOverdue: row.days_overdue ?? undefined,
  };
}

export async function getPortalLedger(tenantId: string): Promise<PortalLedgerRow[]> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.rpc("pay_portal_get_ledger_v2", { p_tenant_id: tenantId, p_session_token: sessionToken });
  if (error) throw error;
  return (data ?? []).map((row) => ({ label: row.label, amount: row.amount, paidAmount: row.paid_amount ?? undefined, status: row.status ?? undefined }));
}

export async function logPortalPayment(tenantId: string, amount: number, label?: string): Promise<void> {
  const sessionToken = requireSessionToken(tenantId);
  const { error } = await supabase.rpc("pay_portal_log_payment_v2", {
    p_tenant_id: tenantId,
    p_amount: amount,
    p_label: label ?? "Rent payment",
    p_session_token: sessionToken,
  });
  if (error) throw error;
}

export async function submitPortalMaintenanceReport(
  propertySlug: string,
  tenantId: string,
  location: string,
  description: string,
  photoUrls: string[] = []
): Promise<void> {
  const { error } = await supabase.rpc("pay_portal_submit_maintenance_report_v2", {
    p_property_slug: propertySlug,
    p_tenant_id: tenantId,
    p_location: location,
    p_description: description,
    p_photo_urls: photoUrls,
  });
  if (error) throw error;
}
