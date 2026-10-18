import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useExpenses } from "../ExpensesContext";
import { useSettings } from "../SettingsContext";
import { supabase } from "../../lib/supabaseClient";
import { ArrowRight as ArrowIcon, Receipt as ReceiptIcon } from "@phosphor-icons/react";
import { formatCurrency } from "../TenantsContext";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
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
/** Legend rows shown below the donut: fixed regardless of how many categories exist, so the
 * card's height never grows as more categories get logged. Anything past this collapses into one
 * "+N more" row that links to the full tracker instead of the card growing to fit it. */
const VISIBLE_LEGEND_ROWS = 5;

const trendChartConfig: ChartConfig = {
  collected: { label: "Collected", color: "var(--color-success)" },
  expenses: { label: "Expenses", color: "var(--color-danger)" },
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

/** Shared by both dashboard cards below: this month's collected-online total and expenses, per
 * category for the donut and per month for the bar chart. Split into two components (not one) so
 * each gets its own full-height card instead of splitting one card's height between them. */
function useExpensesData() {
  const { expenses, categoryName, isReady } = useExpenses();

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

  return { isReady, slices, total };
}

/**
 * Expense breakdown donut — one hue per category from the app's validated categorical ramp, this
 * calendar month only so the picture matches what "Expense tracker" currently shows as open. A
 * donut, not a filled pie: the hole keeps the reader off an angle-only read and gives a label
 * somewhere to live. The legend sits stacked below it, not beside it, now that the donut has a
 * full card's width to itself.
 *
 * Deliberately no floating recharts <Tooltip>: on a chart this small a tooltip box has nowhere to
 * go that doesn't sit on top of the donut itself. Hover instead swaps the center label from
 * "Total" to that slice's own name/amount/share.
 */
export function ExpenseDonutCard() {
  const { isReady, slices, total } = useExpensesData();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long" });
  const hovered = hoveredId ? slices.find((s) => s.id === hoveredId) : undefined;
  const hoveredPct = hovered && total > 0 ? Math.round((hovered.value / total) * 100) : 0;

  return (
    <div className="flex h-full flex-col rounded-lg border border-line bg-paper p-5">
      <p className="font-display text-lg font-semibold tracking-tight text-ink">Expenses this month</p>

      {!isReady ? (
        <div className="mt-4 flex flex-1 items-center justify-center">
          <div className="h-52 w-52 animate-pulse rounded-full bg-mist" />
        </div>
      ) : slices.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
            <ReceiptIcon size={22} weight="duotone" />
          </span>
          <div>
            <p className="text-xs font-semibold text-ink">No expenses logged in {monthLabel}</p>
            <p className="mt-0.5 text-xs text-muted">Anything you log will show up here by category.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center">
          {/* Donut, bigger now that it owns the whole card's width — centered above its legend. */}
          <div className="relative mt-2 h-52 w-52 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={96}
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
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
              {hovered ? (
                <>
                  <p className="line-clamp-2 text-xs leading-tight text-muted">{hovered.name}</p>
                  <p className="mt-0.5 text-base font-semibold leading-tight text-ink">
                    {formatCurrency(hovered.value)}
                  </p>
                  <p className="text-xs text-muted">{hoveredPct}%</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted">Total</p>
                  <p className="mt-0.5 text-base font-semibold leading-tight text-ink">{formatCurrency(total)}</p>
                </>
              )}
            </div>
          </div>

          {/* Legend, stacked below the donut rather than beside it, direct-labeled and capped to
              VISIBLE_LEGEND_ROWS: every slice named beside its swatch, with anything past the cap
              folded into one "+N more" row linking to the full tracker. */}
          <ul className="mt-5 w-full max-w-xs space-y-2">
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

          <Link
            to="/expense-tracker"
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-mist py-2 text-xs font-medium text-ink transition-colors hover:bg-line/40"
          >
            View expense tracker
            <ArrowIcon size={14} weight="bold" />
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Collected vs expenses, one bar pair per month — green (collected, standing in for profit before
 * expenses are netted off) and red (expenses), so a glance says which months ran ahead and which
 * ran behind, something the earlier line chart left to line-slope-squinting. A visible Y axis
 * (unlike the old hidden one) gives the reader the actual scale, not just relative shape.
 */
type TrendMonth = { month: string; collected: number; expenses: number };

export function ExpenseTrendCard() {
  const { propertyId } = useSettings();
  const [trendMonths, setTrendMonths] = useState<3 | 6 | 12>(3);
  const [trend, setTrend] = useState<TrendMonth[]>([]);
  const [trendReady, setTrendReady] = useState(false);

  // "Collected" here is TOTAL rent collected (cash, mobile money, bank transfer — every method),
  // not just online payments: the same report_facts RPC the weekly/monthly property reports are
  // built from, so this card and those reports can never disagree about what "collected" means.
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    setTrendReady(false);
    supabase.functions
      .invoke("dashboard-collections-trend", { body: { propertyId, months: trendMonths } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load the payments vs expenses trend", error);
          setTrend([]);
          return;
        }
        setTrend((data as { months?: TrendMonth[] })?.months ?? []);
      })
      .finally(() => {
        if (!cancelled) setTrendReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, trendMonths]);
  const hasTrendData = trend.some((m) => m.collected > 0 || m.expenses > 0);

  return (
    <div className="flex h-full flex-col rounded-lg border border-line bg-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-lg font-semibold tracking-tight text-ink">Payments vs expenses</p>
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

      {!trendReady ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-32 w-full max-w-sm animate-pulse rounded-md bg-mist" />
        </div>
      ) : !hasTrendData ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-center text-xs text-muted">Not enough history yet for a trend.</p>
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={trendMonths}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mt-4 min-h-0 flex-1"
          >
            <ChartContainer config={trendChartConfig} className="aspect-auto h-full w-full">
              <BarChart data={trend} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" strokeOpacity={0.6} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} dy={6} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}`)}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--color-mist)" }}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, item) => (
                        <>
                          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: item.color }} />
                          <span className="font-semibold tabular-nums text-ink">{formatCurrency(value as number)}</span>
                          <span className="text-muted">
                            {trendChartConfig[name as keyof typeof trendChartConfig]?.label ?? name}
                          </span>
                        </>
                      )}
                    />
                  }
                />
                <Bar dataKey="collected" name="collected" fill="var(--color-success)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="expenses" name="expenses" fill="var(--color-danger)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
