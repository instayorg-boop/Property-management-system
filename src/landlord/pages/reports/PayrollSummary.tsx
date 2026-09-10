import { useMemo } from "react";
import { Warning as AlertTriangle } from "@phosphor-icons/react";
import PageHeader from "../../components/PageHeader";
import { useStaff, currency, payeFor, napsaEmployee, nhimaEmployee } from "../../StaffContext";
import { useSettings } from "../../SettingsContext";
import { ReportCard } from "./shared";

export default function PayrollSummary() {
  const { employees: allEmployees, grossPay, netPay, periodLabel, status } = useStaff();
  const { napsaInsurableEarningsCeiling } = useSettings();
  const employees = useMemo(() => allEmployees.filter((e) => e.active), [allEmployees]);

  const totals = useMemo(() => {
    const gross = employees.reduce((sum, e) => sum + grossPay(e), 0);
    const net = employees.reduce((sum, e) => sum + netPay(e), 0);
    const statutory = employees.reduce(
      (sum, e) => sum + payeFor(grossPay(e)) + napsaEmployee(grossPay(e), napsaInsurableEarningsCeiling) + nhimaEmployee(grossPay(e)),
      0
    );
    const missing = employees.filter((e) => !e.tpin || !e.nrc).length;
    return { gross, net, statutory, missing };
  }, [employees, grossPay, netPay, napsaInsurableEarningsCeiling]);

  return (
    <>
      <PageHeader title="Payroll summary" description="Summary of staff pay for the selected period." />
      <div className="px-4 sm:px-8 pb-10">
        <ReportCard title="Staff Payroll Summary" audience="Property Manager / ZRA compliance">
          <p className="text-xs text-muted">
            {periodLabel} · {status === "processed" ? "Processed" : status === "in-review" ? "In review" : "Draft — figures update as payroll is run"}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Gross pay</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{currency(totals.gross)}</p>
            </div>
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Net pay</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{currency(totals.net)}</p>
            </div>
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Statutory (PAYE + NAPSA + NHIMA)</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{currency(totals.statutory)}</p>
            </div>
          </div>

          {totals.missing > 0 && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-600">
              <AlertTriangle size={14} /> {totals.missing} employee{totals.missing === 1 ? "" : "s"} missing TPIN or NRC — fix on
              the Employees page before filing.
            </p>
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col />
                <col className="w-32" />
                <col className="w-28" />
                <col className="w-24" />
                <col className="w-24" />
              </colgroup>
              <thead className="border-b border-line bg-paper text-[11px] text-muted uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium tracking-wide">Employee</th>
                  <th className="px-6 py-4 font-medium tracking-wide">NRC</th>
                  <th className="px-6 py-4 font-medium tracking-wide">TPIN</th>
                  <th className="px-6 py-4 font-medium tracking-wide">Gross</th>
                  <th className="px-6 py-4 font-medium tracking-wide">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {employees.map((e) => (
                  <tr key={e.id} className="transition-colors duration-200 ease-in-out hover:bg-mist">
                    <td className="truncate px-6 py-4 text-ink">{e.name}</td>
                    <td className="px-6 py-4 text-muted">{e.nrc ?? "—"}</td>
                    <td className="px-6 py-4 text-muted">{e.tpin ?? "—"}</td>
                    <td className="px-6 py-4 text-muted">{currency(grossPay(e))}</td>
                    <td className="px-6 py-4 font-medium text-ink">{currency(netPay(e))}</td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-muted">
                      No active staff.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ReportCard>
      </div>
    </>
  );
}
