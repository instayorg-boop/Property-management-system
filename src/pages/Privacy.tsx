import PageShell from "../components/PageShell";

const sections = [
  {
    title: "What we collect",
    body: "Account details you provide (name, email), property and tenant data you enter, and payment metadata from mobile money reconciliation. We do not store mobile money PINs or card numbers.",
  },
  {
    title: "How we use it",
    body: "To run the product — tracking rent, occupancy and reports — and to send the reminders and receipts you and your tenants rely on. We don't sell your data.",
  },
  {
    title: "Who can see it",
    body: "Only your team, based on the roles you assign. Instay staff access data only to provide support, with your permission.",
  },
  {
    title: "Your rights",
    body: "You can export or delete your account data at any time from settings, or by writing to hello@instay.app.",
  },
];

export default function Privacy() {
  return (
    <PageShell eyebrow="Legal" title="Privacy policy" subtitle={`Last updated August 2026`} showCta={false}>
      <div className="space-y-8">
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="font-display text-lg font-semibold tracking-tight">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
