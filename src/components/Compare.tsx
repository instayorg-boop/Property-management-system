import { Link } from "react-router-dom";

function XIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 stroke-muted" strokeWidth={1.75} fill="none">
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 stroke-ink" strokeWidth={2} fill="none">
      <path d="M3.5 8.2l3 3 6-6.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 stroke-line" strokeWidth={1.75} fill="none">
      <path d="M3.5 8h9M8.5 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const rows = [
  { before: "Chasing rent on WhatsApp", after: "Auto-reminders & live arrears" },
  { before: "Cash, no receipts", after: "Mobile money & instant receipts" },
  { before: "Spreadsheets & guesswork", after: "Live books & owner reports" },
  { before: "Notebooks for staff hours", after: "Payroll that runs itself" },
  { before: "Tenants all over the place", after: "One record per tenant" },
];

export default function Compare() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          The truth behind the numbers.
        </h2>
        <p className="mt-3 text-muted">See exactly what changes when you move off cash, paper and WhatsApp.</p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-3">
        <div className="space-y-3">
          <p className="text-xs font-medium tracking-wide text-muted">THE OLD WAY</p>
          {rows.map((r) => (
            <div
              key={r.before}
              className="flex items-center gap-3 rounded-xl border border-line bg-mist px-4 py-3.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper">
                <XIcon />
              </span>
              <span className="text-sm text-muted line-through decoration-muted/50">{r.before}</span>
            </div>
          ))}
        </div>

        <div className="hidden flex-col items-center justify-center gap-3 pt-9 lg:flex">
          {rows.map((_, i) => (
            <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border border-line">
              <ArrowIcon />
            </span>
          ))}
        </div>

        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            WITH INSTAY
          </p>
          {rows.map((r) => (
            <div
              key={r.after}
              className="flex items-center gap-3 rounded-xl border border-brand-soft bg-brand-soft px-4 py-3.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20">
                <CheckIcon />
              </span>
              <span className="text-sm font-semibold text-ink">{r.after}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 text-center">
        <p className="text-muted">One system for all of it. Built for how Zambia rents.</p>
        <Link
          to="/get-started"
          className="mt-5 inline-flex rounded-lg bg-brand px-6 py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
        >
          Make the switch
        </Link>
      </div>
    </section>
  );
}
