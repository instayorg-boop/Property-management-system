import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-none stroke-brand" strokeWidth={2}>
      <circle cx="10" cy="10" r="8.5" strokeOpacity="0.35" />
      <path d="M6.5 10.2l2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const plans = [
  {
    name: "Starter",
    price: "Free",
    blurb: "For a single property, getting off notebooks and WhatsApp.",
    features: ["Up to 10 units", "Rent collection & reminders", "Basic reports", "1 staff account"],
    cta: "Get started free",
    highlight: false,
  },
  {
    name: "Growth",
    price: "K450",
    period: "/month",
    blurb: "For landlords and managers running multiple properties.",
    features: [
      "Unlimited units",
      "Mobile money reconciliation",
      "Staff & payroll, with NAPSA",
      "Branded PDF & WhatsApp reports",
      "Up to 5 staff accounts",
    ],
    cta: "Start free trial",
    highlight: true,
  },
  {
    name: "Portfolio",
    price: "Custom",
    blurb: "For agencies and portfolios spanning many buildings.",
    features: [
      "Everything in Growth",
      "Multi-property roll-up reporting",
      "Unlimited staff accounts",
      "Dedicated onboarding & support",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <PageShell
      eyebrow="Pricing"
      title="Simple pricing, built for how Zambia rents."
      subtitle="Start free. Upgrade when you're ready to run more than one property from Instay."
      showCta={false}
    >
      <div className="grid gap-6 sm:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`flex flex-col rounded-2xl border p-6 ${
              p.highlight ? "border-brand bg-brand-soft" : "border-line bg-paper"
            }`}
          >
            {p.highlight && (
              <span className="mb-3 w-fit rounded-lg bg-brand px-2.5 py-1 text-[10px] font-semibold text-paper">
                MOST POPULAR
              </span>
            )}
            <h3 className="font-display text-lg font-semibold">{p.name}</h3>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-3xl font-semibold tracking-tight">{p.price}</span>
              {p.period && <span className="text-sm text-muted">{p.period}</span>}
            </p>
            <p className="mt-2 text-sm text-muted">{p.blurb}</p>

            <ul className="mt-5 flex-1 space-y-2.5">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-ink/80">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              to={p.cta === "Talk to us" ? "/contact" : "/get-started"}
              className={`mt-6 rounded-full px-5 py-2.5 text-center text-sm font-medium transition-transform hover:scale-[1.02] ${
                p.highlight ? "bg-brand text-paper" : "border border-line text-ink"
              }`}
            >
              {p.cta}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-muted">
        Mobile money payments carry a flat 0.3% fee. No setup fees, cancel anytime.
      </p>
    </PageShell>
  );
}
