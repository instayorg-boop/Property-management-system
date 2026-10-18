import { supabase } from "./supabaseClient";
import { generatePortalToken, insertTenant, deleteTenantRow, type Tenant } from "./tenants";
import { parsePhone, formatPhone, validatePhone } from "../landlord/components/PhoneNumberInput";

export type ImportField =
  | "name" | "phone" | "gender" | "unit" | "rent" | "deposit" | "moveIn" | "guardianName" | "guardianPhone";

export const IMPORT_FIELDS: { key: ImportField; label: string; required?: boolean; hint: string; aliases: string[] }[] = [
  { key: "name", label: "Full name", required: true, hint: "Thandiwe Banda", aliases: ["name", "fullname", "tenant", "tenantname", "customer"] },
  { key: "phone", label: "Phone", required: true, hint: "0977 123 456", aliases: ["phone", "phonenumber", "mobile", "cell", "contact", "tel", "whatsapp", "number"] },
  { key: "rent", label: "Monthly rent (K)", required: true, hint: "1500", aliases: ["rent", "monthlyrent", "rentamount", "amount", "price", "rate"] },
  { key: "unit", label: "Unit / room", hint: "A3", aliases: ["unit", "room", "roomnumber", "house", "flat", "apartment", "roomno", "unitno"] },
  { key: "moveIn", label: "Move-in date", hint: "01/09/2025", aliases: ["movein", "moveindate", "startdate", "datemovedin", "datejoined", "joined", "start"] },
  { key: "deposit", label: "Deposit (K)", hint: "1500", aliases: ["deposit", "depositamount", "securitydeposit"] },
  { key: "gender", label: "Gender", hint: "Female", aliases: ["gender", "sex"] },
  { key: "guardianName", label: "Guardian name", hint: "Mr Banda", aliases: ["guardian", "guardianname", "parent", "nextofkin", "emergencycontact", "emergencyname"] },
  { key: "guardianPhone", label: "Guardian phone", hint: "0966 123 456", aliases: ["guardianphone", "parentphone", "nextofkinphone", "emergencyphone", "guardiannumber"] },
];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Parses CSV / tab (pasted from Excel) / semicolon text. Handles quotes and CRLF. */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export function autoMap(headers: string[]): Record<ImportField, number> {
  const map = {} as Record<ImportField, number>;
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    // exact alias first, then contains
    let idx = headers.findIndex((h, i) => !used.has(i) && f.aliases.includes(norm(h)));
    if (idx < 0) idx = headers.findIndex((h, i) => !used.has(i) && norm(h).length > 2 && f.aliases.some((a) => a.length > 3 && norm(h).includes(a)));
    map[f.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return map;
}

export function templateCsv(): string {
  const head = IMPORT_FIELDS.map((f) => f.label).join(",");
  const ex = ["Thandiwe Banda,0977123456,1500,A3,01/09/2025,1500,Female,Mr Banda,0966123456", "Chanda Mwila,0955987654,1200,B1,15/10/2025,0,Male,,"];
  return [head, ...ex].join("\n");
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
/** Day-first (Zambia). Accepts 2025-09-01, 01/09/2025, 1-9-25, "1 Sep 2025". */
export function parseDateLoose(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let d: Date | null = null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  else if ((m = s.match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2,4})$/))) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    d = new Date(y, +m[2] - 1, +m[1]);
    if (d.getMonth() !== +m[2] - 1) d = null;
  } else if ((m = s.match(/^(\d{1,2})[ \-]([A-Za-z]{3,})[ \-,]*(\d{2,4})$/))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (mi >= 0) d = new Date(y, mi, +m[1]);
  }
  return d && !Number.isNaN(d.getTime()) ? fmtDate(d) : null;
}

/** 0977123456, 260977123456, +260 977 123 456, 977123456 → +260977123456. */
export function normalizeZmPhone(v: string): string {
  const digits = v.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return formatPhone(parsePhone(digits).country, parsePhone(digits).local);
  if (digits.startsWith("260")) return `+${digits}`;
  return formatPhone("ZM", digits);
}
export const last9 = (p: string) => p.replace(/\D/g, "").slice(-9);

