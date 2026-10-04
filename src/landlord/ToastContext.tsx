import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, XCircle, Info, X } from "@phosphor-icons/react";

type ToastVariant = "success" | "error" | "info";
type Toast = { id: string; message: string; description?: string; variant: ToastVariant };

type ToastContextValue = {
  /** Fire-and-forget confirmation for any user action — "Tenant added", "Payment logged", etc.
   * This is the general-purpose toast every action in the app should use for feedback; it's
   * separate from SyncToast, which only ever announces offline-queue commits landing. An optional
   * second line (description) is for when the headline alone needs a bit more context. */
  showToast: (message: string, variant?: ToastVariant, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 4000;

const variantStyle: Record<ToastVariant, { icon: typeof CheckCircle; iconClass: string; iconBg: string }> = {
  success: { icon: CheckCircle, iconClass: "text-emerald-600", iconBg: "bg-emerald-50" },
  error: { icon: XCircle, iconClass: "text-red-600", iconBg: "bg-red-50" },
  info: { icon: Info, iconClass: "text-brand", iconBg: "bg-brand-soft" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = "success", description?: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, description, variant }]);
    window.setTimeout(() => dismiss(id), DURATION_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Bottom-right stack — deliberately separate from SyncToast's bottom-center single message,
          so an offline-sync confirmation and an explicit action result never fight for the same spot. */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2.5">
        <AnimatePresence>
          {toasts.map((t) => {
            const { icon: Icon, iconClass, iconBg } = variantStyle[t.variant];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto flex w-96 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-line bg-paper p-4 shadow-card"
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
                  <Icon size={18} weight="fill" className={iconClass} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-semibold text-ink">{t.message}</p>
                  {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
                >
                  <X size={14} weight="bold" />
                </button>
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
