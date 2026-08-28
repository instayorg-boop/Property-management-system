import { useMemo } from "react";
import PageHeader from "../../components/PageHeader";
import { useExpenses } from "../../ExpensesContext";
import { ReportCard, currency, bedRoll } from "./shared";

const MANAGEMENT_FEE_RATE = 0.1;

export default function OwnerPayoutStatement() {
  const { expenses, categoryName } = useExpenses();

  const currentMonthExpenses = useMemo(() => expenses.filter((e) => e.date.startsWith("2026-08")), [expenses]);

  const grossCollected = useMemo(
    () => bedRoll.reduce((sum, b) => (b.status === "paid" ? sum + b.rent : sum), 0),
    []
  );

  const managementFee = grossCollected * MANAGEMENT_FEE_RATE;
  const expensesTotal = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netToOwner = grossCollected - managementFee - expensesTotal;

  return (
    <>
      <PageHeader title="Reports" />
      <div className="px-8 pb-10">
        <ReportCard title="Owner Payout Statement" audience="Property Owner">
          <p className="text-xs text-muted">Gross rent collected minus management fees and logged expenses → net balance due to the landlord.</p>

          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <div className="divide-y divide-line">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink">Gross rent collected</span>
                <span className="text-sm font-medium text-ink">{currency(grossCollected)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted">Less management fee (10%)</span>
                <span className="text-sm text-muted">-{currency(managementFee)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted">Less logged expenses ({currentMonthExpenses.length})</span>
                <span className="text-sm text-muted">-{currency(expensesTotal)}</span>
              </div>
              <div className="flex items-center justify-between bg-mist px-4 py-3.5">
                <span className="text-sm font-semibold text-ink">Net balance due to owner</span>
                <span className="font-display text-xl font-semibold text-ink">{currency(netToOwner)}</span>
              </div>
            </div>
          </div>

          {currentMonthExpenses.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted">Expenses breakdown (from Expenses page)</p>
              <div className="mt-2 divide-y divide-line rounded-lg border border-line">
                {currentMonthExpenses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3.5 py-2 text-sm">
                    <span className="text-ink">{e.description}</span>
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
