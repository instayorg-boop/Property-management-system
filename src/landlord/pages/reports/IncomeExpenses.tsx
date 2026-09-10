import { useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import MonthSwitcher from "../../components/MonthSwitcher";
import { useExpenses } from "../../ExpensesContext";
import { useTenants } from "../../TenantsContext";
import { ReportCard, currency } from "./shared";

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function periodKeyFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** One line in the statement — either an income line (a tenant's rent) or an expense line (a
 * logged expense) — rendered identically so the two sides of the report read as one document. */
type LineItem = { label: string; sublabel?: string; amount: number };
type Section = { name: string; items: LineItem[]; total: number };

/** Category header, indented line items, then a subtotal row — the shape of an actual financial
 * statement, not a flat "category: total" summary. */
function SectionBlock({ section, tone }: { section: Section; tone: "income" | "expense" }) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink">{section.name}</p>
      <div className="mt-1 divide-y divide-line/70">
        {section.items.map((item, i) => (
          <div key={i} className="flex items-baseline justify-between py-1.5 pl-4 text-sm">
            <span className="text-muted">
              {item.label}
              {item.sublabel && <span className="text-xs text-muted/70"> · {item.sublabel}</span>}
            </span>
            <span className="text-ink">{currency(item.amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-baseline justify-between border-t border-line py-1.5 pl-4 text-sm font-semibold">
        <span className="text-ink">Subtotal</span>
        <span className={tone === "income" ? "text-emerald-600" : "text-red-600"}>{currency(section.total)}</span>
      </div>
    </div>
  );
}

export default function IncomeExpenses() {
  const { expenses, categories } = useExpenses();
  const { tenants } = useTenants();

  const [monthOffset, setMonthOffset] = useState(0);
  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const month = monthLabel(monthDate);
  const periodKey = periodKeyFor(monthDate);
  const isCurrentMonth = monthOffset === 0;

  // Rent-collected only reflects live tenant state, not a real per-month history yet — so the
  // itemized income side (who actually paid what) can only be shown for the current month, same
  // limitation the old lump-sum figure had.
  const incomeItems = useMemo<LineItem[]>(() => {
    if (!isCurrentMonth) return [];
    return tenants
      .filter((t) => t.active && (t.status === "paid" || t.status === "partial"))
      .map((t) => ({
        label: t.name,
        sublabel: t.room,
        amount: t.status === "partial" ? (t.ledger[0]?.paidAmount ?? 0) : t.rentAmount,
      }))
      .filter((item) => item.amount > 0);
  }, [tenants, isCurrentMonth]);
  const income = isCurrentMonth ? incomeItems.reduce((sum, i) => sum + i.amount, 0) : null;

  const periodExpenses = useMemo(() => expenses.filter((e) => e.date.startsWith(periodKey)), [expenses, periodKey]);
  const expensesTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const net = income === null ? null : income - expensesTotal;

  const expenseSections = useMemo<Section[]>(() => {
    return categories
      .map((c) => {
        const items = periodExpenses
          .filter((e) => e.categoryId === c.id)
          .map((e) => ({ label: e.name, amount: e.amount }));
        return { name: c.name, items, total: items.reduce((sum, i) => sum + i.amount, 0) };
      })
      .filter((s) => s.items.length > 0);
  }, [categories, periodExpenses]);

  const incomeSection: Section = { name: "Rent", items: incomeItems, total: income ?? 0 };

  return (
    <>
      <PageHeader title="Income vs expenses" description="A detailed income and expense statement, month to month." />
      <div className="px-4 sm:px-8 pb-10">
        <ReportCard title="Income vs Expenses" audience="Landlord / Accountant">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-xs text-muted">
              Every rent payment and logged expense for the period, itemized by category — the statement handed to an accountant at month end.
            </p>
            <MonthSwitcher
              month={month}
              monthOffset={monthOffset}
              onPrev={() => setMonthOffset((o) => o - 1)}
              onNext={() => setMonthOffset((o) => Math.min(0, o + 1))}
              onJumpToNow={() => setMonthOffset(0)}
            />
          </div>

          {income === null && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
              Rent-collected figures aren't tracked per past month yet — only {monthLabel(new Date())} is shown itemized. Expenses
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

          {/* Income — itemized by tenant, same shape as the expense statement below */}
          {income !== null && (
            <div className="mt-5">
              <p className="text-xs font-medium text-muted">Income</p>
              {incomeItems.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-line px-3.5 py-4 text-center text-sm text-muted">
                  No rent collected for {month}.
                </p>
              ) : (
                <div className="mt-2 rounded-lg border border-line px-3.5 py-3">
                  <SectionBlock section={incomeSection} tone="income" />
                </div>
              )}
            </div>
          )}

          {/* Expenses — one block per category: header, indented line items, subtotal */}
          <div className="mt-5">
            <p className="text-xs font-medium text-muted">Expenses</p>
            {expenseSections.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-line px-3.5 py-4 text-center text-sm text-muted">
                No expenses logged for {month}.
              </p>
            ) : (
              <div className="mt-2 space-y-4 rounded-lg border border-line px-3.5 py-3">
                {expenseSections.map((s) => (
                  <SectionBlock key={s.name} section={s} tone="expense" />
                ))}
              </div>
            )}
          </div>

          {/* Grand total — the actual bottom line of the statement */}
          <div className="mt-4 flex items-baseline justify-between rounded-lg bg-ink px-4 py-3">
            <span className="text-sm font-semibold text-paper">Net for {month}</span>
            <span className="font-display text-lg font-semibold text-paper">{net === null ? "—" : currency(net)}</span>
          </div>
        </ReportCard>
      </div>
    </>
  );
}
