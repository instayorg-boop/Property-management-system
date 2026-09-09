/**
 * SettingsContext resolves `propertyId` before any other context can even start reading its own
 * Dexie cache (every other context's fetch effect is gated on `if (!propertyId) return`). That
 * makes this one bootstrap value a single point of failure for the whole offline story — if it
 * has nowhere to come from except a live Supabase call, reloading the PWA while offline leaves
 * every page stuck on its loading skeleton forever, even though the actual tenant/room/expense
 * data is sitting right there in Dexie.
 *
 * Plain localStorage (not the Dexie cachedViews table) because this has to be readable
 * synchronously before propertyId is known — cachedViews is keyed BY propertyId.
 */
const KEY = "instay:cachedSettings";

export type CachedSettingsBootstrap = {
  property: { id: string; name: string; address: string; propertyType: string };
  settingsRow: unknown;
  properties: string[];
};

export function readSettingsCache(): CachedSettingsBootstrap | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CachedSettingsBootstrap) : null;
  } catch {
    return null;
  }
}

export function writeSettingsCache(data: CachedSettingsBootstrap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full/unavailable (private browsing) — non-fatal, just means the next offline
    // reload falls back to the loading state instead of cached settings.
  }
}
