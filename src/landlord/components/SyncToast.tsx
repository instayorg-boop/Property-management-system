import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle } from "@phosphor-icons/react";
import { db } from "../../lib/offline/db";
import { subscribeOffline } from "../../lib/offline/sync";

const ACTION_LABEL: Record<string, string> = {
  record_payment: "Payment synced",
  add_tenant_note: "Tenant note synced",
  update_tenant: "Tenant update synced",
  update_room: "Room update synced",
  update_maintenance_report: "Maintenance update synced",
};

/**
 * Mounted once at the dashboard shell — watches the offline mutation queue and pops a brief
 * confirmation the moment a queued action actually commits, per requirement 5 ("not silent").
 * Tracks which "synced" ids it's already announced so a re-render doesn't repeat the toast.
 */
export default function SyncToast() {
  const [message, setMessage] = useState<string | null>(null);
  const announced = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    const check = async () => {
      const synced = await db.mutationQueue.where("status").equals("synced").toArray();
      if (!primed.current) {
        // First read after mount: seed with whatever's already synced instead of announcing
        // a backlog of old confirmations.
        synced.forEach((a) => announced.current.add(a.id));
        primed.current = true;
        return;
      }
      for (const action of synced) {
        if (announced.current.has(action.id)) continue;
        announced.current.add(action.id);
        setMessage(ACTION_LABEL[action.type] ?? "Change synced");
        window.setTimeout(() => setMessage((m) => (m === (ACTION_LABEL[action.type] ?? "Change synced") ? null : m)), 3000);
      }
    };
    check();
    return subscribeOffline(check);
  }, []);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink shadow-card"
        >
          <CheckCircle size={16} weight="fill" className="text-emerald-600" />
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
