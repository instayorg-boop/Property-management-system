import { supabase } from "./supabaseClient";
import type { Json, Tables, TablesUpdate } from "./database.types";

export type PaymentStatus = "paid" | "overdue" | "unpaid" | "partial";
export type DepositStatus = "Not collected" | "Held" | "Refunded" | "Forfeited" | "Partially refunded";
export type DepositMethod = "mobile" | "cash" | "bank";
export type PaymentMethod = "cash" | "mobile-money" | "bank-transfer" | "other";
export type LedgerRow = {
  /** Stable row id — lets a single ledger entry be targeted for deletion. Generated client-side
   * (crypto.randomUUID()) at creation time and passed straight through to the insert, same
   * pattern as tenant/expense ids elsewhere, rather than round-tripping to get the DB default. */
  id: string;
  label: string;
  amount: number;
  paidAmount?: number;
  status?: PaymentStatus;
  /** When this entry was recorded — powers the Dashboard's monthly collections chart / recent
   * payments list. Optional so client-constructed rows that haven't set it don't break typing. */
  createdAt?: string;
  /** How the tenant actually paid — null on rows that predate this column (shown as "Manual" in
   * the UI, not guessed at). Real mobile-money payments get this set by lenco-webhook, never by
   * the client, so it can't be spoofed. */
  method?: PaymentMethod | null;
  /** "lenco" = a real, gateway-verified payment (lenco-webhook / pay-portal-check-collection) —
   * never set by the client, so it can't be spoofed. "manual" = the landlord typed this in
   * themselves (logPayment, the initial security-deposit row). Distinct from `method`: a
   * manually-logged "mobile money" entry and a real Lenco payment both end up with
   * method = "mobile-money", so this is what actually gates whether an entry can be deleted.
   * "adjustment" = a manually-applied balance change that isn't a payment being settled — an
   * ad-hoc charge (amount > 0) or a credit/waiver (amount < 0), from addAdjustment/waivePenalty. */
  source: "manual" | "lenco" | "adjustment";
  /** Phase 3C raw event metadata — undefined on every legacy row (event_type IS NULL in the DB),
   * populated on rows produced by the new financial-event model (Phase 3A onward). These are never
   * read by any existing UI component; they exist purely so a future phase can consume the real
   * event shape (charge/payment/penalty/adjustment linkage, billing period, due dates) without
   * this projection needing to be rebuilt from scratch. `amount`/`paidAmount`/`status` above always
   * carry the legacy-compatible, always-positive display convention regardless of which event(s)
   * this row represents — never the raw signed event amount. */
  eventType?: "charge" | "payment" | "penalty" | "adjustment" | "credit" | null;
  chargeId?: string | null;
  billingPeriodId?: string | null;
  dueDate?: string | null;
  gracePeriodEnd?: string | null;
  affectsBalance?: boolean;
  origin?: string | null;
  voidedAt?: string | null;
  /** For a projected charge row: the raw settling events (payments/adjustments whose charge_id
   * points at this charge) that were summed into `paidAmount`. Empty/undefined otherwise. */
  linkedEvents?: LedgerRow[];
};

export const RELATION_OPTIONS = ["Parent", "Guardian", "Spouse", "Sibling", "Friend", "Other"] as const;
export type RelationType = (typeof RELATION_OPTIONS)[number];

export type EmergencyContact = {
  id: string;
  name: string;
  relation: RelationType;
  /** Free text used only when `relation` is "Other". */
  relationOther?: string;
  phones: string[];
};

/** What to actually show for a contact's relationship — "Other" alone isn't useful to a landlord
 * scanning the list, so this falls back to the free-text description when one was given. */
export function relationLabel(contact: EmergencyContact): string {
  return contact.relation === "Other" ? contact.relationOther?.trim() || "Other" : contact.relation;
}

