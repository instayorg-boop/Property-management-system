// Single source of truth for IPM's product tiers — names, marketing copy, and which built
// features each tier unlocks. The Pricing page imports the display data from here instead of
// keeping its own copy, so the tier name shown in Settings/Header can never drift from what's
// advertised publicly. settings.subscription_plan (set manually per property, see Settings.tsx)
// is expected to hold one of PLAN_TIERS' labels going forward ("Starter" / "Growth" / "Enterprise").

export type PlanTierId = "starter" | "growth" | "enterprise";

export type PlanTier = {
  id: PlanTierId;
  label: string;
  bedRange: string;
  monthlyPrice: number;
  setupFee: number;
  priceIsFrom?: boolean;
  isFeatured?: boolean;
  features: string[];
  additionalFeatures?: string[];
};

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "starter",
    label: "Starter",
    bedRange: "Up to 80 beds",
    monthlyPrice: 799,
    setupFee: 999,
    features: [
      "Tenant & room management",
      "Automatic rent collection",
      "Rent tracking & digital receipts",
      "Automated reminders",
      "Maintenance management",
      "Reports & dashboard",
    ],
    additionalFeatures: ["Up to 200 SMS/month", "Up to 2 staff logins"],
  },
  {
    id: "growth",
    label: "Growth",
    bedRange: "81–299 beds",
    monthlyPrice: 1499,
    setupFee: 1999,
    isFeatured: true,
    features: [
      "Everything in Starter",
      "Unlimited automated reminders",
      "Advanced reports & analytics",
      "Staff attendance tracking",
      "Automatic payroll calculation",
      "Up to 5 staff logins",
    ],
    additionalFeatures: ["Increased document storage"],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    bedRange: "300+ beds",
    monthlyPrice: 2499,
    setupFee: 2999,
    priceIsFrom: true,
    features: [
      "Everything in Growth",
      "Unlimited staff logins",
      "Custom invoice & receipt branding",
      "Guided onboarding",
      "Data migration",
      "Custom pricing",
    ],
    additionalFeatures: ["Dedicated setup support", "Custom requirements"],
  },
];

export type FeatureValue = true | false | null | string;

export type FeatureSection = {
  category: string;
  features: { name: string; starter: FeatureValue; growth: FeatureValue; enterprise: FeatureValue }[];
};

export const COMPARISON_FEATURES: FeatureSection[] = [
  {
    category: "Property management",
    features: [
      { name: "Tenant management", starter: true, growth: true, enterprise: true },
      { name: "Room management", starter: true, growth: true, enterprise: true },
      { name: "Availability tracking", starter: true, growth: true, enterprise: true },
      { name: "Maintenance management", starter: true, growth: true, enterprise: true },
      { name: "Tenant records", starter: true, growth: true, enterprise: true },
    ],
  },
  {
    category: "Payments & collections",
    features: [
      { name: "Online rent collection", starter: true, growth: true, enterprise: true },
      { name: "Mobile money payments", starter: true, growth: true, enterprise: true },
      { name: "Bank payment destination", starter: true, growth: true, enterprise: true },
      { name: "Payment tracking", starter: true, growth: true, enterprise: true },
      { name: "Digital receipts", starter: true, growth: true, enterprise: true },
      { name: "Automatic late fees", starter: true, growth: true, enterprise: true },
      { name: "Automated payment reminders", starter: "Standard", growth: "Unlimited", enterprise: "Unlimited" },
    ],
  },
  {
    category: "Operations",
    features: [
      { name: "Reports & dashboard", starter: true, growth: true, enterprise: true },
      { name: "Advanced analytics", starter: false, growth: true, enterprise: true },
      { name: "Staff attendance", starter: false, growth: true, enterprise: true },
      { name: "Automatic payroll calculation", starter: false, growth: true, enterprise: true },
      { name: "Staff logins", starter: "Up to 2", growth: "Up to 5", enterprise: "Unlimited" },
      { name: "Document storage", starter: "Standard", growth: "Increased", enterprise: "Custom" },
    ],
  },
  {
    category: "Onboarding & support",
    features: [
      { name: "Standard support", starter: true, growth: true, enterprise: true },
      { name: "Guided onboarding", starter: false, growth: false, enterprise: true },
      { name: "Data migration", starter: false, growth: false, enterprise: true },
      { name: "Custom invoice & receipt branding", starter: false, growth: false, enterprise: true },
      { name: "Dedicated setup support", starter: false, growth: false, enterprise: true },
      { name: "Custom requirements", starter: false, growth: false, enterprise: true },
    ],
  },
];

/** Code-level feature keys, for gating actual sidebar/route/UI pieces. Kept separate from the
 * marketing comparison table above (which has a few string-valued rows like "Staff logins" that
 * aren't a plain on/off switch). Only lists features that are real, gateable toggles today or are
 * the obvious landing spot for ones not built yet (staffPayroll, advancedAnalytics) so wiring a
 * sidebar item or route to a tier later is a one-line `hasFeature` check, not new plumbing. */
export type FeatureKey =
  | "unlimitedReminders"
  | "advancedAnalytics"
  | "staffPayroll"
  | "customBranding"
  | "guidedOnboarding"
  | "dataMigration";

const FEATURE_FLAGS: Record<PlanTierId, Set<FeatureKey>> = {
  starter: new Set([]),
  growth: new Set(["unlimitedReminders", "advancedAnalytics", "staffPayroll"]),
  enterprise: new Set(["unlimitedReminders", "advancedAnalytics", "staffPayroll", "customBranding", "guidedOnboarding", "dataMigration"]),
};

export function hasFeature(tier: PlanTierId, feature: FeatureKey): boolean {
  return FEATURE_FLAGS[tier].has(feature);
}

export function getPlanTier(id: PlanTierId): PlanTier {
  return PLAN_TIERS.find((p) => p.id === id) ?? PLAN_TIERS[0];
}

/** Legacy/unrecognized stored labels resolve here. "Pro" was the placeholder value every existing
 * property was set to before tiers had real names — treated as Growth (the middle tier) until each
 * one is corrected individually in the database. Anything else unrecognized falls back to Starter,
 * the safest default since it unlocks the fewest gated features. */
const LEGACY_ALIASES: Record<string, PlanTierId> = {
  pro: "growth",
};

export function tierFromStoredLabel(label: string | null | undefined): PlanTierId {
  const norm = (label ?? "").trim().toLowerCase();
  const direct = PLAN_TIERS.find((p) => p.label.toLowerCase() === norm);
  if (direct) return direct.id;
  if (norm in LEGACY_ALIASES) return LEGACY_ALIASES[norm];
  return "starter";
}

export const TIER_BADGE_CLASSES: Record<PlanTierId, string> = {
  starter: "bg-slate-100 text-slate-700",
  growth: "bg-brand-soft text-brand",
  enterprise: "bg-amber-100 text-amber-700",
};
