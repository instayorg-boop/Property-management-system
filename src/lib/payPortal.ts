import { supabase } from "./supabaseClient";
import { edgeFunctionErrorMessage } from "./functionsError";
import { RELATION_OPTIONS, type EmergencyContact, type RelationType } from "./tenants";
import { calcLatePenalty } from "../landlord/invoiceUtils";

// --- Portal session storage -------------------------------------------------------------------
// localStorage, not sessionStorage: the "session" is really just the tenant's own permanent
// portal_token (see the durable-token-session migration) — it's meant to survive tab closes and
// browser restarts the same way the /p/:token link itself never expires, like a bookmarked
// listing page rather than a login. No expiry is tracked here because the server-side check
// (pay_portal_verify_session) doesn't have one either.

const sessionKey = (tenantId: string) => `instay-portal-session:${tenantId}`;

export function getPortalSessionToken(tenantId: string): string | null {
  try {
    return localStorage.getItem(sessionKey(tenantId));
  } catch {
    return null;
  }
}

function setPortalSessionToken(tenantId: string, token: string) {
  try {
    localStorage.setItem(sessionKey(tenantId), token);
  } catch {
    // localStorage unavailable (private mode edge cases) — the tenant just has to re-open their
    // link more often; not worth failing the whole flow over.
  }
}

export function clearPortalSession(tenantId: string) {
  try {
    localStorage.removeItem(sessionKey(tenantId));
  } catch {
    // ignore
  }
}

/** Throws a user-facing message — the caller must surface this, not swallow it, since it's the
 * whole security boundary for the page that's about to render. */
function requireSessionToken(tenantId: string): string {
  const token = getPortalSessionToken(tenantId);
  if (!token) throw new Error("Couldn't verify your session. Open your payment link again.");
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
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; sessionToken?: string; error?: string }>(
    "pay-portal-verify-otp",
    { body: { propertySlug, tenantId, code } }
  );
  if (error || !data?.ok || !data?.sessionToken) {
    throw new Error(await edgeFunctionErrorMessage(error, "Incorrect code."));
  }
  setPortalSessionToken(tenantId, data.sessionToken);
}
export type PortalTenant = {
  id: string;
  name: string;
  room: string;
  roomType: string;
  status: "paid" | "overdue" | "unpaid" | "partial";
  rentAmount: number;
  /** Total actually owed right now — carried-over balance plus any accrued late penalty (see
   * `penaltyAmount`), so every portal screen (RentStatement, MobileMoneyPayment, PaymentSuccess)
   * that reads this field already reflects the penalty without recomputing it. */
  owedAmount: number;
  /** The late-penalty portion of `owedAmount` above, broken out so the UI can show it as its own
   * line rather than silently folding it into the balance — mirrors calcPenalty/calcTotalOwed in
   * invoiceUtils.ts (the landlord-side equivalent for the differently-shaped Tenant type). */
  penaltyAmount: number;
  daysOverdue?: number;
  /** The tenant's own phone, on file — safe to surface only because getPortalTenant already
   * requires a verified OTP session; used to pre-fill the mobile-money payment step. */
  phone: string | null;
  moveInDate: string | null;
  emergencyContacts: EmergencyContact[];
};
export type PortalLedgerRow = { label: string; amount: number; paidAmount?: number; status?: string; createdAt: string };

/** Ledger entries are append-only everywhere in this app (Rent, Dashboard, Accounting, Reports all
 * rely on that), and a partial payment followed later by a top-up payment against the same period
 * genuinely produces two rows sharing one label — e.g. "September Rent 2026" logged as
 * {amount: 1200, paidAmount: 900, status: partial} and then, once the remaining balance is paid
 * off, a second {amount: 300, status: paid} (see logPayments in TenantsContext.tsx: each
 * installment's `amount` is the *remaining owed at that moment*, not an incremental new charge —
 * it shrinks with each entry, it doesn't add up). So the group's real total is the LARGEST amount
 * across the rows (the original obligation, always logged first), not the sum — summing would
 * double-count. Paid is the sum of what each row actually settled. Verified against real data:
 * Grace Mulenga's two September rows (1200/900 paid, then 300/paid) net to 1200 total, 1200 paid,
 * matching her actual owed_amount of 0 — summing amounts would have produced a phantom 1500.
 *
 * Display-only: the underlying rows/ids are untouched, this is never written back anywhere. */
