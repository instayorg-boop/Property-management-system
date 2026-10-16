import { supabase } from "./supabaseClient";
import type { Json } from "./database.types";

// Task #12: a durable, landlord-visible activity log. Every meaningful action, financial, tenant
// record, settings, login/access, writes one row here right where it actually commits, rather
// than being reconstructed afterward from other tables. The table itself has no update or delete
// RLS policy at all (see the audit_log migration), so once written an entry is immutable even for
// the landlord who wrote it.

export type AuditAction =
  | "tenant.created"
  | "tenant.updated"
  | "tenant.archived"
  | "tenant.moved_out"
  | "tenant.reactivated"
  | "payment.logged"
  | "adjustment.added"
  | "penalty.waived"
  | "ledger_entry.voided"
  | "settings.updated"
  | "payout.requested"
  | "payout_recipient.added"
  | "subscription.changed"
  | "auth.signed_in"
  | "auth.signed_out"
  | "auth.password_changed";

export type AuditLogInput = {
  propertyId: string;
  action: AuditAction;
  summary: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Writes one row to the landlord-visible activity log. Best-effort: by the time this is called,
 * the real action has already succeeded, so a failed log write is logged to the console and
 * swallowed rather than thrown, losing one audit entry is far better than surfacing a scary error
 * for something that actually went fine.
 */
export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const actorId = userData.user?.id ?? null;
    const actorLabel =
      (userData.user?.user_metadata?.full_name as string | undefined)?.trim() || userData.user?.email || "System";

    const { error } = await supabase.from("audit_log").insert({
      property_id: input.propertyId,
      actor_id: actorId,
      actor_label: actorLabel,
      action: input.action,
      summary: input.summary,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      metadata: (input.metadata ?? {}) as Json,
    });
    if (error) console.error("[auditLog] failed to write entry", input.action, error.message);
  } catch (err) {
    console.error("[auditLog] failed to write entry", input.action, String(err));
  }
}

export type AuditLogRow = {
  id: string;
  actor_label: string;
  action: AuditAction | string;
  summary: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Json;
  created_at: string;
};

/** The Activity Log page's data source: every entry for one property, newest first. */
export async function listAuditLog(propertyId: string, limit = 200): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_label, action, summary, target_type, target_id, metadata, created_at")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
