import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { useExpenses } from "../ExpensesContext";
import { useSettings } from "../SettingsContext";
import { listCollections, type CollectionRecord } from "../../lib/payoutApi";
import { ArrowRight as ArrowIcon, Receipt as ReceiptIcon } from "@phosphor-icons/react";
import { formatCurrency } from "../TenantsContext";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "../../components/ui/chart";

/** The app's validated categorical ramp (src/index.css --chart-series-*), fixed order — never
 * cycled or reassigned per render, so a category keeps the same color across reloads and a
 * filtered view never repaints the survivors. Slot 6 (green) is skipped here: it reads as
 * "healthy/good" elsewhere in the app (see status colors), which would misleadingly flag whichever
 * expense category happened to land on it. */
const SERIES = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
  "var(--chart-series-7)",
  "var(--chart-series-8)",
];
/** Series-count ladder: past ~7 slices a legend stops being scannable, so anything beyond the top
 * 6 categories folds into one "Other" wedge rather than generating a lookalike 8th hue. */
const MAX_SLICES = 6;
const OTHER_COLOR = "var(--color-muted)";
/** Legend rows shown beside the donut: fixed regardless of how many categories exist, so the
 * card's height never grows as more categories get logged. Anything past this collapses into one
 * "+N more" row that links to the full tracker instead of the card growing to fit it. */
const VISIBLE_LEGEND_ROWS = 4;

function DashedLineIcon() {
  return (
    <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true">
      <line x1="0" y1="4" x2="16" y2="4" stroke="var(--color-expenses)" strokeWidth={2} strokeDasharray="5 3" />
    </svg>
  );
}

/** Online payments solid, Expenses dashed: the dash is a second, non-color channel so the two
 * lines stay distinguishable for a colorblind reader even if the hues read close. */
const trendChartConfig: ChartConfig = {
  online: { label: "Online payments", color: "var(--chart-series-6)" },
  expenses: { label: "Expenses", color: "var(--chart-series-8)", icon: DashedLineIcon },
};

type Slice = { id: string; name: string; value: number; color: string };

function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const TREND_PRESETS = [
  { months: 3, label: "3M" },
  { months: 6, label: "6M" },
  { months: 12, label: "1Y" },
] as const;

/**
 * Expense breakdown — replaces the maintenance-inbox preview on the dashboard overview. A donut
 * (not a filled pie: the hole keeps the reader off an angle-only read and gives a label somewhere
 * to live), one hue per category from the app's validated categorical ramp, this calendar month
 * only so the picture matches what "Expense tracker" currently shows as open.
 *
 * Deliberately no floating recharts <Tooltip>: on a chart this small a tooltip box has nowhere to
 * go that doesn't sit on top of the donut itself (or the legend beside it). Hover instead swaps
 * the center label from "Total" to that slice's own name/amount/share — the info the tooltip would
 * have shown, without ever covering anything.
 */
