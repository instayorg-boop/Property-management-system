import { motion } from "framer-motion";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X as CloseIcon } from "@phosphor-icons/react";
import { matchHeaderIcon } from "./Modal";
import { useTheme } from "../ThemeContext";

/** Right-hand panel for longer, denser work than a modal fits (a tenant's payment, a request's
 * details, a payout balance). It shares the modal's frame so the two read as one family: the same
 * pinned header with an optional icon chip, a body that is the only scrolling region, and a pinned
 * footer, plus Escape to close, a scroll lock, focus handling and a drag-safe backdrop click.
 * Full width on phones, otherwise as wide as `maxWidth` allows. */
export default function SlideOver({
  onClose,
  children,
  title,
  description,
  icon,
  footer,
  headerActions,
  maxWidth = "max-w-md",
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: ReactNode;
  /** Icon chip beside the title. Picked from the title when omitted (and only if one fits, so a
   * drawer titled with a tenant's name gets none); `false` hides it. */
  icon?: ReactNode | false;
  footer?: ReactNode;
  headerActions?: ReactNode;
  /** Tailwind max-width class — widen for drawers with denser or multi-column content. */
  maxWidth?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { isDark } = useTheme();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  const matched = title && icon === undefined ? matchHeaderIcon(title) : null;

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
    >
      <CloseIcon size={16} weight="bold" />
    </button>
  );

  // Portaled to document.body: a `fixed` element is otherwise clipped/repositioned by any ancestor
  // that sets a CSS transform (e.g. Sidebar.tsx's translate-x-0/-translate-x-full open/close
  // animation), since a transformed ancestor becomes the containing block for its fixed descendants.
  return createPortal(
    <div className={`fixed inset-0 z-50 flex justify-end ${isDark ? "theme-dark" : ""}`}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-ink/40"
        onMouseDown={(e) => {
          downOnBackdrop.current = e.target === e.currentTarget;
        }}
        onMouseUp={(e) => {
          if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
          downOnBackdrop.current = false;
        }}
      />
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 340 }}
        className={`relative flex h-full w-full ${maxWidth} flex-col border-l border-line bg-paper shadow-2xl outline-none`}
      >
        {/* Pinned header */}
        {title ? (
          <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
            {icon !== false && (icon || matched) && (
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  !icon && matched?.danger ? "bg-red-50 text-red-600" : "bg-brand-soft text-brand"
                }`}
              >
                {icon ?? (matched && <matched.Icon size={20} weight="duotone" />)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="m-0 font-display text-[18px] font-bold tracking-tight text-ink">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-[12px] leading-5 text-muted">{description}</p>}
            </div>
            {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
            {closeButton}
          </div>
        ) : (
          <div className="absolute top-3 right-3 z-10">{closeButton}</div>
        )}

        {/* The only scrolling region. Scrollbar hidden; children keep their natural height. */}
        <div className={`flex-1 overflow-y-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${title ? "py-5" : "pt-12 pb-5"}`}>
          {children}
        </div>

        {/* Pinned footer */}
        {footer && <div className="shrink-0 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </motion.div>
    </div>,
    document.body
  );
}