export type Tenant = {
  id: string;
  name: string;
  /** A tenant can be reachable on more than one number — the first is treated as primary (call/text). */
  phones: string[];
  /** Any number of emergency contacts, each with any number of their own phone numbers. Stored as
   * jsonb on `tenants.emergency_contacts` — see the migration adding phones/emergency_contacts. */
  emergencyContacts: EmergencyContact[];
  property: string;
  room: string;
  roomType: string;
  moveInDate: string;
  rentAmount: number;
  status: PaymentStatus;
  daysOverdue?: number;
  owedAmount: number;
  depositAmount: number;
  depositDate: string;
  depositMethod: DepositMethod;
  depositStatus: DepositStatus;
  /** A non-refundable fee logged to hold a specific room for an inactive tenant (e.g. away for the
   * semester) — deliberately separate from the rent ledger, mirroring how the deposit fields sit
   * outside `ledger_entries` too. Set via reserveRoom on TenantProfile, not part of normal billing. */
  reservationFeeAmount?: number;
  reservationFeeDate?: string;
  reservationFeeMethod?: DepositMethod;
  reservationFeeCollected?: boolean;
  notes: string;
  onTimeCount: number;
  totalMonthsCount: number;
  active: boolean;
  /** Per-tenant overrides for the property's billing defaults (Settings → Billing) — null/undefined
   * means "use the property default", not "zero". Edited from the Add Tenant page. */
  dueDay?: number | null;
  gracePeriodDays?: number | null;
  institution?: string;
  moveOutDate?: string;
  depositResolutionNote?: string;
  ledger: LedgerRow[];
  /** Short, stable code for this tenant's payment-portal link (pay.instay.co/p/<token>) — set once
   * at creation, never regenerated, so an SMS'd link keeps working indefinitely. Generated by a DB
   * column default (not the client, unlike `id`), so it's undefined on a tenant that was just
   * created locally and hasn't been re-fetched from the server yet. */
  portalToken?: string;
};

/** Same alphabet/length as the DB's generate_portal_token() default — generated client-side so a
 * freshly-created tenant has its short code (used for /tenants/:code and the /p/:code payment
 * link) immediately, without waiting on a round trip to read back the DB default. */
const PORTAL_TOKEN_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generatePortalToken(): string {
  let token = "";
  for (let i = 0; i < 6; i++) {
    token += PORTAL_TOKEN_CHARS[Math.floor(Math.random() * PORTAL_TOKEN_CHARS.length)];
  }
  return token;
}

function roomLabel(number: string) {
  return `Room ${number}`;
}

function parseRoomNumber(label: string) {
  return label.replace(/^Room\s+/i, "").trim();
}

