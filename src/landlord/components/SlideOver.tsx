import { motion } from "framer-motion";
import type { ReactNode } from "react";

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75}>
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}

export default function SlideOver({
  onClose,
  children,
  title,
  description,
  footer,
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-paper shadow-card"
      >
        {title && (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <p className="font-display text-xl font-semibold tracking-tight">{title}</p>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <CloseIcon />
        </button>

        <div className={`flex-1 overflow-y-auto px-6 ${title ? "py-5" : "py-6"}`}>{children}</div>

        {footer && <div className="shrink-0 border-t border-line px-6 py-4">{footer}</div>}
      </motion.div>
    </div>
  );
}