export default function ExpensesBreakdownCard() {
  const { expenses, categoryName, isReady } = useExpenses();
  const { propertyId } = useSettings();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Online payments only (mobile-money collections via the tenant portal): cash the landlord
  // logs manually never lands in this table, so the trend line is labeled "Online payments", not
  // "Revenue", rather than implying it covers every rent payment. It's the same data the Online
  // payments card's own "Recent transactions" list already draws on.
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [trendMonths, setTrendMonths] = useState<3 | 6 | 12>(3);
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    listCollections(propertyId, { status: ["successful"], limit: 500 })
      .then((rows) => {
        if (!cancelled) setCollections(rows);
      })
      .catch((e) => console.error("Failed to load collections for the trend chart", e));
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const trend = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: trendMonths }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (trendMonths - 1 - i), 1);
      return { key: currentMonthKey(d), label: d.toLocaleDateString("en-GB", { month: "short" }) };
    });

    const collectedByMonth = new Map<string, number>();
    for (const c of collections) collectedByMonth.set(c.createdAt.slice(0, 7), (collectedByMonth.get(c.createdAt.slice(0, 7)) ?? 0) + c.amount);

    const expensesByMonth = new Map<string, number>();
    for (const e of expenses) expensesByMonth.set(e.date.slice(0, 7), (expensesByMonth.get(e.date.slice(0, 7)) ?? 0) + e.amount);

    return months.map((m) => ({
      month: m.label,
      online: Math.round(collectedByMonth.get(m.key) ?? 0),
      expenses: Math.round(expensesByMonth.get(m.key) ?? 0),
    }));
  }, [collections, expenses, trendMonths]);
  const hasTrendData = trend.some((m) => m.online > 0 || m.expenses > 0);

  const { slices, total } = useMemo(() => {
    const monthKey = currentMonthKey();
    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      if (!e.date.startsWith(monthKey)) continue;
      byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + e.amount);
    }
    const ranked = [...byCategory.entries()]
      .map(([id, value]) => ({ id, name: categoryName(id), value }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);

    const top = ranked.slice(0, MAX_SLICES).map((s, i): Slice => ({ ...s, color: SERIES[i] }));
    const rest = ranked.slice(MAX_SLICES);
    const restTotal = rest.reduce((sum, s) => sum + s.value, 0);
    const withOther: Slice[] =
      restTotal > 0 ? [...top, { id: "__other__", name: "Other", value: restTotal, color: OTHER_COLOR }] : top;

    return { slices: withOther, total: withOther.reduce((sum, s) => sum + s.value, 0) };
  }, [expenses, categoryName]);

  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long" });
  const hovered = hoveredId ? slices.find((s) => s.id === hoveredId) : undefined;
  const hoveredPct = hovered && total > 0 ? Math.round((hovered.value / total) * 100) : 0;

  return (
    <div className="flex h-full flex-col rounded-lg border border-line bg-paper p-5">
      <p className="font-display text-lg font-semibold tracking-tight text-ink">Expenses this month</p>

      {!isReady ? (
        <div className="mt-4 flex items-center justify-center py-10">
          <div className="h-44 w-44 animate-pulse rounded-full bg-mist" />
        </div>
      ) : slices.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
            <ReceiptIcon size={22} weight="duotone" />
          </span>
          <div>
            <p className="text-xs font-semibold text-ink">No expenses logged in {monthLabel}</p>
            <p className="mt-0.5 text-xs text-muted">Anything you log will show up here by category.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          {/* Donut beside its legend rather than stacked above it: the legend is capped to a
              fixed row count (VISIBLE_LEGEND_ROWS) below, so this side-by-side block holds a
              constant height no matter how many categories get logged over time. flex-1 so it
              claims half the card's height, matching the trend block below it. */}
          <div className="mt-3 flex flex-1 items-center gap-5">
            {/* Donut, not a filled pie: the hole keeps this off an angle-only read and gives a
                label somewhere to sit. The 2px paper-colored stroke between wedges is the same
                "surface gap" the rest of the app's charts use between adjacent segments. */}
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={74}
                    startAngle={90}
                    endAngle={-270}
                    stroke="var(--color-paper)"
                    strokeWidth={2}
                    paddingAngle={slices.length > 1 ? 1.5 : 0}
                    isAnimationActive={false}
                    onMouseEnter={(_, i) => setHoveredId(slices[i]?.id ?? null)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {slices.map((s) => (
                      <Cell
                        key={s.id}
                        fill={s.color}
                        opacity={hoveredId && hoveredId !== s.id ? 0.35 : 1}
                        style={{ transition: "opacity 120ms ease", cursor: "default" }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center label: the month's total by default, that slice's own figure on hover — see
                  the file header for why this replaces a floating tooltip. */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                {hovered ? (
                  <>
                    <p className="line-clamp-2 text-[10px] leading-tight text-muted">{hovered.name}</p>
                    <p className="mt-0.5 text-sm font-semibold leading-tight text-ink">
                      {formatCurrency(hovered.value)}
                    </p>
                    <p className="text-[10px] text-muted">{hoveredPct}%</p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-muted">Total</p>
                    <p className="mt-0.5 text-sm font-semibold leading-tight text-ink">{formatCurrency(total)}</p>
                  </>
                )}
              </div>
            </div>

            {/* Legend, direct-labeled and capped to VISIBLE_LEGEND_ROWS: every slice named beside
                its swatch rather than relying on color alone, with anything past the cap folded
                into one "+N more" row linking to the full tracker instead of growing the card. */}
            <ul className="min-w-0 flex-1 space-y-2.5">
              {slices.slice(0, VISIBLE_LEGEND_ROWS).map((s) => {
                const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                const rowContent = (
                  <>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1 truncate text-ink">{s.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">{pct}%</span>
                  </>
                );
                return (
                  <li key={s.id} className="text-xs">
                    {s.id === "__other__" ? (
                      <div className="flex items-center gap-2">{rowContent}</div>
                    ) : (
                      <Link
                        to="/expense-tracker"
                        state={{ categoryFilter: s.id }}
                        className="flex items-center gap-2 no-underline transition-colors hover:text-brand"
                        onMouseEnter={() => setHoveredId(s.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        {rowContent}
                      </Link>
                    )}
                  </li>
                );
              })}
              {slices.length > VISIBLE_LEGEND_ROWS && (
                <li className="text-xs">
                  <Link to="/expense-tracker" className="flex items-center gap-1 text-muted transition-colors hover:text-brand">
                    +{slices.length - VISIBLE_LEGEND_ROWS} more
                    <ArrowIcon size={11} weight="bold" />
                  </Link>
                </li>
              )}
            </ul>
          </div>

          <Link
            to="/expense-tracker"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-mist py-2 text-xs font-medium text-ink transition-colors hover:bg-line/40"
          >
            View expense tracker
            <ArrowIcon size={14} weight="bold" />
          </Link>

          {/* Online payments vs expenses: a second, different kind of chart in this same card
              rather than a second donut, so the card earns the vertical room the first chart
              already claims instead of leaving it blank. flex-1 so it claims the other half of
              the card's height, matching the donut block above it. */}
          <div className="mt-5 flex flex-1 flex-col border-t border-line/70 pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Payments vs expenses</p>
              <div className="flex items-center gap-0.5 rounded-lg bg-mist p-0.5">
                {TREND_PRESETS.map((p) => (
                  <button
                    key={p.months}
                    type="button"
                    onClick={() => setTrendMonths(p.months)}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                      trendMonths === p.months ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {!hasTrendData ? (
              <p className="py-8 text-center text-xs text-muted">Not enough history yet for a trend.</p>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={trendMonths}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="mt-2 min-h-0 flex-1"
                >
                  <ChartContainer config={trendChartConfig} className="aspect-auto h-full w-full">
                    <LineChart data={trend} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" strokeOpacity={0.6} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} dy={6} />
                  <YAxis hide domain={[0, "auto"]} />
                  <ChartTooltip
                    cursor={{ stroke: "var(--color-line)", strokeWidth: 1 }}
                    content={
                      <ChartTooltipContent
                        formatter={(value, name, item) => (
                          <>
                            <span className="h-0.5 w-3.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
                            <span className="font-semibold tabular-nums text-ink">{formatCurrency(value as number)}</span>
                            <span className="text-muted">
                              {trendChartConfig[name as keyof typeof trendChartConfig]?.label ?? name}
                            </span>
                          </>
                        )}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="online"
                    name="online"
                    stroke="var(--color-online)"
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, stroke: "var(--color-paper)", fill: "var(--color-online)" }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--color-paper)" }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="expenses"
                    stroke="var(--color-expenses)"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ r: 4, strokeWidth: 2, stroke: "var(--color-paper)", fill: "var(--color-expenses)" }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--color-paper)" }}
                    isAnimationActive={false}
                  />
                      <ChartLegend content={<ChartLegendContent />} />
                    </LineChart>
                  </ChartContainer>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
