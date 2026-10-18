import { registerSW } from "virtual:pwa-register";

/**
 * Tells the app when a newer build has been downloaded and is waiting.
 *
 * Why this exists: the service worker serves the app's code from its own cache, so after a deploy
 * a plain refresh keeps showing the OLD version until the new one is swapped in. The browser only
 * looks for a new build when a page loads, so a tab that stays open (or an installed app on a
 * phone) can sit on an old build for days. This checks on a timer and whenever the tab becomes
 * visible again, and hands the "update is waiting" fact to UpdatePrompt.
 *
 * The check fetches sw.js, which the browser always requests from the network (never from the
 * service worker's cache), so it works even though the app code itself is cached.
 */

const CHECK_EVERY_MS = 5 * 60 * 1000;

type Listener = () => void;
const listeners = new Set<Listener>();
let updateReady = false;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

function setReady(value: boolean) {
  updateReady = value;
  listeners.forEach((l) => l());
}

export function subscribeUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUpdateReady(): boolean {
  return updateReady;
}

/** Activates the waiting build and reloads onto it. Login and the offline cache are untouched:
 * only the app's code files are swapped. */
export async function applyUpdate(): Promise<void> {
  if (!updateSW) {
    window.location.reload();
    return;
  }
  await updateSW(true);
}

export function initPwaUpdates(): void {
  if (!("serviceWorker" in navigator) || updateSW) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setReady(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        // Nothing to do offline (the check would just fail), or while a build is already coming in.
        if (!navigator.onLine || registration.installing) return;
        registration.update().catch(() => undefined);
      };
      window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.addEventListener("online", check);
    },
  });
}