export function groupPortalLedger(ledger: PortalLedgerRow[]): PortalLedgerRow[] {
  const order: string[] = [];
  const groups = new Map<string, PortalLedgerRow[]>();
  for (const row of ledger) {
    if (!groups.has(row.label)) {
      order.push(row.label);
      groups.set(row.label, []);
    }
    groups.get(row.label)!.push(row);
  }

  return order.map((label) => {
    const rows = groups.get(label)!;
    if (rows.length === 1) return rows[0];

    const amount = Math.max(...rows.map((r) => r.amount));
    const paid = rows.reduce((sum, r) => sum + (r.paidAmount ?? (r.status === "paid" ? r.amount : 0)), 0);
    const latest = rows.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a));
    const settledInFull = paid >= amount;

    return {
      label,
      amount,
      paidAmount: settledInFull ? undefined : paid,
      status: settledInFull ? "paid" : paid > 0 ? "partial" : latest.status,
      createdAt: latest.createdAt,
    };
  });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Which month/year a row is actually FOR, parsed from its label — the RPC's labels are always a
 * plain "<Month> <Year> rent"/"<Month> Rent <Year>" style string (or, for a standalone charge/
 * credit like a damage charge, whatever the landlord typed), so parsing is the only signal
 * available client-side; falls back to the row's own date if no month name/year is found in the
 * label at all. */
