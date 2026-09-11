import type { ReactNode } from "react";

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
    <div
      className={`px-4 pt-5 pb-6 sm:px-8 ${align === "center" ? "text-center" : ""}`}
    >
      <div className={`flex items-start justify-between gap-3 ${align === "center" ? "justify-center" : ""}`}>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-sm text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
