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
      {/* Column on mobile — title/description first, actions below at their natural width —
          becomes the old side-by-side row from `sm` up. Squeezing a button into the same row as
          a wrapping multi-line description at phone widths is what made every page header look
          cramped; this is the one place that fixes all of them at once. */}
      <div
        className={`flex flex-col gap-3 ${
          align === "center" ? "items-center" : "sm:flex-row sm:items-start sm:justify-between"
        }`}
      >
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.025em] text-brand sm:text-[26px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-[13px] leading-5 text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