function portalRowPeriod(row: PortalLedgerRow): { year: number; month: number } {
  const yearMatch = row.label.match(/\d{4}/);
  const month = MONTH_NAMES.findIndex((name) => row.label.includes(name));
  if (yearMatch && month !== -1) return { year: Number(yearMatch[0]), month };
  const d = new Date(row.createdAt);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** The dueDay-th of the given month, clamped to that month's length — identical to the landlord
 * dashboard's own dueDateIn (TenantProfile.tsx), duplicated rather than imported since that one
 * lives in a landlord-only file this portal code shouldn't depend on. */
function dueDateIn(year: number, monthIndex0: number, dueDay: number): Date {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  return new Date(year, monthIndex0, Math.min(dueDay, lastDay));
}

/** The furthest-out month this tenant has a fully-paid ledger row for — mirrors
 * TenantProfile.tsx's furthestPaidMonth exactly (same label-parsing, same "latest paid period"
 * definition) so the portal and the landlord dashboard never disagree about when rent is next
 * due. */
function furthestPaidMonth(groupedLedger: PortalLedgerRow[]): { year: number; month: number } | null {
  let furthest: { year: number; month: number } | null = null;
  for (const row of groupedLedger) {
    if (row.status !== "paid") continue;
    const period = portalRowPeriod(row);
    if (!furthest || period.year > furthest.year || (period.year === furthest.year && period.month > furthest.month)) {
      furthest = period;
    }
  }
  return furthest;
}

/** When this tenant's rent is next due — same computation as the landlord dashboard's own
 * nextDueDate (TenantProfile.tsx): the month after whatever's furthest paid, or (nothing paid
 * yet) this month if already overdue/unpaid, or next month if freshly paid up with no ledger
 * history to read a period from. A paid-up tenant's due date is rolled forward until it's
 * actually in the future, so a stale/unparseable ledger label can't leave it stuck in the past. */
export function computePortalNextDueDate(
  status: PortalTenant["status"],
  ledger: PortalLedgerRow[],
  propertyDueDay: number,
  now: Date = new Date()
): Date {
  const paidThrough = furthestPaidMonth(groupPortalLedger(ledger));
  let nextDueDate = paidThrough
    ? dueDateIn(paidThrough.year, paidThrough.month + 1, propertyDueDay)
    : status === "paid"
      ? dueDateIn(now.getFullYear(), now.getMonth() + 1, propertyDueDay)
      : dueDateIn(now.getFullYear(), now.getMonth(), propertyDueDay);

  if (status === "paid") {
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    while (nextDueDate < todayMidnight) {
      nextDueDate = dueDateIn(nextDueDate.getFullYear(), nextDueDate.getMonth() + 1, propertyDueDay);
    }
  }
  return nextDueDate;
}

export type PortalLedgerGroup = { key: string; label: string; rows: PortalLedgerRow[] };

/** Groups an already-deduped ledger (see groupPortalLedger) by the month each row is actually for
 * — same structure as the landlord dashboard's own tenant ledger, so a tenant paying ahead (or
 * catching up out of order) sees "October 2026" and "September 2026" as distinct, correctly
 * ordered sections instead of one flat list sorted by whenever each row happened to be logged. */
export function groupPortalLedgerByMonth(ledger: PortalLedgerRow[]): PortalLedgerGroup[] {
  const byKey = new Map<string, PortalLedgerRow[]>();
  for (const row of ledger) {
    const { year, month } = portalRowPeriod(row);
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  return [...byKey.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => {
      const [year, month] = key.split("-").map(Number);
      return { key, label: `${MONTH_NAMES[month]} ${year}`, rows: byKey.get(key)! };
    });
}

function roomLabel(number: string | null) {
  return number ? `Room ${number}` : "";
}

/** Same defensive jsonb parsing as tenants.ts's toEmergencyContacts (not exported from there) —
 * shaped by the app, not a real schema, so a stray null/malformed entry shouldn't break the tab. */
function toEmergencyContacts(json: unknown): EmergencyContact[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((entry): EmergencyContact[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const c = entry as Record<string, unknown>;
    const relation =
      typeof c.relation === "string" && (RELATION_OPTIONS as readonly string[]).includes(c.relation)
        ? (c.relation as RelationType)
        : "Guardian";
    return [
      {
        id: typeof c.id === "string" ? c.id : crypto.randomUUID(),
        name: typeof c.name === "string" ? c.name : "",
        relation,
        relationOther: typeof c.relationOther === "string" ? c.relationOther : undefined,
        phones: Array.isArray(c.phones) ? c.phones.filter((p): p is string => typeof p === "string") : [],
      },
    ];
  });
}

export async function getPortalProperty(
  propertySlug: string
): Promise<{ id: string; name: string; dueDay: number | null; logoUrl: string | null } | null> {
  const { data, error } = await supabase.rpc("pay_portal_get_property", { p_property_slug: propertySlug });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return { id: row.id, name: row.name, dueDay: row.due_day ?? null, logoUrl: row.logo_url ?? null };
}

/** Resolves a tenant's short /p/:token link straight into the portal — no OTP round trip. The
 * token itself (an unguessable, server-generated code that only ever reached the tenant via a
 * link their landlord sent) is the proof of identity; see pay-portal-resolve-token's own comment
 * for why that's an equivalent trust boundary to an SMS'd OTP. It never expires, so neither does
 * this: the token is stored as the tenant's session the same way verifyPortalOtp does, so
 * TenantBalance renders straight past its "Verify it's you" screen (it only shows that when
 * getPortalSessionToken comes back empty) every time this link is opened, indefinitely. */
export async function resolvePortalToken(
  token: string
): Promise<{ propertySlug: string; tenantId: string; tenantName: string; room: string | null } | null> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    propertySlug?: string;
    tenantId?: string;
    sessionToken?: string;
    tenantName?: string;
    room?: string | null;
    error?: string;
  }>("pay-portal-resolve-token", { body: { token } });
  if (error || !data?.ok || !data?.propertySlug || !data?.tenantId || !data?.sessionToken) {
    return null;
  }
  setPortalSessionToken(data.tenantId, data.sessionToken);
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
  const isPaidUp = row.status === "paid";
  const penaltyAmount = isPaidUp ? 0 : calcLatePenalty(row.rent_amount, row.days_overdue ?? undefined);
  return {
    id: row.id,
    name: row.name,
    room: roomLabel(row.room),
    roomType: row.room_type ?? "",
    status: row.status as PortalTenant["status"],
    rentAmount: row.rent_amount,
    owedAmount: isPaidUp ? 0 : row.owed_amount + penaltyAmount,
    penaltyAmount,
    daysOverdue: row.days_overdue ?? undefined,
    phone: row.phone ?? null,
    moveInDate: row.move_in_date ?? null,
    emergencyContacts: toEmergencyContacts(row.emergency_contacts),
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
export type CollectionResult = {
  collectionId: string;
  status: CollectionStatus;
  /** Total charged, including the sending fee — what was actually sent to Lenco. */
  amount: number;
  feeAmount: number;
  /** The rent-only portion of `amount` — what actually gets credited against the balance. */
  rentPortion: number;
  isPartial: boolean;
};

export async function initiateCollection(
  propertySlug: string,
  tenantId: string,
  phone: string,
  operator: "mtn" | "airtel" | "zamtel",
  /** The rent portion the tenant chose on the stepper — a cap, not a guarantee; the server clamps
   * it to what's actually owed and adds the fee itself. Omit to pay the full balance. */
  amount?: number,
  /** Dev-only: skips the real Lenco call and fakes this outcome instead, for previewing the
   * success/failure/receipt UI without moving real money (Lenco has no sandbox on this account).
   * Silently ignored server-side unless the DEV_MODE_PAYMENTS function secret is set — see
   * pay-portal-collect-payment's comment. Only ever passed from a `?dev=1` URL, never shown to a
   * real tenant. */
  devSimulate?: "success" | "failed"
): Promise<CollectionResult> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    collectionId?: string;
    status?: CollectionStatus;
    amount?: number;
    feeAmount?: number;
    rentPortion?: number;
    isPartial?: boolean;
    error?: string;
  }>("pay-portal-collect-payment", { body: { propertySlug, tenantId, phone, operator, sessionToken, amount, devSimulate } });
  if (error || !data?.ok || !data?.collectionId) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to start the payment."));
  }
  return {
    collectionId: data.collectionId,
    status: data.status ?? "pay-offline",
    amount: data.amount ?? 0,
    feeAmount: data.feeAmount ?? 0,
    rentPortion: data.rentPortion ?? 0,
    isPartial: data.isPartial ?? false,
  };
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

