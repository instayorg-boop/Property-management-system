import { supabase } from "./supabaseClient";
import type { Tables } from "./database.types";

export type NotificationRow = Tables<"notifications">;
export type NotificationCategory = "payment" | "maintenance" | "payout" | "overdue" | "system";

const PAGE_SIZE = 50;

export async function listNotifications(propertyId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(propertyId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("property_id", propertyId)
    .is("read_at", null);
  if (error) throw error;
}
