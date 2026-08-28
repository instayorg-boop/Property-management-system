import PageShell from "../components/PageShell";

export default function About() {
  return (
    <PageShell
      eyebrow="About"
      title="Built for how Zambia rents."
      subtitle="Instay started with one frustration: landlords running real businesses on WhatsApp, notebooks, and cash counted by hand."
    >
      <div className="space-y-6 text-sm leading-relaxed text-muted">
        <p>
          Most property management software is built for a different market — bank transfers,
          long leases, tenants who never miss a payment. That's not how renting works here.
          Rent is collected in cash and mobile money. Tenants move in and out fast. Landlords
          manage everything themselves, often across several buildings at once.
        </p>
        <p>
          We built Instay to match that reality: mobile money reconciliation, NAPSA-ready
          payroll, and reports that make sense to an owner who wants a straight answer, not a
          spreadsheet. One system, connected end to end, so nothing gets lost between tools.
        </p>
        <p>
          We're a small team based in Lusaka, working directly with landlords and property
          managers to build the system we wished existed.
        </p>
      </div>
    </PageShell>
  );
}
