/**
 * Tiny stale-while-revalidate cache for the tenant portal.
 *
 * The portal is a multi-page surface a tenant taps around inside (home → history → back → home),
 * and every one of those pages needs the same three things: the resolved token, the tenant, the
 * ledger. Refetching them on every mount is what made the old portal feel like it reloaded a
 * website each tap. Here, the first fetch fills a module-level cache; every later mount renders
 * from it instantly and only revalidates in the background once the entry is older than
 * STALE_AFTER_MS. Nothing is persisted — a fresh tab refetches, which is correct for data this
 * sensitive.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Entry<T> = { value?: T; error?: unknown; ts: number; promise?: Promise<T> };

const STALE_AFTER_MS = 60_000;

const cache = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function run<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = (cache.get(key) as Entry<T>) ?? { ts: 0 };
  if (entry.promise) return entry.promise;
  const promise = fetcher()
    .then((value) => {
      cache.set(key, { value, ts: Date.now() });
      notify(key);
      return value;
    })
    .catch((error) => {
      // Keep the last good value on a failed revalidate — a flaky network shouldn't blank a page
      // the tenant is already reading.
      cache.set(key, { value: entry.value, error, ts: Date.now() });
      notify(key);
      throw error;
    });
  cache.set(key, { ...entry, promise });
  return promise;
}

/** Drops a cached entry so the next read refetches — used after a payment or a maintenance
 * submission, where the tenant's balance/report list has genuinely changed. */
export function invalidate(prefix: string) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      notify(key);
    }
  }
}

export type Cached<T> = {
  data: T | undefined;
  /** True only while there is nothing at all to show — a background revalidate never flips this,
   * so a cached page never flashes back to its skeleton. */
  loading: boolean;
  error: unknown;
  refresh: () => void;
};

export function useCached<T>(key: string | null, fetcher: () => Promise<T>): Cached<T> {
  const fetcherRef = useRef(fetcher);
  const [, forceRender] = useState(0);

  // Declared before the fetching effect below so that, on mount, that effect still sees the
  // fetcher this hook was first called with (useRef's initial value) rather than one written
  // during render — assigning a ref mid-render is the bug this replaces.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!key) return;
    const rerender = () => forceRender((n) => n + 1);
    const set = listeners.get(key) ?? new Set();
    set.add(rerender);
    listeners.set(key, set);
    return () => {
      set.delete(rerender);
      if (set.size === 0) listeners.delete(key);
    };
  }, [key]);

  useEffect(() => {
    if (!key) return;
    const entry = cache.get(key) as Entry<T> | undefined;
    const fresh = entry?.value !== undefined && Date.now() - entry.ts < STALE_AFTER_MS;
    if (fresh || entry?.promise) return;
    void run(key, () => fetcherRef.current()).catch(() => {});
  }, [key]);

  // Changes made elsewhere (the landlord logs a payment, a receipt is filed) should show up without
  // the tenant having to reload. Revalidate quietly when they come back to the tab or regain signal,
  // and every minute while the page is open and visible. The old value stays on screen throughout.
  useEffect(() => {
    if (!key) return;
    const revalidate = () => {
      if (document.visibilityState !== "visible" || navigator.onLine === false) return;
      const entry = cache.get(key) as Entry<T> | undefined;
      if (entry?.promise) return;
      if (entry?.value !== undefined && Date.now() - entry.ts < STALE_AFTER_MS) return;
      void run(key, () => fetcherRef.current()).catch(() => {});
    };
    const timer = window.setInterval(revalidate, STALE_AFTER_MS);
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
    };
  }, [key]);

  const refresh = useCallback(() => {
    if (!key) return;
    cache.delete(key);
    void run(key, () => fetcherRef.current()).catch(() => {});
  }, [key]);

  const entry = key ? (cache.get(key) as Entry<T> | undefined) : undefined;
  return {
    data: entry?.value,
    loading: !!key && entry?.value === undefined && entry?.error === undefined,
    error: entry?.error,
    refresh,
  };
}
