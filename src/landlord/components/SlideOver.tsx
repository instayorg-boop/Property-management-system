import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { X as CloseIcon } from "@phosphor-icons/react";

export default function SlideOver({
  onClose,
  children,
  title,
  description,
  footer,
  headerActions,
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
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
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line py-4 pr-14 pl-6">
            <div>
              <p className="font-display text-xl font-semibold tracking-tight">{title}</p>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <CloseIcon size={16} weight="bold" />
        </button>

        <div className={`flex-1 overflow-y-auto px-6 ${title ? "py-5" : "py-6"}`}>{children}</div>

        {footer && <div className="shrink-0 border-t border-line px-6 py-4">{footer}</div>}
      </motion.div>
    </div>
  );
}
