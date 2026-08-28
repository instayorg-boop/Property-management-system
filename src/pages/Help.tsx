import PageShell from "../components/PageShell";

const topics = [
  {
    title: "Getting started",
    articles: ["Setting up your first property", "Adding rooms and units", "Inviting your team"],
  },
  {
    title: "Rent & payments",
    articles: ["Connecting mobile money", "Recording a cash payment", "Understanding arrears"],
  },
  {
    title: "Tenants",
    articles: ["Adding a tenant", "Managing deposits", "Setting up guardian alerts"],
  },
  {
    title: "Reports & billing",
    articles: ["Generating a monthly report", "Exporting to PDF", "Understanding your invoice"],
  },
];

export default function Help() {
  return (
    <PageShell
      eyebrow="Help center"
      title="How can we help?"
      subtitle="Browse topics below, or reach out and a real person will get back to you."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {topics.map((t) => (
          <div key={t.title} className="rounded-2xl border border-line p-5">
            <h3 className="font-display text-base font-semibold tracking-tight">{t.title}</h3>
            <ul className="mt-3 space-y-2">
              {t.articles.map((a) => (
                <li key={a}>
                  <a href="mailto:hello@instay.app" className="text-sm text-muted transition-colors hover:text-ink">
                    {a}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
