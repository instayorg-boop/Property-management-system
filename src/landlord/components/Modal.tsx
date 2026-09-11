import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { X as CloseIcon } from "@phosphor-icons/react";

export default function Modal({
  onClose,
  children,
  title,
  description,
  footer,
  maxWidth = "max-w-md",
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
        animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
        exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-ink/30 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={`relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border border-line bg-paper shadow-card ${maxWidth}`}
      >
        {/* Fixed header */}
        {title && (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">{title}</p>
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
          <CloseIcon size={16} weight="bold" />
        </button>

        {/* Scrollable body */}
        <div className={`flex-1 overflow-y-auto px-6 ${title ? "py-5" : "pt-6 pb-5"}`}>{children}</div>

        {/* Fixed footer */}
        {footer && <div className="shrink-0 border-t border-line px-6 py-4">{footer}</div>}
      </motion.div>
    </div>
  );
}
