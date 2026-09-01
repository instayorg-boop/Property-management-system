import { useMemo, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import PageHeader from "../../components/PageHeader";
import { useExpenses } from "../../ExpensesContext";
import { useCollectedRent } from "../../TenantsContext";
import { useSettings } from "../../SettingsContext";
import { ReportCard, currency } from "./shared";

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function periodKeyFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function OwnerPayoutStatement() {
  const { expenses, categoryName } = useExpenses();
  const { managementFeeRate } = useSettings();
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

  const managementFee = (grossCollected ?? 0) * managementFeeRate;
  const expensesTotal = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netToOwner = grossCollected === null ? null : grossCollected - managementFee - expensesTotal;

  return (
    <>
      <PageHeader title="Reports" />
      <div className="px-4 sm:px-8 pb-10">
        <ReportCard title="Owner Payout Statement" audience="Property Owner">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Gross rent collected minus management fees and logged expenses → net balance due to the landlord.</p>
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
                <span className="text-sm text-muted">Less management fee ({Math.round(managementFeeRate * 100)}%)</span>
                <span className="text-sm text-muted">{grossCollected === null ? "—" : `-${currency(managementFee)}`}</span>
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
