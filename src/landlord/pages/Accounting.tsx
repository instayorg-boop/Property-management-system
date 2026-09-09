import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import Select, { type SelectOption } from "../components/Select";
import ExpenseFormDrawer from "../components/ExpenseFormDrawer";
import { useExpenses, type Expense } from "../ExpensesContext";
import { useTenants, formatCurrency } from "../TenantsContext";
import {
  Paperclip,
  MagnifyingGlass,
  GearSix,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  Receipt,
  Wallet,
  ChartPieSlice,
  TrendDown,
} from "@phosphor-icons/react";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import MetricCard from "../components/MetricCard";
import Button from "../components/Button";

// Fixed categorical order — see src/index.css (--chart-series-1..8), validated for adjacent-pair
// CVD separation. The cash-flow chart (2 series) and the category donut (up to 8) each draw from
// this same fixed sequence independently — reusing a slot across unrelated charts is fine; what
// matters is never reordering it within one chart.
const CHART_SERIES = Array.from({ length: 8 }, (_, i) => `var(--chart-series-${i + 1})`);
const INCOME_COLOR = CHART_SERIES[0];
const EXPENSE_COLOR = CHART_SERIES[7];
const CATEGORY_COLORS = CHART_SERIES;

const cashFlowRangeOptions: SelectOption[] = [
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
];

function PaperclipIcon() {
  return <Paperclip size={14} weight="duotone" />;
}

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

function SettingsIcon() {
  return <GearSix size={16} weight="duotone" />;
}

const ROWS_PER_PAGE = 8;

