import PageShell from "../components/PageShell";

const services = [
  { name: "Web app", status: "Operational" },
  { name: "API", status: "Operational" },
  { name: "Mobile money reconciliation", status: "Operational" },
  { name: "Report generation", status: "Operational" },
  { name: "Notifications (SMS/WhatsApp)", status: "Operational" },
];

export default function Status() {
  return (
    <PageShell eyebrow="Status" title="All systems operational." showCta={false}>
      <div className="overflow-hidden rounded-2xl border border-line">
        {services.map((s, i) => (
          <div
            key={s.name}
            className={`flex items-center justify-between px-5 py-4 ${i !== services.length - 1 ? "border-b border-line" : ""}`}
          >
            <span className="text-sm text-ink">{s.name}</span>
            <span className="flex items-center gap-2 text-xs font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {s.status}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Last checked just now. Historical incidents are shared here as they happen.
      </p>
    </PageShell>
  );
}
