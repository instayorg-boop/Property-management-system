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
 * The active property every other table (settings, rooms, tenants, invoices) is scoped to —
 * the first one this owner has, or null if they haven't finished onboarding yet. Never
 * auto-creates: a fresh landlord account with no property is what sends them to /onboarding.
 */
export async function getPrimaryProperty(): Promise<Property | null> {
  const existing = await listProperties();
  return existing[0] ?? null;
}
