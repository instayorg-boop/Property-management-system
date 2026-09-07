import { supabase } from "./supabaseClient";
import type { Tables } from "./database.types";

export type Property = Tables<"properties">;

export async function listProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `property-${Date.now()}`;
}

export async function createProperty(name: string, address?: string, propertyType?: string): Promise<Property> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("properties")
    .insert({ name, address, property_type: propertyType, slug: slugify(name), owner_id: userData.user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProperty(id: string, patch: Partial<Pick<Property, "name" | "address" | "property_type">>): Promise<void> {
  const { error } = await supabase.from("properties").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * The active property every other table (settings, rooms, tenants, invoices) is scoped to.
 * A brand-new owner has none yet, so this creates one automatically — named from whatever
 * property name they gave at sign-up (stored in their auth user_metadata), falling back to a
 * generic name if that's missing for some reason (e.g. an account created before this existed).
 */
export async function getOrCreatePrimaryProperty(): Promise<Property> {
  const existing = await listProperties();
  if (existing.length > 0) return existing[0];

  const { data: userData } = await supabase.auth.getUser();
  const name = (userData.user?.user_metadata?.property_name as string | undefined)?.trim() || "My Property";
  return createProperty(name);
}
