import type { ReactNode } from "react";
import { cn } from "cn";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Thin wrapper around shadcn's `Sheet` — keeps this app's existing slide-over call signature
 * (`onClose`/`title`/`description`/`footer`/`headerActions`/`maxWidth`) while delegating overlay,
 * focus-trap, close button, and slide-in animation to the shared primitive.
 */
export default function SlideOver({
  onClose,
  children,
  title,
  description,
  footer,
  headerActions,
  maxWidth = "max-w-md",
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  /** Tailwind max-width class — widen for drawers with denser or multi-column content. */
  maxWidth?: string;
}) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        showCloseButton
        side="right"
        className={cn("w-full gap-0 border-l-border bg-card p-0 sm:max-w-none", maxWidth)}
      >
        {title && (
          <SheetHeader className="shrink-0 flex-row items-start justify-between gap-4 border-b border-border py-4 pr-14 pl-6">
            <div>
              <SheetTitle className="text-xl font-semibold tracking-tight text-foreground">{title}</SheetTitle>
              {description && (
                <SheetDescription className="mt-0.5 text-sm text-muted-foreground">{description}</SheetDescription>
              )}
            </div>
            {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
          </SheetHeader>
        )}

        <div className={cn("flex-1 overflow-y-auto px-6", title ? "py-5" : "py-6")}>{children}</div>

        {footer && <div className="shrink-0 border-t border-border px-6 py-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
