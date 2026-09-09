import { db } from "./db";

/** Reads a cached view-model list (e.g. this property's mapped Tenant[]) for instant first paint. */
export async function readCachedView<T>(viewKey: string, propertyId: string): Promise<T[] | null> {
  const row = await db.cachedViews.get(`${viewKey}:${propertyId}`);
  return row ? (row.data as T[]) : null;
}

/** Stores a freshly-fetched view-model list and stamps when it was synced. */
export async function writeCachedView<T>(viewKey: string, propertyId: string, data: T[]): Promise<void> {
  await db.cachedViews.put({ key: `${viewKey}:${propertyId}`, propertyId, data, syncedAt: new Date().toISOString() });
}

export async function getCachedViewSyncedAt(viewKey: string, propertyId: string): Promise<string | null> {
  const row = await db.cachedViews.get(`${viewKey}:${propertyId}`);
  return row?.syncedAt ?? null;
}