const money = (v: string): number | null => {
  const s = v.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export type ImportRow = {
  line: number;
  raw: string[];
  status: "ok" | "warn" | "error";
  messages: string[];
  tenant?: Omit<Tenant, "id">;
  phoneKey?: string;
};

export function buildRows(
  table: string[][],
  map: Record<ImportField, number>,
  opts: { propertyName: string; defaultRent: number | null; existingPhones: Set<string> },
): ImportRow[] {
  const get = (r: string[], f: ImportField) => (map[f] >= 0 ? (r[map[f]] ?? "").trim() : "");
  const seen = new Set<string>();
  const today = fmtDate(new Date());
  return table.map((r, i) => {
    const messages: string[] = [];
    let status = "ok" as ImportRow["status"];
    const err = (m: string) => { messages.push(m); status = "error"; };
    const warn = (m: string) => { messages.push(m); if (status === "ok") status = "warn"; };

    const name = get(r, "name");
    if (!name) err("Name is missing");

    let rent = money(get(r, "rent"));
    if (rent === null || rent === 0) rent = opts.defaultRent;
    if (rent === null) err("Rent is missing");
    else if (Number.isNaN(rent)) { err("Rent isn't a number"); rent = null; }

    const rawPhone = get(r, "phone");
    let phone = "";
    if (!rawPhone) err("Phone is missing");
    else {
      phone = normalizeZmPhone(rawPhone);
      if (validatePhone(phone)) { err("Phone number looks wrong"); phone = ""; }
    }
    const key = phone ? last9(phone) : "";
    if (key) {
      if (opts.existingPhones.has(key)) err("Already a tenant with this number");
      else if (seen.has(key)) err("Repeated in this file");
      seen.add(key);
    }

    const dRaw = get(r, "moveIn");
    let moveIn = today;
    if (dRaw) {
      const p = parseDateLoose(dRaw);
      if (p) moveIn = p; else warn("Move-in date not understood, used today");
    }

    const dep = money(get(r, "deposit"));
    if (Number.isNaN(dep as number)) warn("Deposit ignored");
    const deposit = dep && !Number.isNaN(dep) ? dep : 0;
    // Fresh start: every imported tenant joins fully paid up to today. Their first rent is charged
    // on the property's next due date. Old debts, if any, are added afterwards from the tenant's
    // profile (Charge or credit), so nothing messy comes in through the spreadsheet.
    const owing = 0;

    const gRaw = get(r, "gender").toLowerCase();
    const gender = gRaw.startsWith("f") ? "Female" : gRaw.startsWith("m") ? "Male" : gRaw ? "Other" : "";
    const unit = get(r, "unit");
    const gName = get(r, "guardianName");
    const gPhoneRaw = get(r, "guardianPhone");
    const gPhone = gPhoneRaw ? normalizeZmPhone(gPhoneRaw) : "";

    let tenant: ImportRow["tenant"];
    if (status !== "error" && rent !== null) {
      tenant = {
        name,
        phones: phone ? [phone] : [],
        emergencyContacts: gName || gPhone
          ? [{ id: crypto.randomUUID(), name: gName || "Guardian", relation: "Guardian" as const, phones: gPhone && !validatePhone(gPhone) ? [gPhone] : [] }]
          : [],
        property: opts.propertyName,
        room: unit,
        roomType: "",
        moveInDate: moveIn,
        rentAmount: rent,
        status: owing > 0 ? "unpaid" : "paid",
        owedAmount: owing,
        depositAmount: deposit,
        depositDate: moveIn,
        depositMethod: "cash",
        depositStatus: deposit > 0 ? "Held" : "Not collected",
        notes: "",
        gender,
        onTimeCount: 0,
        totalMonthsCount: 0,
        active: true,
        ledger: [],
        portalToken: generatePortalToken(),
      };
    }
    return { line: i + 2, raw: r, status, messages, tenant, phoneKey: key };
  });
}

export async function runImport(
  propertyId: string,
  rows: ImportRow[],
  label: string,
  onProgress: (done: number) => void,
): Promise<{
  batchId: string;
  imported: { id: string; name: string }[];
  failed: { row: ImportRow; error: string }[];
  /** Tenants that were added but whose first month could not be recorded as paid. */
  notSetUp: { id: string; name: string; error: string }[];
}> {
  const batchId = crypto.randomUUID();
  const todo = rows.filter((r) => r.tenant);
  const imported: { id: string; name: string }[] = [];
  const failed: { row: ImportRow; error: string }[] = [];
  const notSetUp: { id: string; name: string; error: string }[] = [];
  let done = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < todo.length) {
      const row = todo[cursor++];
      const id = crypto.randomUUID();
      try {
        await insertTenant(propertyId, id, row.tenant!);
        // Fresh start: record this month's rent as already paid, so the nightly billing job doesn't
        // charge it again and the first reminder comes on the next due date.
        const { error: openingError } = await supabase.rpc("import_tenant_opening_balance" as never, {
          p_tenant_id: id,
          p_owing: row.tenant!.owedAmount,
        } as never);
        if (openingError) {
          console.error("[import] opening balance failed", id, openingError.message);
          notSetUp.push({ id, name: row.tenant!.name, error: openingError.message });
        }
        imported.push({ id, name: row.tenant!.name });
      } catch (e) {
        failed.push({ row, error: e instanceof Error ? e.message : "Couldn't save" });
      }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  if (imported.length) {
    await supabase
      .from("tenants")
      .update({ import_batch_id: batchId, import_batch_label: label })
      .in("id", imported.map((x) => x.id));
  }
  return { batchId, imported, failed, notSetUp };
}

/** Removes an imported batch, but never a tenant who has since got ledger entries. */
export async function undoImport(batchId: string): Promise<{ removed: number; kept: number }> {
  const { data } = await supabase.from("tenants").select("id").eq("import_batch_id", batchId);
  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) return { removed: 0, kept: 0 };
  // Rows the import itself created don't count: only real activity since (a payment, a charge)
  // protects a tenant from being undone.
  const { data: led } = await supabase.from("ledger_entries").select("tenant_id").in("tenant_id", ids).or("origin.is.null,origin.neq.import");
  const busy = new Set((led ?? []).map((l) => l.tenant_id));
  let removed = 0;
  for (const id of ids) {
    if (busy.has(id)) continue;
    await deleteTenantRow(id);
    removed++;
  }
  return { removed, kept: ids.length - removed };
}

export async function sendWelcomeTexts(ids: string[]): Promise<void> {
  for (const id of ids) {
    await supabase.functions.invoke("send-tenant-onboarding-sms", { body: { tenantId: id } }).catch(() => undefined);
  }
}
