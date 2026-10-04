/**
 * Dev mode for the tenant portal, opened with `?dev=1`.
 *
 * It latches. The portal is several routes now (home → pay → success), and navigating between
 * them drops the query string, so reading `?dev=1` off the current URL only worked on whichever
 * page the link was opened at — land on `/p/:token?dev=1` and tap "Pay now" and the flag was gone
 * by the time the checkout rendered. Seeing the param once flips it on for the rest of the tab
 * session instead.
 *
 * sessionStorage, not localStorage: dev mode should die with the tab rather than quietly persist
 * on a device someone later uses as a real tenant. Turn it off with `?dev=0` or by closing the tab.
 *
 * This only controls whether the UI OFFERS to simulate a payment. The simulation itself is gated
 * server-side on the DEV_MODE_PAYMENTS function secret (see pay-portal-collect-payment), so the
 * query param alone can never fake a payment in production.
 */
const KEY = "instay-portal-dev";

export function isPortalDevMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get("dev");
    if (param === "1") {
      sessionStorage.setItem(KEY, "1");
      return true;
    }
    if (param === "0") {
      sessionStorage.removeItem(KEY);
      return false;
    }
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    // Private-mode edge cases where sessionStorage throws — fall back to the URL alone.
    return new URLSearchParams(window.location.search).get("dev") === "1";
  }
}
