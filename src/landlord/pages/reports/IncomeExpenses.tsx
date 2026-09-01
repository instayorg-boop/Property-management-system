import { useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import PageHeader from "../../components/PageHeader";
import { useExpenses } from "../../ExpensesContext";
import { useCollectedRent } from "../../TenantsContext";
import { ReportCard, currency } from "./shared";

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function periodKeyFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function IncomeExpenses() {
  const { expenses, categories } = useExpenses();
  const liveCollectedRent = useCollectedRent();

  const [monthOffset, setMonthOffset] = useState(0);
  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const month = monthLabel(monthDate);
  const periodKey = periodKeyFor(monthDate);

  // Rent-collected only reflects live tenant state, not a real per-month history yet.
  const income = monthOffset === 0 ? liveCollectedRent : null;

  const periodExpenses = useMemo(() => expenses.filter((e) => e.date.startsWith(periodKey)), [expenses, periodKey]);
  const expensesTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const net = income === null ? null : income - expensesTotal;

  const byCategory = useMemo(() => {
    return categories
      .map((c) => ({
        category: c,
        total: periodExpenses.filter((e) => e.categoryId === c.id).reduce((sum, e) => sum + e.amount, 0),
      }))
      .filter((c) => c.total > 0);
  }, [categories, periodExpenses]);

  return (
    <>
      <PageHeader title="Reports" />
      <div className="px-4 sm:px-8 pb-10">
        <ReportCard title="Income vs Expenses" audience="Landlord / Accountant">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Rent collected against every logged expense for the period — the number handed to an accountant at month end.</p>
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-paper px-1.5 py-1">
              <button
                type="button"
                onClick={() => setMonthOffset((o) => o - 1)}
                aria-label="Previous month"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
              >
                <CaretLeft size={14} weight="bold" />
              </button>
              <span className="w-32 text-center text-sm font-medium text-ink">{month}</span>
              <button
                type="button"
                onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
                disabled={monthOffset === 0}
                aria-label="Next month"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <CaretRight size={14} weight="bold" />
              </button>
            </div>
          </div>

          {income === null && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
              Rent-collected figures aren't tracked per past month yet — only {monthLabel(new Date())} is shown below. Expenses
              for {month} are still accurate.
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Rent collected</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-emerald-600">{income === null ? "—" : currency(income)}</p>
            </div>
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Expenses</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-red-600">{currency(expensesTotal)}</p>
            </div>
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Net</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{net === null ? "—" : currency(net)}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-muted">Expenses by category</p>
            {byCategory.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-line px-3.5 py-4 text-center text-sm text-muted">
                No expenses logged for {month}.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-line rounded-lg border border-line">
                {byCategory.map((c) => (
                  <div key={c.category.id} className="flex items-center justify-between px-3.5 py-2 text-sm">
                    <span className="text-ink">{c.category.name}</span>
                    <span className="text-muted">{currency(c.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ReportCard>
      </div>
    </>
  );
}
