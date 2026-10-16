import { motion } from "framer-motion";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  X as CloseIcon,
  Archive,
  ArrowCounterClockwise,
  ArrowsClockwise,
  ArrowsLeftRight,
  DoorOpen,
  DownloadSimple,
  Info,
  Key,
  PencilSimple,
  Plus,
  Prohibit,
  Receipt,
  SignOut,
  Tag,
  Trash,
  Wallet,
  Wrench,
  type Icon,
} from "@phosphor-icons/react";

/** Size ladder. Callers can pass either one of these keys through `maxWidth` (legacy Tailwind names
 * are mapped onto the same ladder) or any custom `max-w-*` class, which is used as-is. */
const SIZE: Record<string, string> = {
  xs: "md:max-w-[420px]", // confirmations, small pickers
  sm: "md:max-w-[480px]", // short forms, destructive confirms with context
  md: "md:max-w-[540px]", // standard create / edit forms
  lg: "md:max-w-[640px]", // details, long forms, review screens
  xl: "md:max-w-[760px]", // editors
};
const LEGACY: Record<string, keyof typeof SIZE> = {
  "max-w-sm": "xs",
  "max-w-md": "sm",
  "max-w-lg": "md",
  "max-w-xl": "lg",
  "max-w-2xl": "xl",
};

/** Every modal header carries an icon chip. Callers can pass their own `icon` (or `icon={false}` to
 * hide it); otherwise one is picked from the title so existing dialogs stay consistent without each
 * needing to opt in. Destructive actions (delete / remove / archive / void) get a red chip. */
const ICON_RULES: { test: RegExp; icon: Icon; danger?: boolean }[] = [
  { test: /\b(delete|remove|void|discard)\b/i, icon: Trash, danger: true },
  { test: /\barchive\b/i, icon: Archive, danger: true },
  { test: /move out/i, icon: SignOut },
  { test: /\bmove\b/i, icon: ArrowsLeftRight },
  { test: /reactivate/i, icon: ArrowCounterClockwise },
  { test: /reserve/i, icon: Key },
  { test: /waive|penalty/i, icon: Prohibit },
  { test: /review|sync/i, icon: ArrowsClockwise },
  { test: /payment|payout|withdraw|bank|method/i, icon: Wallet },
  { test: /charge|credit|expense|entry|invoice/i, icon: Receipt },
  { test: /categor/i, icon: Tag },
  { test: /maintenance|repair/i, icon: Wrench },
  { test: /room/i, icon: DoorOpen },
  { test: /export|download/i, icon: DownloadSimple },
  { test: /^edit|rename/i, icon: PencilSimple },
  { test: /^(add|new|create|log)\b/i, icon: Plus },
];

/** The icon that fits a title, or null when nothing matches (e.g. a drawer titled with a tenant's name). */
export function matchHeaderIcon(title: string): { Icon: Icon; danger: boolean } | null {
  const rule = ICON_RULES.find((r) => r.test.test(title));
  return rule ? { Icon: rule.icon, danger: !!rule.danger } : null;
}

function headerIcon(title: string): { Icon: Icon; danger: boolean } {
  return matchHeaderIcon(title) ?? { Icon: Info, danger: false };
}

function useIsDesktop() {
  const query = "(min-width: 768px)";
  const [matches, setMatches] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(query).matches));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return matches;
}

/** The one modal every dialog in the app is built on.
 *
 * Structure: pinned header (title, optional description, close), a body that is the only scrolling
 * region, and an optional pinned footer. Below 768px a form-sized modal is a full-screen sheet that
 * slides up; confirmation-sized modals (xs) stay centered at every width. From 768px up the card is
 * centered with a 24px margin from the viewport and never taller than `100vh - 48px`.
 *
 * Behavior: Escape closes, the page behind does not scroll, focus moves into the dialog and returns
 * to whatever opened it, and a backdrop click only closes when both mousedown and mouseup land on
 * the backdrop (so dragging a text selection out of a field never dismisses it). */
