import { supabase } from "./supabaseClient";

export type PortalTenantSummary = { id: string; name: string; room: string; owedAmount: number };
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

export async function searchPortalTenants(propertySlug: string): Promise<PortalTenantSummary[]> {
  const { data, error } = await supabase.rpc("pay_portal_search_tenants", { p_property_slug: propertySlug });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, room: roomLabel(row.room), owedAmount: row.owed_amount }));
}

export async function getPortalTenant(propertySlug: string, tenantId: string): Promise<PortalTenant | null> {
  const { data, error } = await supabase.rpc("pay_portal_get_tenant", { p_property_slug: propertySlug, p_tenant_id: tenantId });
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
  const { data, error } = await supabase.rpc("pay_portal_get_ledger", { p_tenant_id: tenantId });
  if (error) throw error;
  return (data ?? []).map((row) => ({ label: row.label, amount: row.amount, paidAmount: row.paid_amount ?? undefined, status: row.status ?? undefined }));
}

export async function logPortalPayment(tenantId: string, amount: number, label?: string): Promise<void> {
  const { error } = await supabase.rpc("pay_portal_log_payment", { p_tenant_id: tenantId, p_amount: amount, p_label: label ?? "Rent payment" });
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