async function resolveRoomId(propertyId: string, label: string | undefined): Promise<string | null> {
  if (!label) return null;
  const { data, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("property_id", propertyId)
    .eq("number", parseRoomNumber(label))
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function resolveRoomTypeId(propertyId: string, name: string | undefined): Promise<string | null> {
  if (!name) return null;
  const { data, error } = await supabase
    .from("room_types")
    .select("id")
    .eq("property_id", propertyId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function resolveInstitutionId(propertyId: string, name: string | undefined): Promise<string | null> {
  if (!name) return null;
  const { data, error } = await supabase
    .from("institutions")
    .select("id")
    .eq("property_id", propertyId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id;
  const { data: created, error: insertError } = await supabase
    .from("institutions")
    .insert({ property_id: propertyId, name })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id;
}

const TENANT_COLUMNS =
  "id, name, phones, emergency_contacts, move_in_date, move_out_date, rent_amount, status, " +
  "days_overdue, owed_amount, deposit_amount, deposit_date, deposit_method, deposit_status, " +
  "deposit_resolution_note, notes, on_time_count, total_months_count, active, due_day, grace_period_days, " +
  "reservation_fee_amount, reservation_fee_date, reservation_fee_method, reservation_fee_collected, " +
  // rooms!tenants_room_id_fkey disambiguates against rooms.reserved_for_tenant_id (added by the
  // room-reservations migration) — a plain rooms(number) embed is ambiguous now and PostgREST
  // rejects the whole query (PGRST201) rather than picking one, which silently broke every tenant
  // read that used this column list.
  "portal_token, rooms!tenants_room_id_fkey(number), room_types(name), institutions(name)";

type TenantRow = Pick<
  Tables<"tenants">,
  | "id" | "name" | "phones" | "emergency_contacts" | "move_in_date" | "move_out_date"
  | "rent_amount" | "status" | "days_overdue" | "owed_amount" | "deposit_amount" | "deposit_date"
  | "deposit_method" | "deposit_status" | "deposit_resolution_note" | "notes" | "on_time_count"
  | "total_months_count" | "active" | "due_day" | "grace_period_days" | "portal_token"
  | "reservation_fee_amount" | "reservation_fee_date" | "reservation_fee_method" | "reservation_fee_collected"
> & {
  rooms: { number: string } | null;
  room_types: { name: string } | null;
  institutions: { name: string } | null;
};

/** `emergency_contacts` is stored as jsonb — parsed defensively since it's shaped by the app, not
 * a real schema, so a stray null/malformed entry shouldn't take down the whole tenant list. */
function toEmergencyContacts(json: Json | null): EmergencyContact[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((entry): EmergencyContact[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const c = entry as Record<string, unknown>;
    const relation = typeof c.relation === "string" && (RELATION_OPTIONS as readonly string[]).includes(c.relation)
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

function toTenant(row: TenantRow, propertyName: string, ledger: LedgerRow[]): Tenant {
  return {
    id: row.id,
    name: row.name,
    phones: row.phones ?? [],
    emergencyContacts: toEmergencyContacts(row.emergency_contacts),
    property: propertyName,
    room: row.rooms ? roomLabel(row.rooms.number) : "",
    roomType: row.room_types?.name ?? "",
    moveInDate: row.move_in_date ?? "",
    rentAmount: row.rent_amount,
    status: row.status as PaymentStatus,
    daysOverdue: row.days_overdue ?? undefined,
    owedAmount: row.owed_amount,
    depositAmount: row.deposit_amount,
    depositDate: row.deposit_date ?? "",
    depositMethod: (row.deposit_method as DepositMethod) ?? "cash",
    depositStatus: row.deposit_status as DepositStatus,
    reservationFeeAmount: row.reservation_fee_amount ?? undefined,
    reservationFeeDate: row.reservation_fee_date ?? undefined,
    reservationFeeMethod: (row.reservation_fee_method as DepositMethod) ?? undefined,
    reservationFeeCollected: row.reservation_fee_collected ?? false,
    notes: row.notes ?? "",
    onTimeCount: row.on_time_count,
    totalMonthsCount: row.total_months_count,
    active: row.active,
    dueDay: row.due_day ?? undefined,
    gracePeriodDays: row.grace_period_days ?? undefined,
    institution: row.institutions?.name ?? undefined,
    moveOutDate: row.move_out_date ?? undefined,
    depositResolutionNote: row.deposit_resolution_note ?? undefined,
    ledger,
    portalToken: row.portal_token,
  };
}

export type RawLedgerEntryRow = Pick<
  Tables<"ledger_entries">,
  | "id"
  | "tenant_id"
  | "label"
  | "amount"
  | "paid_amount"
  | "status"
  | "created_at"
  | "method"
  | "source"
  | "event_type"
  | "affects_balance"
  | "charge_id"
  | "billing_period_id"
  | "due_date"
  | "grace_period_end"
  | "origin"
  | "voided_at"
>;

function toSource(source: string): LedgerRow["source"] {
  return source === "lenco" ? "lenco" : source === "adjustment" ? "adjustment" : "manual";
}

/** A legacy row (event_type IS NULL) passes through exactly as it always has — this is the same
 * mapping toLedgerRow used to do directly, unchanged in every field it sets. */
function projectLegacyRow(row: RawLedgerEntryRow): LedgerRow {
  return {
    id: row.id,
    label: row.label,
    amount: row.amount,
    paidAmount: row.paid_amount ?? undefined,
    status: (row.status as PaymentStatus) ?? undefined,
    createdAt: row.created_at,
    method: (row.method as PaymentMethod | null) ?? null,
    source: toSource(row.source),
    voidedAt: row.voided_at,
  };
}

/** THE centralized ledger projection (Phase 3C) — the one place that turns raw `ledger_entries`
 * rows (a mix of pre-event-model legacy rows and new event_type-tagged rows) into the
 * legacy-shaped `LedgerRow[]` every UI consumer (TenantProfile, Rent, Dashboard, Accounting,
 * TenantPaymentDrawer, useCollectedRent) already reads. Those consumers are untouched by this
 * phase — they keep reading `amount`/`paidAmount`/`status` exactly as before; only what populates
 * that array changes.
 *
 * Algorithm:
 *  1. event_type IS NULL -> legacy row, passed through unchanged (projectLegacyRow).
 *  2. voided_at IS NOT NULL -> the row still projects and displays (voidedAt carries through so
 *     the UI can badge it "Voided") but never affects the projected financial state: a voided
 *     linked payment/adjustment is excluded from the sum that settles its charge, so voiding never
 *     changes what's owed — it only ever changes what's shown as history.
 *  3. event_type = 'charge' -> becomes one projected charge-shaped row. Its `paidAmount`/`status`
 *     are derived from every non-voided, affects_balance-true event whose charge_id points at it
 *     (summed as signed amounts against the charge's own positive amount — a `payment` row's
 *     negative amount reduces what's outstanding, a linked `adjustment`/`credit` applies the same
 *     way), matching the exact paidAmount-only-when-partial convention every existing reader
 *     already expects. Those linked rows are consumed here — they must NOT also appear as their
 *     own independent charge-shaped row (requirement 4).
 *  4. Any other new-model row not consumed by step 3 (affects_balance = false audit rows — e.g. a
 *     future waived-penalty event — and any payment/adjustment/penalty with no charge_id) is
 *     projected as its own standalone history row, in the same shape a legacy adjustment row has
 *     always had. A payment's raw negative `amount` is never surfaced directly (requirement 7) —
 *     it's shown positive, exactly like a legacy fully-settled payment row already is.
 *  5. Everything is merged and re-sorted by createdAt, newest first, matching today's query order.
 */
export function projectLedgerRows(rows: RawLedgerEntryRow[]): LedgerRow[] {
  const legacy: LedgerRow[] = [];
  const charges = new Map<string, RawLedgerEntryRow>();
  const linkedByCharge = new Map<string, RawLedgerEntryRow[]>();
  const standalone: RawLedgerEntryRow[] = [];

  for (const row of rows) {
    if (row.event_type == null) {
      legacy.push(projectLegacyRow(row));
      continue;
    }

    if (row.event_type === "charge") {
      charges.set(row.id, row);
      continue;
    }
    // An audit-only event (affects_balance = false) never gets merged into a charge's paidAmount,
    // regardless of whether it happens to carry a charge_id — that's the entire point of
    // affects_balance existing (see the Phase 2A migration comment): stay visible in history
    // without changing what's owed.
    if (row.affects_balance !== false && row.charge_id) {
      const list = linkedByCharge.get(row.charge_id) ?? [];
      list.push(row);
      linkedByCharge.set(row.charge_id, list);
      continue;
    }
    standalone.push(row);
  }

  const projectedCharges: LedgerRow[] = [];
  for (const charge of charges.values()) {
    const linked = linkedByCharge.get(charge.id) ?? [];
    // Voided linked events stay in `linked` (and so in `linkedEvents` below) so they're still
    // visible on the charge's history, but never count toward what's actually settled.
    const net = linked.filter((ev) => !ev.voided_at).reduce((sum, ev) => sum + ev.amount, 0); // payments are negative, adjustments signed
    const remaining = Math.max(0, charge.amount + net);
    const paidAmount = round2(charge.amount - remaining);
    const status: PaymentStatus = remaining <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";
    projectedCharges.push({
      id: charge.id,
      label: charge.label,
      amount: charge.amount,
      // Matches the legacy convention exactly: paidAmount is only ever set on a partial row —
      // a fully-paid or fully-unpaid row is read via `amount`/`status` alone by every consumer.
      paidAmount: status === "partial" ? paidAmount : undefined,
      status,
      createdAt: charge.created_at,
      method: (charge.method as PaymentMethod | null) ?? null,
      source: toSource(charge.source),
      eventType: "charge",
      chargeId: null,
      billingPeriodId: charge.billing_period_id,
      dueDate: charge.due_date,
      gracePeriodEnd: charge.grace_period_end,
      affectsBalance: charge.affects_balance,
      origin: charge.origin,
      voidedAt: charge.voided_at,
      linkedEvents: linked.map(projectStandaloneRow),
    });
  }

  const projectedStandalone = standalone.map(projectStandaloneRow);

  return [...legacy, ...projectedCharges, ...projectedStandalone].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Projects one new-model row that isn't being merged into a charge (a standalone payment, a
 * penalty, a tenant-level adjustment/credit, or an audit-only row) into the same shape a legacy
 * `source: "adjustment"` row has always had. A `payment` row's negative amount is flipped positive
 * (requirement 7) and shown fully settled, since a standalone payment is — by definition — money
 * that was actually received. */
function projectStandaloneRow(row: RawLedgerEntryRow): LedgerRow {
  const isPayment = row.event_type === "payment";
  const displayAmount = isPayment ? Math.abs(row.amount) : row.amount;
  return {
    id: row.id,
    label: row.label,
    amount: displayAmount,
    paidAmount: isPayment ? displayAmount : undefined,
    status: isPayment ? "paid" : undefined,
    createdAt: row.created_at,
    method: (row.method as PaymentMethod | null) ?? null,
    source: toSource(row.source),
    eventType: row.event_type as LedgerRow["eventType"],
    chargeId: row.charge_id,
    billingPeriodId: row.billing_period_id,
    dueDate: row.due_date,
    gracePeriodEnd: row.grace_period_end,
    affectsBalance: row.affects_balance,
    origin: row.origin,
    voidedAt: row.voided_at,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function listTenants(propertyId: string, propertyName: string): Promise<Tenant[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const tenantRows = data as unknown as TenantRow[];
  if (tenantRows.length === 0) return [];

  const tenantIds = tenantRows.map((r) => r.id);
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("ledger_entries")
    .select(
      "id, tenant_id, label, amount, paid_amount, status, created_at, method, source, event_type, affects_balance, charge_id, billing_period_id, due_date, grace_period_end, origin, voided_at"
    )
    .in("tenant_id", tenantIds)
    .order("created_at", { ascending: false });
  if (ledgerError) throw ledgerError;

  // Grouped per tenant, then run through the one centralized projection (Phase 3C) — a charge row
  // and the payment(s)/adjustment(s) that settle it can live on different tenants only in theory
  // (ledger_entries.charge_id has no cross-tenant constraint), but in practice every charge and
  // everything that settles it belongs to the same tenant, so projecting per-tenant-group is
  // equivalent to projecting the whole set and is far cheaper to reason about.
  const rowsByTenant = new Map<string, RawLedgerEntryRow[]>();
  for (const row of ledgerRows) {
    const list = rowsByTenant.get(row.tenant_id) ?? [];
    list.push(row);
    rowsByTenant.set(row.tenant_id, list);
  }
  const ledgerByTenant = new Map<string, LedgerRow[]>();
  for (const [tenantId, rows] of rowsByTenant) {
    ledgerByTenant.set(tenantId, projectLedgerRows(rows));
  }

  return tenantRows.map((row) => toTenant(row, propertyName, ledgerByTenant.get(row.id) ?? []));
}

export async function tenantPatchToRow(propertyId: string, patch: Partial<Omit<Tenant, "id" | "ledger">>): Promise<TablesUpdate<"tenants">> {
  const row: TablesUpdate<"tenants"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phones !== undefined) row.phones = patch.phones;
  if (patch.emergencyContacts !== undefined) row.emergency_contacts = patch.emergencyContacts as unknown as Json;
  if (patch.moveInDate !== undefined) row.move_in_date = patch.moveInDate;
  if (patch.moveOutDate !== undefined) row.move_out_date = patch.moveOutDate ?? null;
  if (patch.rentAmount !== undefined) row.rent_amount = patch.rentAmount;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.daysOverdue !== undefined) row.days_overdue = patch.daysOverdue ?? null;
  if (patch.owedAmount !== undefined) row.owed_amount = patch.owedAmount;
  if (patch.depositAmount !== undefined) row.deposit_amount = patch.depositAmount;
  if (patch.depositDate !== undefined) row.deposit_date = patch.depositDate;
  if (patch.depositMethod !== undefined) row.deposit_method = patch.depositMethod;
  if (patch.depositStatus !== undefined) row.deposit_status = patch.depositStatus;
  if (patch.depositResolutionNote !== undefined) row.deposit_resolution_note = patch.depositResolutionNote ?? null;
  if (patch.reservationFeeAmount !== undefined) row.reservation_fee_amount = patch.reservationFeeAmount ?? null;
  if (patch.reservationFeeDate !== undefined) row.reservation_fee_date = patch.reservationFeeDate ?? null;
  if (patch.reservationFeeMethod !== undefined) row.reservation_fee_method = patch.reservationFeeMethod ?? null;
  if (patch.reservationFeeCollected !== undefined) row.reservation_fee_collected = patch.reservationFeeCollected;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.onTimeCount !== undefined) row.on_time_count = patch.onTimeCount;
  if (patch.totalMonthsCount !== undefined) row.total_months_count = patch.totalMonthsCount;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.dueDay !== undefined) row.due_day = patch.dueDay;
  if (patch.gracePeriodDays !== undefined) row.grace_period_days = patch.gracePeriodDays;
  if (patch.room !== undefined) row.room_id = await resolveRoomId(propertyId, patch.room);
  if (patch.roomType !== undefined) row.room_type_id = await resolveRoomTypeId(propertyId, patch.roomType);
  if (patch.institution !== undefined) row.institution_id = await resolveInstitutionId(propertyId, patch.institution);
  return row;
}

export async function insertTenant(propertyId: string, id: string, t: Omit<Tenant, "id">): Promise<void> {
  const [roomId, roomTypeId, institutionId] = await Promise.all([
    resolveRoomId(propertyId, t.room),
    resolveRoomTypeId(propertyId, t.roomType),
    resolveInstitutionId(propertyId, t.institution),
  ]);
  const { error } = await supabase.from("tenants").insert({
    id,
    portal_token: t.portalToken,
    property_id: propertyId,
    room_id: roomId,
    room_type_id: roomTypeId,
    institution_id: institutionId,
    name: t.name,
    phones: t.phones,
    emergency_contacts: t.emergencyContacts as unknown as Json,
    move_in_date: t.moveInDate,
    move_out_date: t.moveOutDate ?? null,
    rent_amount: t.rentAmount,
    status: t.status,
    days_overdue: t.daysOverdue ?? null,
    owed_amount: t.owedAmount,
    deposit_amount: t.depositAmount,
    deposit_date: t.depositDate,
    deposit_method: t.depositMethod,
    deposit_status: t.depositStatus,
    deposit_resolution_note: t.depositResolutionNote ?? null,
    notes: t.notes,
    on_time_count: t.onTimeCount,
    total_months_count: t.totalMonthsCount,
    active: t.active,
    due_day: t.dueDay ?? null,
    grace_period_days: t.gracePeriodDays ?? null,
  });
  if (error) throw error;

  if (t.ledger.length > 0) {
    const { error: ledgerError } = await supabase.from("ledger_entries").insert(
      t.ledger.map((l) => ({
        id: l.id,
        tenant_id: id,
        label: l.label,
        amount: l.amount,
        paid_amount: l.paidAmount ?? null,
        status: l.status ?? null,
        source: l.source,
      }))
    );
    if (ledgerError) throw ledgerError;
  }
}

export async function updateTenantRow(propertyId: string, id: string, patch: Partial<Omit<Tenant, "id" | "ledger">>): Promise<void> {
  const row = await tenantPatchToRow(propertyId, patch);
  const { error } = await supabase.from("tenants").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteTenantRow(id: string): Promise<void> {
  const { error } = await supabase.from("tenants").delete().eq("id", id);
  if (error) throw error;
}

export async function addLedgerEntry(tenantId: string, entry: LedgerRow): Promise<void> {
  const { error } = await supabase.from("ledger_entries").insert({
    id: entry.id,
    tenant_id: tenantId,
    label: entry.label,
    amount: entry.amount,
    paid_amount: entry.paidAmount ?? null,
    status: entry.status ?? null,
    method: entry.method ?? null,
    source: entry.source,
    // Defaults to the DB's own now() when omitted — only set explicitly when the caller picked a
    // specific paid-on date (LogPaymentModal), so a backdated/advance payment sorts and displays
    // under the date it actually applies to, not whenever it happened to be typed in.
    ...(entry.createdAt ? { created_at: entry.createdAt } : {}),
  });
  if (error) throw error;
}

/** A raw Phase 3A financial-event row — deliberately NOT `LedgerRow`, which is the
 * legacy-compatible *projected* display shape (see projectLedgerRows). This is the actual shape
 * written to `ledger_entries` for a new-model event: signed `amount`, no `paid_amount`/`status`
 * (those are legacy-only fields; a payment event's own row never carries them per Phase 3D). */
export type NewLedgerEventInsert = {
  id: string;
  tenantId: string;
  label: string;
  /** Signed per event_type — negative for a payment, positive for a charge/penalty, signed for an
   * adjustment/credit. Never the legacy "amount owed" convention. */
  amount: number;
  eventType: "charge" | "payment" | "penalty" | "adjustment" | "credit";
  affectsBalance: boolean;
  origin: string;
  source: LedgerRow["source"];
  chargeId: string | null;
  idempotencyKey: string;
  method?: PaymentMethod | null;
  createdAt?: string;
};

/** Inserts one new-model financial event. Sibling to addLedgerEntry (legacy shape) — this is the
 * Phase 3D write path for a NEW manual payment; existing legacy rows/writers are untouched. */
export async function addLedgerEvent(entry: NewLedgerEventInsert): Promise<void> {
  const { error } = await supabase.from("ledger_entries").insert({
    id: entry.id,
    tenant_id: entry.tenantId,
    label: entry.label,
    amount: entry.amount,
    event_type: entry.eventType,
    affects_balance: entry.affectsBalance,
    origin: entry.origin,
    source: entry.source,
    charge_id: entry.chargeId,
    idempotency_key: entry.idempotencyKey,
    method: entry.method ?? null,
    ...(entry.createdAt ? { created_at: entry.createdAt } : {}),
  });
  if (error) throw error;
}

export type SyncTenantBalanceResult = {
  tenantId: string;
  /** True only when this tenant has no legacy row at all (event_type IS NULL) and the RPC
   * actually recomputed+wrote owed_amount/status/days_overdue. False for a legacy/mixed tenant
   * (skip_reason: "skipped_legacy_or_mixed") or an unknown tenant (skip_reason: "tenant_not_found")
   * — in either case nothing was written, and the caller is responsible for whatever fallback
   * behavior it had before this existed (see logPayments). */
  synchronized: boolean;
  skipReason: string | null;
  balance: number | null;
  status: PaymentStatus | null;
  daysOverdue: number | null;
};

/** Calls the Phase 3E `sync_tenant_balance_if_new_model` RPC — the one centralized place that
 * recomputes and writes a new-model-only tenant's owed_amount/status/days_overdue from their
 * financial events. Safe to call unconditionally for any tenant: it's self-gating, and a
 * legacy/mixed tenant simply comes back `synchronized: false` having written nothing. */
export async function syncTenantBalanceIfNewModel(tenantId: string): Promise<SyncTenantBalanceResult> {
  const { data, error } = await supabase.rpc("sync_tenant_balance_if_new_model", { p_tenant_id: tenantId }).maybeSingle();
  if (error) throw error;
  return {
    tenantId: data?.tenant_id ?? tenantId,
    synchronized: data?.synchronized ?? false,
    skipReason: data?.skip_reason ?? null,
    balance: data?.balance ?? null,
    status: (data?.status as PaymentStatus | null) ?? null,
    daysOverdue: data?.days_overdue ?? null,
  };
}

/** Whether a caller that just wrote a new-model event should still apply its own manually
 * computed tenant-balance patch. True whenever syncTenantBalanceIfNewModel did NOT itself write
 * the authoritative balance (a legacy/mixed tenant, or the sync call failed/was skipped) — false
 * once it did, so the two never compete for the same tenant. Shared by TenantsContext.tsx's
 * logPayments and offline/sync.ts's replayLedgerEntry, the two places that still carry a legacy
 * fallback write; pulled out as its own function purely so this one decision is testable in
 * isolation rather than duplicated inline in both places. */
export function needsBalanceFallbackWrite(syncResult: { synchronized: boolean } | null | undefined): boolean {
  return !syncResult?.synchronized;
}

/** Voids one ledger record instead of deleting it — the row stays in the table permanently (its
 * `amount`/`paid_amount`/`event_type`/etc. are never rewritten), marked with when and why it was
 * voided. This replaces the old hard-DELETE entirely: deleting a payment row used to remove the
 * evidence it existed while leaving owed_amount/status exactly as that payment had already set
 * them — permanently forgiving real debt with no trace (the exact problem voided_at/void_reason
 * were added to solve in the Phase 2A migration, but never wired up to this action until now).
 * Works uniformly for legacy rows and every new-model event_type (charge/payment/penalty/
 * adjustment/credit) — projectLedgerRows already excludes any voided row from what the UI sees,
 * for both row shapes, so voiding here is sufficient for the entry to disappear/recalculate
 * correctly with no other change needed. Does NOT touch tenants.owed_amount/status/counters —
 * those stay exactly as they were, same as the old delete never touched them either. */
/** Thrown when the database refuses a void — currently only for a new-model charge that still
 * has an active (non-voided, balance-affecting) event linked to it via charge_id. Distinct from a
 * plain Error so the UI can show this exact explanation instead of a generic failure message. */
export class VoidRefusedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(
      reason === "charge_has_active_linked_events"
        ? "This charge can't be voided while a payment or other event is still linked to it. Void those first."
        : "This entry couldn't be voided."
    );
    this.reason = reason;
  }
}

/** Routes through the void_ledger_entry DB function (Phase 3E) rather than a plain UPDATE, so the
 * charge-void guard (a charge with active linked events can't be voided) is enforced atomically in
 * the database — see that function's own comment for why a client-side check-then-update would be
 * race-prone. Legacy rows and every other new-model event_type are unaffected by the guard. */
export async function voidLedgerEntry(id: string, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc("void_ledger_entry", { p_id: id, p_reason: reason }).maybeSingle();
  if (error) throw error;
  if (!data || !data.voided) throw new VoidRefusedError(data?.refusal_reason ?? "unknown");
}