export default function Modal({
  onClose,
  children,
  title,
  description,
  icon,
  footer,
  headerActions,
  maxWidth = "max-w-md",
  disableBackdropClose = false,
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: ReactNode;
  /** Optional leading icon shown in a tinted chip beside the title. */
  icon?: ReactNode | false;
  footer?: ReactNode;
  /** Optional extra controls (e.g. a "..." menu) shown between the title and the close button.
   * Only rendered when `title` is set, since the titleless header has no room for it. */
  headerActions?: ReactNode;
  maxWidth?: string;
  /** For a flow that shouldn't be dismissed by an accidental click or key press (e.g. mid-transfer):
   * only the X button closes it then. Off by default so every other Modal caller is unaffected. */
  disableBackdropClose?: boolean;
}) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  const isDesktop = useIsDesktop();
  const autoIcon = headerIcon(title ?? "");

  const sizeKey = LEGACY[maxWidth] ?? (maxWidth in SIZE ? maxWidth : null);
  const widthClass = sizeKey ? SIZE[sizeKey] : maxWidth.startsWith("max-w-") ? `md:${maxWidth}` : maxWidth;
  // Confirmation-sized modals are small enough to look right centered on a phone, so they are not
  // blown up into a full-screen sheet.
  const centeredOnMobile = sizeKey === "xs";

  // Escape + scroll lock + focus handling.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disableBackdropClose) {
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
  }, [disableBackdropClose]);

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
    <div
      className={`fixed inset-0 z-50 flex ${centeredOnMobile ? "items-center justify-center p-5 md:p-6" : "flex-col md:items-center md:justify-center md:p-6"}`}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className={`absolute inset-0 bg-ink/40 ${centeredOnMobile ? "" : "max-md:hidden"}`}
        onMouseDown={(e) => {
          downOnBackdrop.current = e.target === e.currentTarget;
        }}
        onMouseUp={(e) => {
          if (!disableBackdropClose && downOnBackdrop.current && e.target === e.currentTarget) onClose();
          downOnBackdrop.current = false;
        }}
      />
      <motion.div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        initial={isDesktop || centeredOnMobile ? { opacity: 0, y: 12 } : { y: "100%" }}
        animate={isDesktop || centeredOnMobile ? { opacity: 1, y: 0 } : { y: 0 }}
        exit={isDesktop || centeredOnMobile ? { opacity: 0, y: 8 } : { y: "100%" }}
        transition={isDesktop || centeredOnMobile ? { duration: 0.15 } : { type: "spring", damping: 30, stiffness: 300 }}
        className={`relative flex w-full flex-col overflow-hidden bg-paper outline-none ${
          centeredOnMobile ? "max-h-[calc(100vh-40px)] rounded-md shadow-2xl" : "h-full md:h-auto md:max-h-[calc(100vh-48px)] md:rounded-md md:shadow-2xl"
        } md:border md:border-line ${widthClass}`}
      >
        {/* Pinned header */}
        {title ? (
          <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
            {icon !== false && (
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  !icon && autoIcon.danger ? "bg-red-50 text-red-600" : "bg-brand-soft text-brand"
                }`}
              >
                {icon ?? <autoIcon.Icon size={20} weight="duotone" />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="m-0 font-display text-[18px] font-bold tracking-tight text-ink">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-[12px] leading-5 text-muted">{description}</p>}
            </div>
            {headerActions}
            {closeButton}
          </div>
        ) : (
          <div className="absolute top-3 right-3 z-10">{closeButton}</div>
        )}

        {/* The only scrolling region. Scrollbar hidden; children keep their natural height. */}
        <div
          className={`flex-1 overflow-y-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${title ? "py-5" : "pt-12 pb-5"}`}
        >
          {children}
        </div>

        {/* Pinned footer. Callers lay out their own buttons; this just supplies the frame. */}
        {footer && <div className="shrink-0 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </motion.div>
    </div>,
    document.body
  );
}
