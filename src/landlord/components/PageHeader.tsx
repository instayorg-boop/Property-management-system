export default function PageHeader({
  title,
  description,
  align = "left",
}: {
  title: string;
  description?: string;
  /** Every page uses "left" (the default) — "center" exists for the rare page (e.g. a focused
   * single-task form like Add/Edit tenant) that reads better as a centered title. */
  align?: "left" | "center";
}) {
  return (
    <div
      className={`px-4 pt-5 pb-6 sm:px-8 ${align === "center" ? "text-center" : ""}`}
    >
      <h1 className="font-display text-2xl font-bold tracking-tight text-brand">
        {title}
      </h1>
      {description && (
        <p className="mt-1.5 text-sm text-muted">{description}</p>
      )}
    </div>
  );
}
