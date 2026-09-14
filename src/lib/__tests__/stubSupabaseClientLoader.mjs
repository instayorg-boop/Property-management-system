// Test-only ESM loader hook (Node --import), never shipped/built. Stubs "./supabaseClient" so
// tenants.ts's centralized projectLedgerRows can be exercised directly by its real source under
// plain Node/tsx, without pulling in the real Supabase client — which reads `import.meta.env`,
// a Vite-only construct that doesn't exist outside the Vite dev/build pipeline and would otherwise
// throw at import time before a single test could run. No production file is modified for this.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith("supabaseClient") || specifier.endsWith("supabaseClient.ts")) {
    return { url: "virtual:stub-supabase-client", shortCircuit: true };
  }
  // sync.ts imports Dexie's `db` (needs a real IndexedDB, unavailable in Node) purely so its
  // other, unrelated exports (record_payment queueing, replay) can reference it — the one pure
  // function under test here (paymentReplayNeedsReview) never touches it, so a stub is safe.
  if (specifier === "./db") {
    return { url: "virtual:stub-offline-db", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "virtual:stub-supabase-client") {
    return { format: "module", shortCircuit: true, source: "export const supabase = {};" };
  }
  if (url === "virtual:stub-offline-db") {
    return {
      format: "module",
      shortCircuit: true,
      source: "export const db = {}; export const ACTION_PRIORITY = {};",
    };
  }
  return nextLoad(url, context);
}
