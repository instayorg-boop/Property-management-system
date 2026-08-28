import PageShell from "../components/PageShell";

const roles = [
  { title: "Founding Frontend Engineer", location: "Lusaka · Hybrid", team: "Engineering" },
  { title: "Customer Success Lead", location: "Lusaka", team: "Operations" },
  { title: "Product Designer", location: "Remote", team: "Design" },
];

export default function Careers() {
  return (
    <PageShell
      eyebrow="Careers"
      title="Help landlords run their properties like real businesses."
      subtitle="We're a small team building for a market most software ignores. Open roles below."
    >
      <div className="space-y-3">
        {roles.map((r) => (
          <a
            key={r.title}
            href="mailto:careers@instay.app"
            className="flex flex-col gap-1 rounded-2xl border border-line p-5 transition-colors hover:bg-mist sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 className="font-display text-base font-semibold tracking-tight">{r.title}</h3>
              <p className="mt-1 text-xs text-muted">{r.team} · {r.location}</p>
            </div>
            <span className="text-sm font-medium text-brand">Apply →</span>
          </a>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Don't see a fit?{" "}
        <a href="mailto:careers@instay.app" className="font-medium text-ink underline-offset-2 hover:underline">
          Write to us anyway
        </a>
        .
      </p>
    </PageShell>
  );
}
