import { supabase } from "./supabaseClient";
import type { Json, Tables, TablesUpdate } from "./database.types";

export type PaymentStatus = "paid" | "overdue" | "unpaid" | "partial";
export type DepositStatus = "Not collected" | "Held" | "Refunded" | "Forfeited" | "Partially refunded";
export type DepositMethod = "mobile" | "cash" | "bank";
export type PaymentMethod = "cash" | "mobile-money" | "bank-transfer" | "other";
export type LedgerRow = {
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
  notes: string;
  onTimeCount: number;
  totalMonthsCount: number;
  active: boolean;
  institution?: string;
  moveOutDate?: string;
  depositResolutionNote?: string;
  ledger: LedgerRow[];
};

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
  "deposit_resolution_note, notes, on_time_count, total_months_count, active, " +
  "rooms(number), room_types(name), institutions(name)";

type TenantRow = Pick<
  Tables<"tenants">,
  | "id" | "name" | "phones" | "emergency_contacts" | "move_in_date" | "move_out_date"
  | "rent_amount" | "status" | "days_overdue" | "owed_amount" | "deposit_amount" | "deposit_date"
  | "deposit_method" | "deposit_status" | "deposit_resolution_note" | "notes" | "on_time_count"
  | "total_months_count" | "active"
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
    notes: row.notes ?? "",
    onTimeCount: row.on_time_count,
    totalMonthsCount: row.total_months_count,
    active: row.active,
    institution: row.institutions?.name ?? undefined,
    moveOutDate: row.move_out_date ?? undefined,
    depositResolutionNote: row.deposit_resolution_note ?? undefined,
    ledger,
  };
}

type LedgerEntryRow = Pick<
  Tables<"ledger_entries">,
  "tenant_id" | "label" | "amount" | "paid_amount" | "status" | "created_at" | "method"
>;

function toLedgerRow(row: LedgerEntryRow): LedgerRow {
  return {
    label: row.label,
    amount: row.amount,
    paidAmount: row.paid_amount ?? undefined,
    status: (row.status as PaymentStatus) ?? undefined,
    createdAt: row.created_at,
    method: (row.method as PaymentMethod | null) ?? null,
  };
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
    .select("tenant_id, label, amount, paid_amount, status, created_at, method")
    .in("tenant_id", tenantIds)
    .order("created_at", { ascending: false });
  if (ledgerError) throw ledgerError;

  const ledgerByTenant = new Map<string, LedgerRow[]>();
  for (const row of ledgerRows) {
    const list = ledgerByTenant.get(row.tenant_id) ?? [];
    list.push(toLedgerRow(row));
    ledgerByTenant.set(row.tenant_id, list);
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
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.onTimeCount !== undefined) row.on_time_count = patch.onTimeCount;
  if (patch.totalMonthsCount !== undefined) row.total_months_count = patch.totalMonthsCount;
  if (patch.active !== undefined) row.active = patch.active;
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
  });
  if (error) throw error;

  if (t.ledger.length > 0) {
    const { error: ledgerError } = await supabase.from("ledger_entries").insert(
      t.ledger.map((l) => ({
        tenant_id: id,
        label: l.label,
        amount: l.amount,
        paid_amount: l.paidAmount ?? null,
        status: l.status ?? null,
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
    tenant_id: tenantId,
    label: entry.label,
    amount: entry.amount,
    paid_amount: entry.paidAmount ?? null,
    status: entry.status ?? null,
    method: entry.method ?? null,
  });
  if (error) throw error;
}
