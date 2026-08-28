import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";

const steps = [
  {
    n: "01",
    title: "Add your properties and rooms",
    desc: "Set up each building, unit or room in minutes. Import existing tenants and leases, or start fresh.",
  },
  {
    n: "02",
    title: "Invite tenants and staff",
    desc: "Tenants get reminders on their phone. Caretakers and staff clock in from a kiosk, tied to the right property.",
  },
  {
    n: "03",
    title: "Collect rent, automatically tracked",
    desc: "Tenants pay by mobile money or cash. Every payment reconciles instantly, balances update in real time, and receipts go out on their own.",
  },
  {
    n: "04",
    title: "Reports, ready when you need them",
    desc: "Collection rates, arrears and rent roll are always up to date — export as PDF, email or WhatsApp for owners in one tap.",
  },
];

export default function HowItWorks() {
  return (
    <PageShell
      eyebrow="How it works"
      title="From scattered tools to one system, in an afternoon."
      subtitle="No migrations team, no training required. Most landlords are fully set up the same day."
    >
      <div className="space-y-4">
        {steps.map((s) => (
          <div key={s.n} className="flex gap-5 rounded-2xl border border-line p-6">
            <span className="font-display text-2xl font-semibold text-brand/70">{s.n}</span>
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link
          to="/get-started"
          className="inline-flex rounded-lg bg-brand px-6 py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
        >
          Get started free
        </Link>
      </div>
    </PageShell>
  );
}
