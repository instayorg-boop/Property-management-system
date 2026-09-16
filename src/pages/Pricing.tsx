import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";
import { SUBSCRIPTION_TIERS, ONLINE_FEE_BANDS } from "../lib/pricing";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-none stroke-brand" strokeWidth={2}>
      <circle cx="10" cy="10" r="8.5" strokeOpacity="0.35" />
      <path d="M6.5 10.2l2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Bed-count tiers, priced for larger rental/sublet properties (roughly 50-400+ beds) rather than a
// single-landlord/single-unit market — see the commercial handover doc. Feature list is shared
// across every tier for now; the doc leaves exact per-tier feature limits to be finalized later.
const sharedFeatures = [
  "Tenant & bed/room management",
  "Rent tracking & digital receipts",
  "Automated reminders",
  "Maintenance management",
  "Reports & dashboard",
  "Staff/user access",
];

export default function Pricing() {
  return (
    <PageShell
      eyebrow="Pricing"
      title="Priced for how large rental properties actually run."
      subtitle="A monthly subscription by property size, plus a one-time setup fee — online rent collection is optional, and only costs the tenant a small fee at checkout."
      showCta={false}
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SUBSCRIPTION_TIERS.map((tier, i) => (
          <div
            key={tier.id}
            className={`flex flex-col rounded-2xl border p-6 ${
              i === 2 ? "border-brand bg-brand-soft" : "border-line bg-paper"
            }`}
          >
            {i === 2 && (
              <span className="mb-3 w-fit rounded-lg bg-brand px-2.5 py-1 text-[10px] font-semibold text-paper">
                MOST COMMON
              </span>
            )}
            <h3 className="font-display text-lg font-semibold">{tier.label}</h3>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-3xl font-semibold tracking-tight">K{tier.monthlyPriceK}</span>
              <span className="text-sm text-muted">/month</span>
            </p>
            <p className="mt-1 text-xs text-muted">+ K{tier.setupFeeK} one-time setup</p>

            <ul className="mt-5 flex-1 space-y-2.5">
              {sharedFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-ink/80">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              to="/contact"
              className={`mt-6 rounded-full px-5 py-2.5 text-center text-sm font-medium transition-transform hover:scale-[1.02] ${
                i === 2 ? "bg-brand text-paper" : "border border-line text-ink"
              }`}
            >
              Talk to us
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-line bg-paper p-6 sm:p-8">
        <h3 className="font-display text-lg font-semibold">Online rent payments</h3>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Tenants can pay rent by mobile money right from the portal. It's optional, and the fee is
          charged to the tenant at checkout, not the landlord — the rate declines as rent rises, so
          it stays reasonable at higher rent amounts.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
          {ONLINE_FEE_BANDS.map((band, i) => {
            const prevUpTo = ONLINE_FEE_BANDS[i - 1]?.upToRent;
            const label = prevUpTo ? `K${prevUpTo + 1} – K${band.upToRent}` : `Up to K${band.upToRent}`;
            return (
              <div key={band.upToRent} className="rounded-lg bg-mist px-3 py-2">
                <p className="text-xs text-muted">{label}</p>
                <p className="text-sm font-medium text-ink">{(band.rate * 100).toFixed(2)}%</p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-10 text-center text-xs text-muted">
        The one-time setup fee covers account configuration, data migration, and initial training —
        it's separate from, and in addition to, the monthly subscription.
      </p>
    </PageShell>
  );
}
