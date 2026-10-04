import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useExpenses } from "../ExpensesContext";
import { ArrowRight as ArrowIcon, Receipt as ReceiptIcon } from "@phosphor-icons/react";
import { formatCurrency } from "../TenantsContext";

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

type Slice = { id: string; name: string; value: number; color: string };

function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
    <div className="rounded-lg border border-line bg-paper p-5">
      <div className="flex items-center justify-center">
        <p className="text-lg text-center font-display tracking-tight  font-semibold  text-ink">Expenses this month</p>
       
      </div>

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
        <>
          {/* Chart on top, legend below — stacked rather than side-by-side. This card only has
              room to grow downward, so the donut gets to be an actual focal point instead of being
              squeezed to whatever height matches a legend column's width. */}
          <div className="mt-2 flex flex-col items-center">
            {/* Donut, not a filled pie: the hole keeps this off an angle-only read and gives a
                label somewhere to sit. The 2px paper-colored stroke between wedges is the same
                "surface gap" the rest of the app's charts use between adjacent segments. */}
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={82}
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
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
                {hovered ? (
                  <>
                    <p className="line-clamp-2 text-xs leading-tight text-muted">{hovered.name}</p>
                    <p className="mt-1 text-lg font-semibold leading-tight text-ink">
                      {formatCurrency(hovered.value)}
                    </p>
                    <p className="text-xs text-muted">{hoveredPct}%</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted">Total</p>
                    <p className="mt-0.5 text-lg font-semibold leading-tight text-ink">{formatCurrency(total)}</p>
                  </>
                )}
              </div>
            </div>

            {/* Legend, direct-labeled — every slice is named beside its swatch rather than only on
                hover, since color alone is never how identity should be conveyed. Two columns now
                that it runs the card's full width instead of a narrow side column. Each real
                category is a link straight into the expense tracker pre-filtered to it — "Other"
                stays plain text since it isn't one category to filter by. */}
            <ul className="mt-5 grid w-full grid-cols-1 gap-x-4 gap-y-2.5">
              {slices.slice(0, 6).map((s) => {
                const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                const rowContent = (
                  <>
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="min-w-0 flex-1 line-clamp-2 leading-snug text-ink">{s.name}</span>
                    <span className="shrink-0 tabular-nums leading-snug text-muted">{pct}%</span>
                  </>
                );
                return (
                  <li key={s.id} className="text-xs">
                    {s.id === "__other__" ? (
                      <div className="flex items-start gap-2">{rowContent}</div>
                    ) : (
                      <Link
                        to="/expense-tracker"
                        state={{ categoryFilter: s.id }}
                        className="flex items-start gap-2 no-underline transition-colors hover:text-brand"
                        onMouseEnter={() => setHoveredId(s.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        {rowContent}
                      </Link>
                    )}
                  </li>
                );
              })}
              {slices.length > 6 && <li className="text-[11px] text-muted">+{slices.length - 6} more</li>}
            </ul>
          </div>

          <Link
            to="/expense-tracker"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-mist py-2 text-xs font-medium text-ink transition-colors hover:bg-line/40"
          >
            View expense tracker
            <ArrowIcon size={14} weight="bold" />
          </Link>
        </>
      )}
    </div>
  );
}
