import { supabase } from "./supabaseClient";
import { edgeFunctionErrorMessage } from "./functionsError";
import { RELATION_OPTIONS, type EmergencyContact, type RelationType } from "./tenants";
import { calcLatePenalty, DEFAULT_LATE_FEE_CONFIG, type LateFeeConfig, type LateFeeMode } from "../landlord/invoiceUtils";

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
  propertyAddress?: string;
  /** This tenant's own due day, when they bill on a different day from the property (e.g. their
   * move-in date). Null means "use the property's". */
  dueDay: number | null;
  /** The tenant's most recent actual payment, read straight off their payment rows rather than
   * guessed from the ledger, where a settled charge also reads as "paid". `undefined` means the
   * deployed pay_portal_get_tenant_v2 doesn't return it yet, so callers should keep their old
   * behaviour; `null` means it does and this tenant has never paid. */
  lastPayment?: { amount: number; at: string } | null;
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
function furthestPaidMonth(
  groupedLedger: PortalLedgerRow[],
  moveIn?: Date | null
): { year: number; month: number } | null {
  let furthest: { year: number; month: number } | null = null;
  for (const row of groupedLedger) {
    if (row.status !== "paid") continue;
    let period = portalRowPeriod(row);
    // A payment made before the tenant moved in, whose label names no month (e.g. an older
    // "Mobile money payment"), covers the move-in month, not the month it happened to be paid in.
    const named = /\d{4}/.test(row.label) && MONTH_NAMES.some((name) => row.label.includes(name));
    if (!named && moveIn && new Date(row.createdAt) < moveIn) {
      period = { year: moveIn.getFullYear(), month: moveIn.getMonth() };
    }
    // Rent can't cover a month before move-in: a row labelled for an earlier month covers the
    // move-in month.
    if (moveIn && (period.year < moveIn.getFullYear() || (period.year === moveIn.getFullYear() && period.month < moveIn.getMonth()))) {
      period = { year: moveIn.getFullYear(), month: moveIn.getMonth() };
    }
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
  now: Date = new Date(),
  moveInDate?: string | null
): Date {
  let moveInParsed: Date | null = null;
  if (moveInDate) {
    const parsed = new Date(moveInDate);
    if (!Number.isNaN(parsed.getTime())) moveInParsed = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  const paidThrough = furthestPaidMonth(groupPortalLedger(ledger), moveInParsed);
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
  // Nothing is due before the tenant moves in: someone moving in on 1 Nov with nothing paid must
  // not be shown as overdue since this month's due day. Their first due date is the move-in day.
  if (moveInDate) {
    const parsed = new Date(moveInDate);
    if (!Number.isNaN(parsed.getTime())) {
      const moveIn = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      if (nextDueDate < moveIn) nextDueDate = moveIn;
    }
  }
  return nextDueDate;
}

/** The one place the portal names which period an outstanding balance is for. Every screen (home,
 * checkout) uses this so they can never disagree. Open ledger rows name their own period; with no
 * row yet, it is the month of the next due date (so someone moving in on 1 Nov reads November,
 * not the current month). */
export function portalOwedPeriodLabel(openLabels: string[], nextDue: Date | null, now: Date = new Date()): string {
  if (openLabels.length === 0) return `${(nextDue ?? now).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} rent`;
  if (openLabels.length === 1) return openLabels[0];
  // "Periods" only means rent months: a broken window or a cleaning fee is a charge, and saying
  // "2 unpaid periods" for two one-off charges is what made the checkout read as nonsense.
  const periods = openLabels.filter(isRentPeriodLabel).length;
  const charges = openLabels.length - periods;
  if (charges === 0) return `${periods} unpaid periods`;
  if (periods === 0) return `${charges} unpaid charges`;
  return `${periods} unpaid period${periods === 1 ? "" : "s"} and ${charges} charge${charges === 1 ? "" : "s"}`;
}

/** A ledger label for a rent month ("October 2026 rent", "September Rent 2026"), as opposed to a
 * one-off charge ("Broken window"). */
export function isRentPeriodLabel(label: string): boolean {
  return /\brent\b/i.test(label) && /\d{4}/.test(label) && MONTH_NAMES.some((m) => label.includes(m));
}

/** Still owed: unpaid, overdue or part paid. A credit or a note has no status at all and is never
 * "open", it used to be counted as one because the check was only "not paid". */
export function isOpenPortalRow(row: PortalLedgerRow): boolean {
  return row.status === "unpaid" || row.status === "overdue" || row.status === "partial";
}

/** One line of what a portal payment would pay for, exactly as the server will record it. */
export type PortalPaymentLine = {
  id: string | null;
  label: string;
  amount: number;
  kind: "legacy" | "rent" | "charge" | "penalty" | "balance" | "advance";
};

/** How a payment of `amount` would be split: oldest rent or charge first, then the late fee, then
 * the balance or next month's rent in advance. This is the same database function the payment
 * itself runs, so the confirm screen, the ledger, the receipt and the SMS all say the same thing. */
export async function previewPortalPayment(tenantId: string, amount: number, livePenalty: number): Promise<PortalPaymentLine[]> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("pay_portal_preview_payment", {
    p_tenant_id: tenantId,
    p_session_token: sessionToken,
    p_amount: amount,
    p_live_penalty: livePenalty,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as PortalPaymentLine[]) : [];
}

/** "Paying for ..." in a few words, from the preview lines. */
export function portalPaymentSummary(lines: PortalPaymentLine[]): string {
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0].label;
  const rent = lines.filter((l) => l.kind === "rent" || l.kind === "advance" || (l.kind === "legacy" && isRentPeriodLabel(l.label))).length;
  const other = lines.length - rent;
  if (other === 0) return `${rent} months' rent`;
  if (rent === 0) return `${other} charges`;
  return `${rent === 1 ? "Rent" : `${rent} months' rent`} and ${other} other charge${other === 1 ? "" : "s"}`;
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
  if (!number) return "";
  // A plain room number ("3", "A2") reads as "Room 3"; free text ("Back house", "Room 2") stays as typed.
  return /^[A-Za-z]?\d+[A-Za-z]?$/.test(number.trim()) ? `Room ${number}` : number;
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

/** Builds a LateFeeConfig from the raw pay_portal_get_property row — shared by getPortalProperty
 * and getPortalTenant (the latter fetches the same RPC itself, see its own comment) so both read
 * the landlord's configured mode instead of silently assuming prorated-rent. */
function lateFeeConfigFromPropertyRow(row: {
  late_fee_enabled?: boolean | null;
  late_fee_mode?: string | null;
  daily_penalty_rate?: number | null;
  late_fee_percent?: number | null;
  late_fee_cap_enabled?: boolean | null;
  late_fee_cap_amount?: number | null;
}): LateFeeConfig {
  return {
    enabled: row.late_fee_enabled ?? DEFAULT_LATE_FEE_CONFIG.enabled,
    mode: (row.late_fee_mode as LateFeeMode) ?? DEFAULT_LATE_FEE_CONFIG.mode,
    fixedAmountPerDay: row.daily_penalty_rate ?? DEFAULT_LATE_FEE_CONFIG.fixedAmountPerDay,
    percentPerDay: row.late_fee_percent ?? DEFAULT_LATE_FEE_CONFIG.percentPerDay,
    capEnabled: row.late_fee_cap_enabled ?? DEFAULT_LATE_FEE_CONFIG.capEnabled,
    capAmount: row.late_fee_cap_amount ?? DEFAULT_LATE_FEE_CONFIG.capAmount,
  };
}

export async function getPortalProperty(
  propertySlug: string
): Promise<{ id: string; name: string; dueDay: number | null; logoUrl: string | null } | null> {
  const { data, error } = await supabase.rpc("pay_portal_get_property_v2", { p_property_slug: propertySlug });
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
  // Fetched alongside the tenant row (not passed in by the caller) so this stays correct even
  // though getPortalProperty/getPortalTenant are called in parallel elsewhere (portalData.ts) —
  // the landlord's late-fee config has to be in hand before the penalty below can be computed.
  const [tenantResult, propertyResult] = await Promise.all([
    supabase.rpc("pay_portal_get_tenant_v2", {
      p_property_slug: propertySlug,
      p_tenant_id: tenantId,
      p_session_token: sessionToken,
    }),
    supabase.rpc("pay_portal_get_property_v2", { p_property_slug: propertySlug }),
  ]);
  if (tenantResult.error) throw tenantResult.error;
  const row = tenantResult.data?.[0];
  if (!row) return null;
  const lateFeeConfig = propertyResult.data?.[0] ? lateFeeConfigFromPropertyRow(propertyResult.data[0]) : DEFAULT_LATE_FEE_CONFIG;
  const isPaidUp = row.status === "paid";
  // If the ledger already holds a penalty line for this tenant (charged, or waived by the landlord),
  // that line is the late fee. Adding a computed fee on top would count the same lateness twice.
  const { data: hasLedgerPenalty } = await (supabase as unknown as { rpc: (fn: string, args: object) => Promise<{ data: unknown }> }).rpc("pay_portal_has_ledger_penalty", {
    p_tenant_id: tenantId,
    p_session_token: sessionToken,
  });
  const penaltyAmount =
    isPaidUp || hasLedgerPenalty === true ? 0 : calcLatePenalty(row.rent_amount, row.days_overdue ?? undefined, lateFeeConfig);
  // Read off the row rather than the generated row type: these columns are newer than the
  // checked-in database types, and the portal has to keep working against either version of the
  // function (see PortalTenant.lastPayment for what undefined vs null means here).
  const extra = row as unknown as {
    due_day?: number | null;
    last_payment_amount?: number | null;
    last_payment_at?: string | null;
  };
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
    propertyAddress: row.property_address ?? "",
    dueDay: extra.due_day ?? null,
    lastPayment:
      "last_payment_at" in (row as object)
        ? extra.last_payment_at
          ? { amount: Math.abs(Number(extra.last_payment_amount ?? 0)), at: extra.last_payment_at }
          : null
        : undefined,
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

/** The receipt for a payment the landlord's import recorded as already made before the tenant
 * joined. There is no collection to point at, so the portal names the charge it settled and the
 * server reads every figure back from the import's own ledger rows. Rejects with a message
 * containing "No successful payment" when the tenant has no such recorded payment. */
export async function generateRecordedPortalReceipt(
  tenantId: string,
  chargeLabel: string
): Promise<{ documentId: string; name: string }> {
  const sessionToken = requireSessionToken(tenantId);
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; documentId?: string; name?: string; error?: string }>(
    "pay-portal-generate-receipt",
    { body: { tenantId, sessionToken, recordedFor: chargeLabel } }
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
