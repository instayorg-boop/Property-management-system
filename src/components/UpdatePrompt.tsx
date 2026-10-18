import { useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CircleNotch } from "@phosphor-icons/react";
import { applyUpdate, getUpdateReady, subscribeUpdate } from "../lib/pwaUpdate";

// A tenant in the middle of paying should never get an interruption, so the prompt waits until
// they are off the checkout and processing screens.
const QUIET_PATHS = /^\/p\/[^/]+\/(pay|processing)(\/|$)/;

/**
 * "A new version is ready" card, bottom right on desktop and a single line on a phone. One button
 * by design: updating is what the person wants, and a "later" option would only leave people on an
 * old build. It appears only when a newer build has already been downloaded and is waiting.
 */
export default function UpdatePrompt() {
  const ready = useSyncExternalStore(subscribeUpdate, getUpdateReady, () => false);
  const { pathname } = useLocation();
  const [updating, setUpdating] = useState(false);

  const visible = ready && !QUIET_PATHS.test(pathname);

  const update = () => {
    setUpdating(true);
    void applyUpdate().catch(() => setUpdating(false));
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed inset-x-3 bottom-3 z-[70] flex items-center gap-3 rounded-xl border border-line bg-paper px-3.5 py-3 text-ink shadow-card sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[260px] sm:flex-col sm:items-stretch sm:gap-0 sm:px-4"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <span className="truncate text-[13px] font-medium">
              <span className="sm:hidden">New version ready</span>
              <span className="hidden sm:inline">A new version is ready</span>
            </span>
          </div>
          <p className="mb-3 mt-1.5 hidden text-xs leading-relaxed text-muted sm:block">
            Update to get the latest improvements. Your work is saved.
          </p>
          <button
            type="button"
            onClick={update}
            disabled={updating}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-80 sm:self-end"
          >
            {updating && <CircleNotch size={14} className="animate-spin" aria-hidden="true" />}
            {updating ? "Updating..." : "Update now"}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
