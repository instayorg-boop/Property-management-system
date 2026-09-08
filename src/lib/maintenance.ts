import { supabase } from "./supabaseClient";
import type { Tables, TablesUpdate } from "./database.types";

export type MaintenanceStatus = "open" | "in-progress" | "resolved";

export type MaintenanceReport = {
  id: string;
  tenant: string;
  location: string;
  description: string;
  submittedAt: string;
  status: MaintenanceStatus;
  unread: boolean;
  photoUrls: string[];
  resolvedAt?: string;
};

type ReportRow = Pick<
  Tables<"maintenance_reports">,
  "id" | "tenant" | "location" | "description" | "submitted_at" | "status" | "unread" | "photo_urls" | "resolved_at"
>;

function toReport(row: ReportRow): MaintenanceReport {
  return {
    id: row.id,
    tenant: row.tenant ?? "",
    location: row.location,
    description: row.description,
    submittedAt: row.submitted_at,
    status: row.status as MaintenanceStatus,
    unread: row.unread,
    photoUrls: row.photo_urls ?? [],
    resolvedAt: row.resolved_at ?? undefined,
  };
}

/** Most recent reports only — see the matching note on `listInvoices`. */
const REPORT_LIST_LIMIT = 500;

export async function listReports(propertyId: string): Promise<MaintenanceReport[]> {
  const { data, error } = await supabase
    .from("maintenance_reports")
    .select("id, tenant, location, description, submitted_at, status, unread, photo_urls, resolved_at")
    .eq("property_id", propertyId)
    .order("submitted_at", { ascending: false })
    .limit(REPORT_LIST_LIMIT);
  if (error) throw error;
  return data.map(toReport);
}

export async function insertReport(
  propertyId: string,
  id: string,
  report: Omit<MaintenanceReport, "id" | "unread" | "resolvedAt">
): Promise<void> {
  const { error } = await supabase.from("maintenance_reports").insert({
    id,
    property_id: propertyId,
    tenant: report.tenant,
    location: report.location,
    description: report.description,
    submitted_at: report.submittedAt,
    status: report.status,
    photo_urls: report.photoUrls,
  });
  if (error) throw error;
}

export async function updateReportRow(id: string, patch: Partial<Omit<MaintenanceReport, "id">>): Promise<void> {
  const row: TablesUpdate<"maintenance_reports"> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.unread !== undefined) row.unread = patch.unread;
  if (patch.resolvedAt !== undefined) row.resolved_at = patch.resolvedAt ?? null;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.photoUrls !== undefined) row.photo_urls = patch.photoUrls;
  const { error } = await supabase.from("maintenance_reports").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteReportRow(id: string): Promise<void> {
  const { error } = await supabase.from("maintenance_reports").delete().eq("id", id);
  if (error) throw error;
}
