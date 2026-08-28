const stats = [
  { value: "4 min", label: "average tenant onboarding" },
  { value: "0.3%", label: "flat fee on mobile money" },
  { value: "24/7", label: "reminders that never sleep" },
  { value: "1", label: "dashboard instead of five tools" },
];

export default function ScaleSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Built to run one building or a whole portfolio.
        </h2>
        <p className="mt-3 text-muted">
          The same system that handles a single block also rolls up occupancy and
          collections across every property you manage.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{s.value}</p>
            <p className="mt-1 text-sm text-muted">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
