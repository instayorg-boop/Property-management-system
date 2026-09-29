import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { TrendUp, TrendDown, ArrowRight } from "@phosphor-icons/react";

export type MetricTone = "default" | "success" | "danger" | "warning";

// Every card is now a plain 1px-bordered bg-paper surface, whatever the tone — only the value
// text (via toneFlatValue below) and this icon chip carry any color, never the card background.
const toneStyles: Record<MetricTone, { icon: string }> = {
  default: { icon: "bg-brand-soft text-brand" },
  success: { icon: "bg-emerald-100 text-emerald-600" },
  danger: { icon: "bg-red-100 text-red-600" },
  warning: { icon: "bg-amber-100 text-amber-600" },
};

const trendStyles: Record<"up" | "down", string> = {
  up: "bg-emerald-50 text-emerald-600",
  down: "bg-red-50 text-red-600",
};

/** The flat layout's value color per tone — matches the emerald/red used for income and expenses
 * on the dashboard chart, so a green "collected" figure and a red "balance" figure read the same
 * way everywhere on the page. */
const toneFlatValue: Record<MetricTone, string> = {
  default: "text-ink",
  success: "text-emerald-600",
  danger: "text-red-700",
  warning: "text-amber-600",
};

export default function MetricCard({
  icon,
  label,
  value,
  trend,
  insight,
  caption,
  tone = "default",
  iconClassName,
  compact,
  flat,
  to,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  /** Small pill in the top-right, e.g. "+12%" — direction picks its color and arrow. */
  trend?: { direction: "up" | "down"; value: string };
  /** Bold one-line takeaway shown under the value, e.g. "Trending up this month". Pulls in the roomier layout — omit it for a plain count/total. */
  insight?: ReactNode;
  /** Lighter supporting line under the value (or under the insight, if given). */
  caption?: ReactNode;
  tone?: MetricTone;
  /** Override the icon chip's background/color classes instead of deriving them from `tone`. */
  iconClassName?: string;
  /** Lays out icon/label/value in one dense row. Use for a plain count with no trend or insight — the default layout wastes height on those. */
  compact?: boolean;
  /** No icon, no insight line — just label + trend on top, a big number, and one caption line. The
   * shortest layout; use for a row of stat cards where the number should carry the weight. */
  flat?: boolean;
  /** Route to navigate to on click — makes the whole card a button with hover/focus affordance. */
  to?: string;
}) {
  const t = toneStyles[tone];
  const navigate = useNavigate();

  if (flat) {
    return (
      <div
        role={to ? "button" : undefined}
        tabIndex={to ? 0 : undefined}
        onClick={to ? () => navigate(to) : undefined}
        onKeyDown={to ? (e) => (e.key === "Enter" || e.key === " ") && navigate(to) : undefined}
        className={`group rounded-lg border border-line bg-paper p-4 ${to ? "cursor-pointer transition-colors hover:border-ink/20 hover:bg-mist/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink/70">{label}</p>
          {trend && (
            <span className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${trendStyles[trend.direction]}`}>
              {trend.direction === "up" ? <TrendUp size={11} weight="bold" /> : <TrendDown size={11} weight="bold" />}
              {trend.value}
            </span>
          )}
        </div>
        <p className={`font-display mt-1.5 text-2xl font-semibold tracking-tight ${toneFlatValue[tone]}`}>{value}</p>
        {caption && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted">
            {caption}
            {to && <ArrowRight size={11} weight="bold" className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />}
          </p>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="rounded-lg border border-line bg-paper p-3.5">
        <div className="flex items-center gap-3">
          {icon && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconClassName ?? t.icon}`}>{icon}</span>}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink/70">{label}</p>
            <p className={`font-display text-xl font-bold tracking-tight ${toneFlatValue[tone]}`}>{value}</p>
          </div>
          {trend && (
            <span className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${trendStyles[trend.direction]}`}>
              {trend.direction === "up" ? <TrendUp size={11} weight="bold" /> : <TrendDown size={11} weight="bold" />}
              {trend.value}
            </span>
          )}
        </div>
        {caption && <p className="mt-2 text-xs text-muted">{caption}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconClassName ?? t.icon}`}>{icon}</span>}
          <p className="text-[13px] font-semibold text-ink/70">{label}</p>
        </div>
        {trend && (
          <span className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${trendStyles[trend.direction]}`}>
            {trend.direction === "up" ? <TrendUp size={11} weight="bold" /> : <TrendDown size={11} weight="bold" />}
            {trend.value}
          </span>
        )}
      </div>

      <p className={`font-display mt-1 text-[26px] font-semibold tracking-tight ${toneFlatValue[tone]}`}>{value}</p>

      {insight && (
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-ink">
          {insight}
        </p>
      )}
      {caption && <p className={`text-xs text-muted ${insight ? "mt-0.5" : "mt-3"}`}>{caption}</p>}
    </div>
  );
}
