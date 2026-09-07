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

export async function createProperty(name: string, address?: string): Promise<Property> {
  const { data, error } = await supabase
    .from("properties")
    .insert({ name, address, slug: slugify(name) })
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
 * The app is currently single-workspace: the first property created is the
 * one every other table (settings, rooms, tenants, invoices) is scoped to.
 * Creates a default property if none exists yet.
 */
export async function getOrCreatePrimaryProperty(): Promise<Property> {
  const existing = await listProperties();
  if (existing.length > 0) return existing[0];
  return createProperty("Kabulonga House", "Plot 14, Kabulonga, Lusaka");
}