function formatK(n: number) {
  return `K${n.toLocaleString()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function isInMonth(iso: string, label: string) {
  return monthLabel(new Date(iso)) === label;
}

function downloadCsv(filename: string, rows: Expense[], categoryName: (id: string) => string) {
  const header = ["Name", "Description", "Category", "Date", "Amount"];
  const lines = rows.map((e) =>
    [e.name, e.description ?? "", categoryName(e.categoryId), e.date, e.amount]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Manage categories ----------

function ManageCategoriesModal({ onClose }: { onClose: () => void }) {
  const { categories, addCategory, renameCategory, setCategoryActive } = useExpenses();
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <Modal
      onClose={onClose}
      title="Manage categories"
      description="Deactivating a category keeps its past expenses on record."
      footer={
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          <Button
            variant="primary"
            onClick={() => {
              if (!newName.trim()) return;
              addCategory(newName.trim());
              setNewName("");
            }}
          >
            Add
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-line px-3.5 py-2.5">
            {renamingId === c.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim()) {
                    renameCategory(c.id, renameValue.trim());
                    setRenamingId(null);
                  }
                }}
                className="flex-1 rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand"
              />
            ) : (
              <span className={`text-sm ${c.active ? "text-ink" : "text-muted line-through"}`}>{c.name}</span>
            )}

            <div className="flex items-center gap-3 text-xs">
              {renamingId === c.id ? (
                <button
                  type="button"
                  onClick={() => {
                    if (renameValue.trim()) renameCategory(c.id, renameValue.trim());
                    setRenamingId(null);
                  }}
                  className="font-medium text-brand"
                >
                  Save
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(c.id);
                    setRenameValue(c.name);
                  }}
                  className="font-medium text-muted hover:text-ink"
                >
                  Rename
                </button>
              )}
              <button
                type="button"
                onClick={() => setCategoryActive(c.id, !c.active)}
                className={`font-medium ${c.active ? "text-red-600" : "text-emerald-600"}`}
              >
                {c.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

type CashFlowMonth = { label: string; income: number; expense: number };

/** Grouped income/expense bars, last N months. Two series → always-on legend (rendered by the
 * caller, above the chart) and a per-bar hover tooltip, per the dataviz skill's interaction step. */
function CashFlowChart({ months }: { months: CashFlowMonth[] }) {
  const [hovered, setHovered] = useState<{ index: number; series: "income" | "expense" } | null>(null);

  if (months.every((m) => m.income === 0 && m.expense === 0)) {
    return (
      <div className="mt-6 flex h-48 flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
          <ChartPieSlice size={22} weight="duotone" />
        </span>
        <div>
          <p className="text-xs font-semibold text-ink">No activity yet</p>
          <p className="mt-0.5 text-xs text-muted">Rent collected and logged expenses will show up here month by month.</p>
        </div>
      </div>
    );
  }

  const maxAmount = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1);
  const chartMax = Math.ceil(maxAmount / 50000) * 50000 || maxAmount;
  const ticks = [4, 3, 2, 1, 0].map((i) => Math.round((chartMax / 4) * i));
  const hoveredMonth = hovered ? months[hovered.index] : null;

  return (
    <div className="relative mt-6 flex h-48 gap-3">
      {hoveredMonth && (
        <div className="absolute -top-1 right-0 z-10 rounded-lg border border-line bg-paper px-3 py-2 text-xs shadow-card">
          <p className="font-medium text-ink">{hoveredMonth.label}</p>
          <p className="mt-1 flex items-center gap-1.5 text-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: INCOME_COLOR }} />
            Income {formatK(hoveredMonth.income)}
          </p>
          <p className="flex items-center gap-1.5 text-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: EXPENSE_COLOR }} />
            Expenses {formatK(hoveredMonth.expense)}
          </p>
        </div>
      )}

      <div className="flex h-40 flex-col justify-between pb-6 text-right text-[11px] text-muted">
        {ticks.map((t) => (
          <span key={t}>K{(t / 1000).toFixed(0)}k</span>
        ))}
      </div>

      <div className="relative flex h-40 flex-1 items-end gap-1 border-l border-line pl-3">
        <div className="pointer-events-none absolute inset-0 left-3 flex flex-col justify-between">
          {ticks.map((t) => (
            <div key={t} className="border-t border-line/60" />
          ))}
        </div>

        {months.map((m, i) => (
          <div key={`${m.label}-${i}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div className="flex h-full w-full items-end justify-center gap-0.75">
              <div
                role="img"
                aria-label={`${m.label} income ${formatK(m.income)}`}
                onMouseEnter={() => setHovered({ index: i, series: "income" })}
                onMouseLeave={() => setHovered(null)}
                className="w-2.5 rounded-t transition-opacity"
                style={{
                  height: `${Math.max(2, (m.income / chartMax) * 100)}%`,
                  background: INCOME_COLOR,
                  opacity: hovered && hovered.index === i && hovered.series !== "income" ? 0.5 : 1,
                }}
              />
              <div
                role="img"
                aria-label={`${m.label} expenses ${formatK(m.expense)}`}
                onMouseEnter={() => setHovered({ index: i, series: "expense" })}
                onMouseLeave={() => setHovered(null)}
                className="w-2.5 rounded-t transition-opacity"
                style={{
                  height: `${Math.max(2, (m.expense / chartMax) * 100)}%`,
                  background: EXPENSE_COLOR,
                  opacity: hovered && hovered.index === i && hovered.series !== "expense" ? 0.5 : 1,
                }}
              />
            </div>
            <span className="text-[11px] text-muted">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Expense-by-category donut — a CSS conic-gradient ring (no chart library needed) plus a legend
 * that carries the actual identity (color is never the only cue: name + amount are always text). */
function ExpenseDonut({ slices, total }: { slices: { name: string; total: number; color: string }[]; total: number }) {
  if (slices.length === 0 || total === 0) {
    return (
      <div className="mt-6 flex flex-col items-center justify-center gap-3 py-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
          <ChartPieSlice size={22} weight="duotone" />
        </span>
        <p className="text-xs text-muted">No expenses logged this month.</p>
      </div>
    );
  }

  let cursor = 0;
  const stops = slices.map((s) => {
    const start = cursor;
    const pct = (s.total / total) * 100;
    cursor += pct;
    return `${s.color} ${start}% ${cursor}%`;
  });

  return (
    <div className="mt-4">
      <div
        className="relative mx-auto h-36 w-36 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
        role="img"
        aria-label={`Expense breakdown: ${slices.map((s) => `${s.name} ${formatK(s.total)}`).join(", ")}`}
      >
        <div className="absolute inset-3.5 flex flex-col items-center justify-center rounded-full bg-paper text-center">
          <p className="text-[10px] text-muted">Total</p>
          <p className="text-sm font-semibold text-ink">{formatK(total)}</p>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {slices.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-ink">{s.name}</span>
            <span className="shrink-0 text-muted">{Math.round((s.total / total) * 100)}%</span>
            <span className="shrink-0 font-medium text-ink">{formatK(s.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Accounting() {
  const { expenses, categories, categoryName, isReady } = useExpenses();
  const { tenants } = useTenants();
  const location = useLocation();
  const navigate = useNavigate();

  const [cashFlowRange, setCashFlowRange] = useState("6");

  const [monthOffset, setMonthOffset] = useState(0);
  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const month = monthLabel(monthDate);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [prefill, setPrefill] = useState<Partial<Pick<Expense, "name" | "description" | "categoryId">> | undefined>(undefined);
  const [showCategories, setShowCategories] = useState(false);

  // Arriving from a maintenance report's "Log a repair cost" — open Add expense pre-filled.
  useEffect(() => {
    const state = location.state as { expensePrefill?: typeof prefill } | null;
    if (state?.expensePrefill) {
      setEditing(null);
      setPrefill(state.expensePrefill);
      setShowForm(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const monthExpenses = useMemo(() => expenses.filter((e) => isInMonth(e.date, month)), [expenses, month]);

  const filtered = useMemo(() => {
    return monthExpenses
      .filter((e) => categoryFilter === "all" || e.categoryId === categoryFilter)
      .filter(
        (e) =>
          e.name.toLowerCase().includes(query.toLowerCase()) ||
          (e.description ?? "").toLowerCase().includes(query.toLowerCase())
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [monthExpenses, categoryFilter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const total = useMemo(() => monthExpenses.reduce((sum, e) => sum + e.amount, 0), [monthExpenses]);

  const byCategory = useMemo(() => {
    return categories
      .map((c) => ({
        category: c,
        total: monthExpenses.filter((e) => e.categoryId === c.id).reduce((sum, e) => sum + e.amount, 0),
      }))
      .filter((c) => c.category.active || c.total > 0);
  }, [categories, monthExpenses]);

  // Only trustworthy for the current month — tenant status/ledger reflect live state, not a clean
  // per-month history, so a past month here can't be reconstructed accurately.
  const rentCollected = useMemo(() => {
    if (monthOffset !== 0) return null;
    return tenants
      .filter((t) => t.active)
      .reduce((sum, t) => {
        if (t.status === "paid") return sum + t.rentAmount;
        if (t.status === "partial") return sum + (t.ledger[0]?.paidAmount ?? 0);
        return sum;
      }, 0);
  }, [tenants, monthOffset]);

  // Rent owed right now by active tenants who are behind — "Pending payments" on the stat row.
  const pending = useMemo(() => {
    const behind = tenants.filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid" || t.status === "partial"));
    return { total: behind.reduce((sum, t) => sum + t.owedAmount, 0), count: behind.length };
  }, [tenants]);

  const netProfit = rentCollected === null ? null : rentCollected - total;

  // Real income (from ledger entries, same as Dashboard's collections chart) vs logged expenses,
  // last 12 real calendar months — the "Cash flow" chart.
  const cashFlowSeries = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-US", { month: "short" }), income: 0, expense: 0 };
    });
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const t of tenants) {
      for (const row of t.ledger) {
        if (!row.createdAt || (row.status !== "paid" && row.status !== "partial")) continue;
        const created = new Date(row.createdAt);
        const bucket = byKey.get(`${created.getFullYear()}-${created.getMonth()}`);
        if (bucket) bucket.income += row.status === "partial" ? (row.paidAmount ?? 0) : row.amount;
      }
    }
    for (const e of expenses) {
      const created = new Date(e.date);
      const bucket = byKey.get(`${created.getFullYear()}-${created.getMonth()}`);
      if (bucket) bucket.expense += e.amount;
    }
    return months;
  }, [tenants, expenses]);

  // Expense breakdown donut for the selected month — same categories as the filter chips below,
  // just visualized. Caps at the palette's 8 slots; anything past that folds into "Other" rather
  // than inventing a 9th hue.
  const donutSlices = useMemo(() => {
    const sorted = [...byCategory].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
    const head = sorted.slice(0, 7);
    const rest = sorted.slice(7);
    const otherTotal = rest.reduce((sum, c) => sum + c.total, 0);
    const slices = head.map((c) => ({ name: c.category.name, total: c.total }));
    if (otherTotal > 0) slices.push({ name: "Other", total: otherTotal });
    return slices.map((s, i) => ({ ...s, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [byCategory]);

  return (
    <>
      <PageHeader title="Accounting" />

      <div className="space-y-5 px-4 sm:px-8 pb-10">
        {/* At-a-glance summary — the numbers an owner checks first, for the selected month */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!isReady ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-line bg-paper p-3.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-6 w-24" />
              </div>
            ))
          ) : (
            <>
              <MetricCard
                compact
                icon={<Wallet size={14} weight="fill" />}
                label="Total income"
                value={rentCollected === null ? "—" : formatCurrency(rentCollected)}
                caption={monthOffset === 0 ? "Collected so far this month" : "Only tracked for the current month"}
              />
              <MetricCard
                compact
                icon={<Receipt size={14} weight="fill" />}
                label="Total expenses"
                value={formatK(total)}
                caption={`${monthExpenses.length} expense${monthExpenses.length === 1 ? "" : "s"} in ${month}`}
              />
              <MetricCard
                compact
                icon={<ChartPieSlice size={14} weight="fill" />}
                label="Net profit"
                value={netProfit === null ? "—" : formatCurrency(netProfit)}
                tone={netProfit === null ? "default" : netProfit >= 0 ? "success" : "danger"}
                caption="Income minus expenses"
              />
              <MetricCard
                compact
                icon={<TrendDown size={14} weight="fill" />}
                label="Pending payments"
                value={formatCurrency(pending.total)}
                tone={pending.count > 0 ? "warning" : "default"}
                caption={pending.count > 0 ? `${pending.count} tenant${pending.count === 1 ? "" : "s"} behind` : "Nothing outstanding"}
              />
            </>
          )}
        </div>

        {/* Cash flow + expense breakdown */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-paper p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Cash flow</p>
              <Select value={cashFlowRange} onChange={setCashFlowRange} options={cashFlowRangeOptions} className="py-1.5 text-xs" />
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: INCOME_COLOR }} />
                Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: EXPENSE_COLOR }} />
                Expenses
              </span>
            </div>
            {!isReady ? (
              <div className="mt-6 flex h-48 items-end gap-3 border-l border-line pl-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="w-full" style={{ height: `${30 + ((i * 17) % 60)}%` }} />
                ))}
              </div>
            ) : (
              <CashFlowChart months={cashFlowSeries.slice(-Number(cashFlowRange))} />
            )}
          </div>

          <div className="rounded-lg border border-line bg-paper p-5">
            <p className="text-sm font-medium text-ink">Expense breakdown</p>
            <p className="text-xs text-muted">{month}</p>
            {!isReady ? (
              <div className="mt-6 flex justify-center">
                <Skeleton className="h-36 w-36 rounded-full" />
              </div>
            ) : (
              <ExpenseDonut slices={donutSlices} total={total} />
            )}
          </div>
        </div>

        {/* Month switcher + primary actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-paper px-1.5 py-1">
            <button
              type="button"
              onClick={() => setMonthOffset((o) => o - 1)}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
            >
              <CaretLeft size={14} weight="bold" />
            </button>
            <span className="w-36 text-center text-sm font-medium text-ink">{month}</span>
            <button
              type="button"
              onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
              disabled={monthOffset === 0}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <CaretRight size={14} weight="bold" />
            </button>
            {monthOffset !== 0 && (
              <button
                type="button"
                onClick={() => setMonthOffset(0)}
                className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft"
              >
                Back to this month
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="gap-1.5"
              onClick={() => downloadCsv(`expenses-${month.replace(" ", "-")}.csv`, filtered, categoryName)}
            >
              <DownloadSimple size={14} weight="bold" />
              Export
            </Button>
            <Button variant="secondary" className="gap-1.5" onClick={() => setShowCategories(true)}>
              <SettingsIcon />
              Categories
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setPrefill(undefined);
                setShowForm(true);
              }}
            >
              + Add expense
            </Button>
          </div>
        </div>

        {/* Search + category filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or description"
              className="w-56 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
        </div>

        {/* Category breakdown — doubles as the category filter, scrolls horizontally if it grows */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("all");
              setPage(1);
            }}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-left transition-colors ${
              categoryFilter === "all" ? "border-brand bg-brand-soft" : "border-line bg-paper hover:bg-mist"
            }`}
          >
            <span className="text-xs font-medium text-ink">All</span>
            <span className="text-xs text-muted">{formatK(total)}</span>
          </button>
          {byCategory.map((c) => (
            <button
              key={c.category.id}
              type="button"
              onClick={() => {
                setCategoryFilter(c.category.id);
                setPage(1);
              }}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-left transition-colors ${
                categoryFilter === c.category.id ? "border-brand bg-brand-soft" : "border-line bg-paper hover:bg-mist"
              }`}
            >
              <span className="text-xs font-medium text-ink">{c.category.name}</span>
              <span className="text-xs text-muted">{formatK(c.total)}</span>
            </button>
          ))}
        </div>

        {/* Expense table */}
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col />
              <col className="w-32" />
              <col className="w-16" />
              <col className="w-36" />
              <col className="w-24" />
              <col className="w-14" />
            </colgroup>
            <thead className="bg-mist text-xs text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium">Receipt</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {!isReady && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
              {isReady && pageRows.map((e) => (
                <tr key={e.id} className="border-t border-line transition-colors hover:bg-mist">
                  <td className="truncate px-3 py-2.5 text-ink">
                    {e.name}
                    {e.description && <span className="ml-1.5 text-xs text-muted">— {e.description}</span>}
                    {e.source === "payroll" && (
                      <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-violet-600">
                        Auto
                      </span>
                    )}
                  </td>
                  <td className="truncate px-3 py-2.5 text-muted">{categoryName(e.categoryId)}</td>
                  <td className="px-3 py-2.5">
                    {e.hasPhoto ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(e);
                          setShowForm(true);
                        }}
                        aria-label="View receipt"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-paper hover:text-ink"
                      >
                        <PaperclipIcon />
                      </button>
                    ) : (
                      <span className="text-xs text-muted/60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">{formatDate(e.date)}</td>
                  <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-ink">{formatK(e.amount)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(e);
                        setShowForm(true);
                      }}
                      className="text-xs font-medium text-brand hover:text-ink"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {isReady && pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No expenses found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-1.5 border-t border-line p-4">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                    currentPage === p ? "bg-ink text-paper" : "text-muted hover:bg-mist"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showForm && <ExpenseFormDrawer editing={editing} prefill={prefill} onClose={() => setShowForm(false)} />}
        {showCategories && <ManageCategoriesModal onClose={() => setShowCategories(false)} />}
      </AnimatePresence>
    </>
  );
}
