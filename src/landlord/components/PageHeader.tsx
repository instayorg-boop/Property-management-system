import type { ReactNode } from "react";
import { cn } from "cn";

/** Page-level title row — title (+ optional description) on the left, an optional actions slot
 * (primary CTA, a pill, etc.) on the right, per the list-table-view archetype's header spec.
 * Token-compliant typography; no shadcn primitive to wrap (this is layout, not a control). */
export default function PageHeader({
  title,
  description,
  align = "left",
  actions,
}: {
  title: string;
  description?: string;
  /** Every page uses "left" (the default) — "center" exists for the rare page (e.g. a focused
   * single-task form like Add/Edit tenant) that reads better as a centered title. */
  align?: "left" | "center";
  /** Right-aligned slot on the title row — e.g. Accounting's payout balance pill. Only a handful of
   * pages need this, so it's optional rather than every PageHeader caller having to pass null. */
  actions?: ReactNode;
}) {
  return (
    <div className={cn("px-4 pt-5 pb-6 sm:px-8", align === "center" && "text-center")}>
      <div className={cn("flex items-start justify-between gap-3", align === "center" && "justify-center")}>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
