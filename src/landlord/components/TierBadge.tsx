import { Rocket, TrendUp, Crown, type Icon } from "@phosphor-icons/react";
import { tierFromStoredLabel, PLAN_TIERS, type PlanTierId } from "../../lib/plans";

/** Each tier gets its own look, not just a different fill color — Starter stays quiet and
 * utilitarian, Growth gets a brand-colored accent with an upward-trend mark, and Enterprise gets a
 * small gold/premium treatment (gradient + crown) to feel distinctly like the top of the ladder. */
type IconWeight = "regular" | "fill" | "duotone" | "bold";

const TIER_STYLE: Record<PlanTierId, { icon: Icon; className: string; iconWeight: IconWeight }> = {
  starter: {
    icon: Rocket,
    className: "bg-mist text-muted border border-line",
    iconWeight: "regular",
  },
  growth: {
    icon: TrendUp,
    className: "bg-brand-soft text-brand border border-brand/20",
    iconWeight: "bold",
  },
  enterprise: {
    icon: Crown,
    className: "border border-amber-300/60 bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-sm shadow-amber-500/30",
    iconWeight: "fill",
  },
};

/** Small badge naming the property's product tier ("Starter" / "Growth" / "Enterprise"), matching
 * the names on the public Pricing page exactly, each with its own distinct visual treatment. */
export default function TierBadge({ plan, size = "md" }: { plan: string; size?: "sm" | "md" }) {
  const tierId = tierFromStoredLabel(plan);
  const tier = PLAN_TIERS.find((p) => p.id === tierId) ?? PLAN_TIERS[0];
  const style = TIER_STYLE[tierId];
  const Icon = style.icon;
  const sizeCls = size === "sm" ? "gap-1 px-1.5 py-0.5 text-[10px]" : "gap-1.5 px-2.5 py-1 text-xs";
  const iconSize = size === "sm" ? 10 : 12;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full font-semibold ${sizeCls} ${style.className}`}>
      <Icon size={iconSize} weight={style.iconWeight} />
      {tier.label}
    </span>
  );
}
