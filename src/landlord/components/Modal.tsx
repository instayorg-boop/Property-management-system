import type { ReactNode } from "react";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Thin wrapper around shadcn's `Dialog` — keeps this app's existing centered-modal call signature
 * (`onClose`/`title`/`description`/`footer`/`maxWidth`) while delegating overlay, focus-trap, close
 * button, and open/close animation to the shared primitive. Always rendered open: callers already
 * mount/unmount this component themselves around their own open state.
 */
export default function Modal({
  onClose,
  children,
  title,
  description,
  footer,
  maxWidth = "max-w-md",
  disableBackdropClose = false,
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  /** For a flow that shouldn't be dismissed by an accidental click outside it (e.g. mid-transfer) —
   * only the X button closes it then. Off by default so every other Modal caller is unaffected. */
  disableBackdropClose?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton
        onPointerDownOutside={(e) => {
          if (disableBackdropClose) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (disableBackdropClose) e.preventDefault();
        }}
        className={cn(
          "flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border-border bg-card p-0 shadow-lg",
          maxWidth
        )}
      >
        {title && (
          <DialogHeader className="shrink-0 gap-0.5 border-b border-border px-6 py-4 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
            )}
          </DialogHeader>
        )}

        <div className={cn("flex-1 overflow-y-auto px-6", title ? "py-5" : "pt-6 pb-5")}>{children}</div>

        {footer && <div className="shrink-0 border-t border-border px-6 py-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
