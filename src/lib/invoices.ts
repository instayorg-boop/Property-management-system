import { supabase } from "./supabaseClient";

export type InvoiceStatus = "sent" | "downloaded";

export type Invoice = {
  id: string;
  tenantId: string;
  tenantIds?: string[];
  institutionName?: string;
  amount: number;
  period: string;
  issuedAt: string;
  dueAt: string;
  status: InvoiceStatus;
  invoiceNumber: string;
};

type InvoiceRow = {
  id: string;
  tenant_id: string | null;
  institution_name: string | null;
  amount: number;
  period: string;
  issued_at: string;
  due_at: string;
  status: string;
  invoice_number: string;
  invoice_tenants: { tenant_id: string }[] | null;
};

function toInvoice(row: InvoiceRow): Invoice {
  const tenantIds = row.invoice_tenants?.map((t) => t.tenant_id);
  return {
    id: row.id,
    tenantId: row.tenant_id ?? "",
    tenantIds: tenantIds && tenantIds.length > 0 ? tenantIds : undefined,
    institutionName: row.institution_name ?? undefined,
    amount: row.amount,
    period: row.period,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    status: row.status as InvoiceStatus,
    invoiceNumber: row.invoice_number,
  };
}

/** Most recent invoices only — a property accumulates one of these per tenant per billing period,
 * so a multi-year history can grow large; the dashboard only ever needs the recent ones. */
const INVOICE_LIST_LIMIT = 500;

export async function listInvoices(propertyId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, tenant_id, institution_name, amount, period, issued_at, due_at, status, invoice_number, invoice_tenants(tenant_id)")
    .eq("property_id", propertyId)
    .order("issued_at", { ascending: false })
    .limit(INVOICE_LIST_LIMIT);
  if (error) throw error;
  return (data as unknown as InvoiceRow[]).map(toInvoice);
}

/**
 * Highest existing sequence number for `year` — used to resume the client-side invoice-number
 * counter after a reload. NOTE: this counter is only safe for a single active session; it isn't
 * atomic across concurrent tabs/devices. Fine for the current pre-auth, single-landlord scope —
 * revisit with a server-side counter (e.g. an Edge Function) once multi-user access lands.
 */
export async function getMaxInvoiceSequence(propertyId: string, year: number): Promise<number> {
  const prefix = `INV-${year}-`;
  const { data, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("property_id", propertyId)
    .like("invoice_number", `${prefix}%`);
  if (error) throw error;
  let max = 0;
  for (const row of data) {
    const n = parseInt(row.invoice_number.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

export async function insertInvoice(propertyId: string, id: string, invoice: Omit<Invoice, "id">): Promise<void> {
  const { error } = await supabase.from("invoices").insert({
    id,
    property_id: propertyId,
    invoice_number: invoice.invoiceNumber,
    tenant_id: invoice.tenantId || null,
    institution_name: invoice.institutionName ?? null,
    amount: invoice.amount,
    period: invoice.period,
    issued_at: invoice.issuedAt,
    due_at: invoice.dueAt,
    status: invoice.status,
  });
  if (error) throw error;

  if (invoice.tenantIds && invoice.tenantIds.length > 0) {
    const { error: joinError } = await supabase
      .from("invoice_tenants")
      .insert(invoice.tenantIds.map((tenantId) => ({ invoice_id: id, tenant_id: tenantId })));
    if (joinError) throw joinError;
  }
}
