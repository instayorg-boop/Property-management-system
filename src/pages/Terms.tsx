import PageShell from "../components/PageShell";

const sections = [
  {
    title: "Using Instay",
    body: "You're responsible for the accuracy of the property, tenant and payment data you enter, and for keeping your account credentials secure.",
  },
  {
    title: "Billing",
    body: "The Starter plan is free. Paid plans are billed monthly and can be cancelled at any time; you'll retain access through the end of the billing period.",
  },
  {
    title: "Payments",
    body: "Instay facilitates mobile money reconciliation but is not a bank or mobile money operator. A flat 0.3% fee applies to reconciled mobile money payments.",
  },
  {
    title: "Termination",
    body: "You may close your account at any time. We may suspend accounts that violate these terms or misuse the platform.",
  },
];

export default function Terms() {
  return (
    <PageShell eyebrow="Legal" title="Terms of service" subtitle={`Last updated August 2026`} showCta={false}>
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
