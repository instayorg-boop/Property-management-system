import { useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import MonthSwitcher from "../../components/MonthSwitcher";
import { useExpenses } from "../../ExpensesContext";
import { useCollectedRent } from "../../TenantsContext";
import { ReportCard, currency } from "./shared";

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function periodKeyFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function OwnerPayoutStatement() {
  const { expenses, categoryName } = useExpenses();
  const liveCollectedRent = useCollectedRent();

  const [monthOffset, setMonthOffset] = useState(0);
  // Rent-collected only reflects live tenant state, not a real per-month history yet — only
  // trustworthy for the current month. Past months show expenses (which are dated) but not rent.
  const grossCollected = monthOffset === 0 ? liveCollectedRent : null;
  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const month = monthLabel(monthDate);
  const periodKey = periodKeyFor(monthDate);

  const currentMonthExpenses = useMemo(() => expenses.filter((e) => e.date.startsWith(periodKey)), [expenses, periodKey]);

  const expensesTotal = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netToOwner = grossCollected === null ? null : grossCollected - expensesTotal;

  return (
    <>
      <PageHeader title="Payout statement" description="Review what's owed to the property owner." />
      <div className="px-4 sm:px-8 pb-10">
        <ReportCard title="Owner Payout Statement" audience="Property Owner">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-xs text-muted">Gross rent collected minus logged expenses → net balance due to the landlord.</p>
            <MonthSwitcher
              month={month}
              monthOffset={monthOffset}
              onPrev={() => setMonthOffset((o) => o - 1)}
              onNext={() => setMonthOffset((o) => Math.min(0, o + 1))}
              onJumpToNow={() => setMonthOffset(0)}
            />
          </div>

          {grossCollected === null && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
              Rent-collected figures aren't tracked per past month yet — only {monthLabel(new Date())} is shown below. Expenses
              for {month} are still accurate.
            </p>
          )}

          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <div className="divide-y divide-line">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink">Gross rent collected</span>
                <span className="text-sm font-medium text-ink">{grossCollected === null ? "—" : currency(grossCollected)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted">Less logged expenses ({currentMonthExpenses.length})</span>
                <span className="text-sm text-muted">-{currency(expensesTotal)}</span>
              </div>
              <div className="flex items-center justify-between bg-mist px-4 py-3.5">
                <span className="text-sm font-semibold text-ink">Net balance due to owner</span>
                <span className="font-display text-xl font-semibold text-ink">{netToOwner === null ? "—" : currency(netToOwner)}</span>
              </div>
            </div>
          </div>

          {currentMonthExpenses.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted">Expenses breakdown (from Expenses page)</p>
              <div className="mt-2 divide-y divide-line rounded-lg border border-line">
                {currentMonthExpenses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3.5 py-2 text-sm">
                    <span className="text-ink">{e.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-mist px-2 py-0.5 text-[11px] text-muted">{categoryName(e.categoryId)}</span>
                      <span className="text-muted">{currency(e.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ReportCard>
      </div>
    </>
  );
}
