const before = ["Excel sheet", "WhatsApp reminders", "Mobile money app", "Paper receipts", "A notebook for staff"];

export default function ToolStrip() {
  return (
    <section className="border-y border-line bg-mist">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-muted">
          What you're probably stitching together right now
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {before.map((t) => (
            <span
              key={t}
              className="rounded-full border border-line bg-paper px-4 py-2 text-sm text-muted line-through decoration-red-300 decoration-2"
            >
              {t}
            </span>
          ))}
          <span className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper">
            → replaced by one dashboard
          </span>
        </div>
      </div>
    </section>
  );
}
