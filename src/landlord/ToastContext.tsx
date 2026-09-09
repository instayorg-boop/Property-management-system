import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, XCircle, Info } from "@phosphor-icons/react";

type ToastVariant = "success" | "error" | "info";
type Toast = { id: string; message: string; variant: ToastVariant };

type ToastContextValue = {
  /** Fire-and-forget confirmation for any user action — "Tenant added", "Payment logged", etc.
   * This is the general-purpose toast every action in the app should use for feedback; it's
   * separate from SyncToast, which only ever announces offline-queue commits landing. */
  showToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 3500;

const variantStyle: Record<ToastVariant, { icon: typeof CheckCircle; iconClass: string }> = {
  success: { icon: CheckCircle, iconClass: "text-emerald-600" },
  error: { icon: XCircle, iconClass: "text-red-600" },
  info: { icon: Info, iconClass: "text-brand" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Bottom-right stack — deliberately separate from SyncToast's bottom-center single message,
          so an offline-sync confirmation and an explicit action result never fight for the same spot. */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2">
        <AnimatePresence>
          {toasts.map((t) => {
            const { icon: Icon, iconClass } = variantStyle[t.variant];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink shadow-card"
              >
                <Icon size={17} weight="fill" className={`mt-0.5 shrink-0 ${iconClass}`} />
                <span className="min-w-0">{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
