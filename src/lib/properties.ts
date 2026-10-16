import { supabase } from "./supabaseClient";
import type { Tables } from "./database.types";
import { uploadPhoto } from "./storage";

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

export async function createProperty(name: string, address?: string, propertyType?: string, coords?: { lat: number; lng: number } | null): Promise<Property> {
  const { data: userData } = await supabase.auth.getUser();
  const baseSlug = slugify(name);
  // slug is globally unique (it is part of the tenant-facing URL), so two landlords can easily
  // pick the same property name. On a collision retry with a short random suffix.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("properties")
      .insert({ name, address, property_type: propertyType, address_lat: coords?.lat ?? null, address_lng: coords?.lng ?? null, slug, owner_id: userData.user?.id })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
  }
  throw new Error("Could not create your property. Please try again.");
}

export async function updateProperty(
  id: string,
  patch: Partial<Pick<Property, "name" | "address" | "property_type" | "logo_url" | "address_lat" | "address_lng">>
): Promise<void> {
  const { error } = await supabase.from("properties").update(patch).eq("id", id);
  if (error) throw error;
}

/** Uploads a property's logo/photo to the public property-logos bucket and points the property
 * row at it — shown in the sidebar's account card and, more importantly, on every tenant-facing
 * portal page (PortalHeader's avatarUrl). Reuses the shared uploadPhoto helper's compression/size
 * cap rather than duplicating that logic. */
export async function uploadPropertyLogo(propertyId: string, file: File): Promise<string> {
  const url = await uploadPhoto("property-logos", file, propertyId);
  await updateProperty(propertyId, { logo_url: url });
  return url;
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
  const address = (userData.user?.user_metadata?.property_address as string | undefined)?.trim() || undefined;
  const lat = userData.user?.user_metadata?.property_lat;
  const lng = userData.user?.user_metadata?.property_lng;
  return createProperty(name, address, undefined, typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null);
}
