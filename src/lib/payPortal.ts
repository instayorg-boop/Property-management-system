import { supabase } from "./supabaseClient";
import { edgeFunctionErrorMessage } from "./functionsError";

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
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to send a code. Try again."));
  }
  return { maskedPhone: data.maskedPhone, devCode: data.devCode };
}

export async function verifyPortalOtp(propertySlug: string, tenantId: string, code: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; sessionToken?: string; expiresAt?: string; error?: string }>(
    "pay-portal-verify-otp",
    { body: { propertySlug, tenantId, code } }
  );
  if (error || !data?.ok || !data?.sessionToken || !data?.expiresAt) {
    throw new Error(await edgeFunctionErrorMessage(error, "Incorrect code."));
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
  /** The tenant's own phone, on file — safe to surface only because getPortalTenant already
   * requires a verified OTP session; used to pre-fill the mobile-money payment step. */
  phone: string | null;
};
export type PortalLedgerRow = { label: string; amount: number; paidAmount?: number; status?: string; createdAt: string };

function roomLabel(number: string | null) {
  return number ? `Room ${number}` : "";
}

export async function getPortalProperty(propertySlug: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.rpc("pay_portal_get_property", { p_property_slug: propertySlug });
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Resolves a tenant's short /p/:token link straight into a verified portal session — no OTP round
 * trip. The token itself (an unguessable, server-generated code that only ever reached the tenant
 * via a link their landlord sent) is the proof of identity; see pay-portal-resolve-token's own
 * comment for why that's an equivalent trust boundary to an SMS'd OTP. On success this stores the
 * session the same way verifyPortalOtp does, so TenantBalance renders straight past its "Verify
 * it's you" screen (it only shows that when getPortalSessionToken comes back empty). */
export async function resolvePortalToken(
  token: string
): Promise<{ propertySlug: string; tenantId: string; tenantName: string; room: string | null } | null> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    propertySlug?: string;
    tenantId?: string;
    sessionToken?: string;
    expiresAt?: string;
    tenantName?: string;
    room?: string | null;
    error?: string;
  }>("pay-portal-resolve-token", { body: { token } });
  if (error || !data?.ok || !data?.propertySlug || !data?.tenantId || !data?.sessionToken || !data?.expiresAt) {
    return null;
  }
  setPortalSessionToken(data.tenantId, data.sessionToken, data.expiresAt);
  return { propertySlug: data.propertySlug, tenantId: data.tenantId, tenantName: data.tenantName ?? "", room: data.room ?? null };
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
    phone: row.phone ?? null,
  };
}

export async function getPortalLedger(tenantId: string): Promise<PortalLedgerRow[]> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.rpc("pay_portal_get_ledger_v2", { p_tenant_id: tenantId, p_session_token: sessionToken });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    label: row.label,
    amount: row.amount,
    paidAmount: row.paid_amount ?? undefined,
    status: row.status ?? undefined,
    createdAt: row.created_at,
  }));
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

export type CollectionStatus = "pending" | "pay-offline" | "successful" | "failed";

/** Kicks off a real mobile-money charge via Lenco — the amount is computed server-side from the
 * tenant's actual balance, never sent from here. Returns almost immediately with "pay-offline"
 * (the tenant still has to approve on their phone); call getCollectionStatus to poll for the real
 * outcome once lenco-webhook confirms it. Never writes to the ledger itself. */
export async function initiateCollection(
  propertySlug: string,
  tenantId: string,
  phone: string,
  operator: "mtn" | "airtel" | "zamtel"
): Promise<{ collectionId: string; status: CollectionStatus }> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; collectionId?: string; status?: CollectionStatus; error?: string }>(
    "pay-portal-collect-payment",
    { body: { propertySlug, tenantId, phone, operator, sessionToken } }
  );
  if (error || !data?.ok || !data?.collectionId) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to start the payment."));
  }
  return { collectionId: data.collectionId, status: data.status ?? "pay-offline" };
}

/** Reads our own `collections` row — fast, but only ever reflects what lenco-webhook has written.
 * Used as a last-resort fallback if the active check below can't reach the edge function at all. */
async function getStoredCollectionStatus(
  tenantId: string,
  collectionId: string
): Promise<{ status: CollectionStatus; failureReason: string | null }> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.rpc("pay_portal_get_collection_status", {
    p_collection_id: collectionId,
    p_tenant_id: tenantId,
    p_session_token: sessionToken,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("Couldn't find that payment.");
  return { status: row.status as CollectionStatus, failureReason: row.failure_reason };
}

/** Polled by TenantBalance.tsx. Doesn't just read our DB — it actively requeries Lenco's own
 * collection-status endpoint (same fallback Lenco's docs recommend alongside webhooks), so a
 * payment still resolves even if lenco-webhook was never registered or a delivery got lost. */
export async function getCollectionStatus(
  tenantId: string,
  collectionId: string
): Promise<{ status: CollectionStatus; failureReason: string | null }> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; status?: CollectionStatus; failureReason?: string | null; error?: string }>(
    "pay-portal-check-collection",
    { body: { tenantId, collectionId, sessionToken } }
  );
  if (error || !data?.ok || !data?.status) {
    // The active check itself failed to run (network blip, function down, etc.) — fall back to
    // whatever our own row says rather than surfacing a raw edge-function error mid-poll.
    return getStoredCollectionStatus(tenantId, collectionId);
  }
  return { status: data.status, failureReason: data.failureReason ?? null };
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
