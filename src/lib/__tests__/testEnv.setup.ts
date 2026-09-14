// Minimal browser-global shims so sync.ts's module-top-level side effects (window.addEventListener,
// navigator.serviceWorker?.ready) don't throw when the module is imported under plain Node for
// testing. Must be imported before any import of sync.ts — ESM evaluates sibling static imports
// top-to-bottom, so listing this import first in a test file guarantees these globals exist
// before sync.ts's own top-level code runs.
(globalThis as unknown as { window?: unknown }).window ??= { addEventListener: () => {} };
(globalThis as unknown as { navigator?: unknown }).navigator ??= {};
