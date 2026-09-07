import type { ReactNode } from "react";
import { TrendUp, TrendDown } from "@phosphor-icons/react";

export type MetricTone = "default" | "success" | "danger" | "warning";

const toneStyles: Record<MetricTone, { card: string; icon: string; label: string }> = {
  default: { card: "border border-line bg-paper", icon: "bg-brand-soft text-brand", label: "text-ink/70" },
  success: { card: "border border-emerald-100 bg-emerald-50/60", icon: "bg-emerald-100 text-emerald-600", label: "text-emerald-700/80" },
  danger: { card: "border border-red-100 bg-red-50/60", icon: "bg-red-100 text-red-600", label: "text-red-700/80" },
  warning: { card: "border border-amber-100 bg-amber-50/60", icon: "bg-amber-100 text-amber-600", label: "text-amber-700/80" },
};

const trendStyles: Record<"up" | "down", string> = {
  up: "bg-emerald-50 text-emerald-600",
  down: "bg-red-50 text-red-600",
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
}) {
  const t = toneStyles[tone];

  if (compact) {
    return (
      <div className={`rounded-lg p-3.5 ${t.card}`}>
        <div className="flex items-center gap-3">
          {icon && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconClassName ?? t.icon}`}>{icon}</span>}
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold ${t.label}`}>{label}</p>
            <p className="font-display text-xl font-bold tracking-tight text-ink">{value}</p>
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
    <div className={`rounded-lg p-4 ${t.card}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconClassName ?? t.icon}`}>{icon}</span>}
          <p className={`text-[13px] font-semibold ${t.label}`}>{label}</p>
        </div>
        {trend && (
          <span className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${trendStyles[trend.direction]}`}>
            {trend.direction === "up" ? <TrendUp size={11} weight="bold" /> : <TrendDown size={11} weight="bold" />}
            {trend.value}
          </span>
        )}
      </div>

      <p className="mt-3 font-display text-[26px] font-bold tracking-tight text-ink">{value}</p>

      {insight && (
        <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-ink">
          {insight}
        </p>
      )}
      {caption && <p className={`text-xs text-muted ${insight ? "mt-0.5" : "mt-3"}`}>{caption}</p>}
    </div>
  );
}