export type PortalMaintenanceReport = {
  id: string;
  location: string;
  description: string;
  status: string;
  submittedAt: string;
  photoUrls: string[];
};

/** This tenant's own maintenance reports, read-only — see pay_portal_get_maintenance_v1's comment
 * for why it matches on tenant name rather than a tenant_id column (matches the existing
 * landlord-side convention, not a new gap). */
export async function getPortalMaintenance(tenantId: string): Promise<PortalMaintenanceReport[]> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.rpc("pay_portal_get_maintenance_v1", {
    p_tenant_id: tenantId,
    p_session_token: sessionToken,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    location: row.location,
    description: row.description,
    status: row.status,
    submittedAt: row.submitted_at,
    photoUrls: row.photo_urls ?? [],
  }));
}

export type PortalDocument = {
  id: string;
  name: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  /** Time-limited signed URL — re-fetch (getPortalDocuments) rather than caching this past its TTL. */
  url: string | null;
};

/** This tenant's own documents, read-only — routed through an edge function (not a plain RPC)
 * because the tenant-documents bucket is private and only a service-role key can mint the signed
 * URLs needed to actually view a file; see pay-portal-get-documents. */
export async function getPortalDocuments(tenantId: string): Promise<PortalDocument[]> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; documents?: PortalDocument[]; error?: string }>(
    "pay-portal-get-documents",
    { body: { tenantId, sessionToken } }
  );
  if (error || !data?.ok) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to load documents."));
  }
  return data.documents ?? [];
}

/** Generates a branded PDF receipt for a completed payment and files it under the tenant's
 * Documents (see pay-portal-generate-receipt) — called right after a successful charge so a
 * receipt exists in Documents without the tenant having to do anything. Every real figure on the
 * receipt is read back from the `collections` row server-side, not trusted from the caller. */
export async function generatePortalReceipt(
  tenantId: string,
  collectionId: string
): Promise<{ documentId: string; name: string }> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; documentId?: string; name?: string; error?: string }>(
    "pay-portal-generate-receipt",
    { body: { tenantId, sessionToken, collectionId } }
  );
  if (error || !data?.ok || !data?.documentId) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to generate the receipt."));
  }
  return { documentId: data.documentId, name: data.name ?? "Receipt.pdf" };
}

export async function submitPortalMaintenanceReport(
  propertySlug: string,
  tenantId: string,
  location: string,
  description: string,
  photoUrls: string[] = []
): Promise<void> {
  const sessionToken = requireSessionToken(tenantId);
  const { error } = await supabase.rpc("pay_portal_submit_maintenance_report_v2", {
    p_property_slug: propertySlug,
    p_tenant_id: tenantId,
    p_location: location,
    p_description: description,
    p_session_token: sessionToken,
    p_photo_urls: photoUrls,
  });
  if (error) throw error;
}
