import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Users,
  Wallet,
  Landmark,
  FileText,
  SlidersHorizontal,
  Lock,
  Banknote,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import Select from "../components/Select";
import { useExpenses } from "../ExpensesContext";
import {
  useStaff,
  currency,
  allowanceTotal,
  deductionsTotal,
  napsaEmployee,
  nhimaEmployee,
  payeFor,
  CURRENT_PERIOD_LABEL,
  type Employee,
  type PayrollRun,
} from "../StaffContext";

const SDL_RATE = 0.005;

const periodOptions = [
  { value: "aug-2026", label: "August 2026" },
  { value: "jul-2026", label: "July 2026" },
  { value: "jun-2026", label: "June 2026" },
];

const statusMeta = {
  draft: { label: "Draft", style: "bg-amber-50 text-amber-600" },
  "in-review": { label: "In Review", style: "bg-sky-50 text-sky-600" },
  processed: { label: "Processed", style: "bg-emerald-50 text-emerald-600" },
} as const;

const pageTabs = [
  { value: "run", label: "Run payroll" },
  { value: "history", label: "History" },
] as const;
type PageTab = (typeof pageTabs)[number]["value"];

function TpinAlert({ employee }: { employee: Employee }) {
  if (employee.tpin && employee.nrc) return null;
  return (
    <span title="Missing TPIN or NRC — fix on the Employees page">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
    </span>
  );
}

function TaxBreakdownCard({ employee, gross, basic }: { employee: Employee; gross: number; basic: number }) {
  const napsa = napsaEmployee(gross);
  const nhima = nhimaEmployee(basic);
  const tax = payeFor(gross);
  const ded = deductionsTotal(employee);
  const net = Math.max(0, gross - tax - napsa - nhima - ded);

  const Row = ({ label, value, muted }: { label: string; value: string; muted?: boolean }) => (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className={muted ? "text-muted" : "text-ink"}>{label}</span>
      <span className={muted ? "text-muted" : "font-medium text-ink"}>{value}</span>
    </div>
  );

  return (
    <div className="rounded-xl border border-line bg-mist p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Live tax breakdown</p>
      <div className="mt-1 divide-y divide-line">
        <Row label="Gross salary (basic + allowances)" value={currency(gross)} />
        <Row label="Less NAPSA (5%, capped K1,861.80)" value={`-${currency(napsa)}`} muted />
        <Row label="Less NHIMA (1% of basic)" value={`-${currency(nhima)}`} muted />
        <Row label="Less PAYE (progressive)" value={`-${currency(tax)}`} muted />
        {ded > 0 && <Row label="Less custom deductions" value={`-${currency(ded)}`} muted />}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-paper px-3 py-2.5">
        <span className="text-sm font-medium text-ink">Net salary</span>
        <span className="font-display text-lg font-semibold text-ink">{currency(net)}</span>
      </div>
    </div>
  );
}

function EmployeeDrawer({
  employee,
  gross,
  basic,
  hours,
  locked,
  onClose,
  onUpdateDeduction,
}: {
  employee: Employee;
  gross: number;
  basic: number;
  hours: { hours: number; overtimeHours: number } | null;
  locked: boolean;
  onClose: () => void;
  onUpdateDeduction: (key: keyof Employee["deductions"], value: number) => void;
}) {
  const inputCls =
    "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-mist disabled:text-muted";

  return (
    <SlideOver onClose={onClose} title={employee.name} description={employee.role}>
      <div className="flex flex-wrap items-center gap-2">
        {employee.payType === "monthly" ? (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600">Monthly Fixed</span>
        ) : (
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-600">Hourly Rate</span>
        )}
        {(!employee.tpin || !employee.nrc) && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
            <AlertTriangle className="h-3 w-3" /> Missing {!employee.tpin ? "TPIN" : "NRC"}
          </span>
        )}
      </div>

      {employee.payType === "hourly" && hours && (
        <div className="mt-4 rounded-lg bg-mist px-3.5 py-2.5 text-sm text-muted">
          {hours.hours + hours.overtimeHours} hours logged for {CURRENT_PERIOD_LABEL}
          {hours.overtimeHours > 0 && ` (${hours.overtimeHours} overtime)`} — edit on the Clock page.
        </div>
      )}

      {allowanceTotal(employee) > 0 && (
        <div className="mt-4 rounded-lg bg-mist px-3.5 py-2.5 text-sm text-muted">
          K{allowanceTotal(employee).toLocaleString()} in standing allowances — edit on the Employees page.
        </div>
      )}

      <p className="mt-6 text-sm font-medium text-ink">Custom deductions this cycle</p>
      <div className="mt-2 space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Salary advance (K)</label>
          <input
            type="number"
            min={0}
            disabled={locked}
            value={employee.deductions.advance}
            onChange={(e) => onUpdateDeduction("advance", Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Loan repayment (K)</label>
          <input
            type="number"
            min={0}
            disabled={locked}
            value={employee.deductions.loan}
            onChange={(e) => onUpdateDeduction("loan", Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-6">
        <TaxBreakdownCard employee={employee} gross={gross} basic={basic} />
      </div>
    </SlideOver>
  );
}

function FilingDrawer({ run, onClose, onSavePrns }: { run: PayrollRun; onClose: () => void; onSavePrns: (p: PayrollRun["prns"]) => void }) {
  const [prns, setPrns] = useState(run.prns);

  return (
    <SlideOver
      onClose={onClose}
      title={run.period}
      description="Government filing & bank hub"
      footer={
        <button
          type="button"
          onClick={() => onSavePrns(prns)}
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          Save PRNs
        </button>
      }
    >
      <div className="flex items-center gap-2 text-emerald-600">
        <Lock className="h-4 w-4" />
        <p className="text-sm font-medium">Locked · {currency(run.totals.net)} net disbursed</p>
      </div>
      <p className="mt-1 text-xs text-muted">
        Download returns to file with ZRA, NAPSA and NHIMA, then paste the PRNs back here once issued.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {[
          { label: "ZRA PAYE Return (CSV)" },
          { label: "e-NAPSA Schedule (CSV)" },
          { label: "e-NHIMA Schedule (CSV)" },
          { label: "Bank Batch Payment File (CSV/TXT)" },
        ].map((d) => (
          <button
            key={d.label}
            type="button"
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            <FileText className="h-4 w-4" />
            {d.label}
          </button>
        ))}
      </div>

      <p className="mt-6 text-sm font-medium text-ink">PRN tracker</p>
      <div className="mt-2 space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">ZRA PRN</label>
          <input
            value={prns.zra}
            onChange={(e) => setPrns((p) => ({ ...p, zra: e.target.value }))}
            placeholder="Paste PRN"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">NAPSA PRN</label>
          <input
            value={prns.napsa}
            onChange={(e) => setPrns((p) => ({ ...p, napsa: e.target.value }))}
            placeholder="Paste PRN"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">NHIMA PRN</label>
          <input
            value={prns.nhima}
            onChange={(e) => setPrns((p) => ({ ...p, nhima: e.target.value }))}
            placeholder="Paste PRN"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
      </div>
    </SlideOver>
  );
}

export default function StaffPayroll() {
  const { employees, grossPay, netPay, basicPay, hoursWorkedFor, payrollRuns, addPayrollRun, updatePayrollRun, resetCycleDeductions, status, setStatus, currentPeriod, setCurrentPeriod, updateEmployee } =
    useStaff();
  const { addExpense } = useExpenses();

  const [pageTab, setPageTab] = useState<PageTab>("run");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const locked = status !== "draft";
  const selected = employees.find((e) => e.id === selectedId) ?? null;
  const openRun = payrollRuns.find((r) => r.id === openRunId) ?? null;

  const totals = useMemo(() => {
    const gross = employees.reduce((sum, e) => sum + grossPay(e), 0);
    const net = employees.reduce((sum, e) => sum + netPay(e), 0);
    const paye = employees.reduce((sum, e) => sum + payeFor(grossPay(e)), 0);
    const napsaE = employees.reduce((sum, e) => sum + napsaEmployee(grossPay(e)), 0);
    const nhimaE = employees.reduce((sum, e) => sum + nhimaEmployee(basicPay(e)), 0);
    const sdl = gross * SDL_RATE;
    const statutory = paye + napsaE * 2 + nhimaE * 2 + sdl;
    const employerCost = gross + napsaE + nhimaE + sdl;
    const missing = employees.filter((e) => !e.tpin || !e.nrc).length;
    return { gross, net, statutory, employerCost, missing };
  }, [employees, grossPay, netPay, basicPay]);

  const mainAction = () => {
    if (status === "draft") {
      setStatus("in-review");
      return;
    }
    if (status === "in-review") {
      addExpense({
        description: `Staff payroll — ${CURRENT_PERIOD_LABEL}`,
        categoryId: "staff-wages",
        amount: totals.employerCost,
        date: new Date().toISOString().slice(0, 10),
        hasPhoto: false,
        source: "payroll",
      });

      const runId = `run${Date.now()}`;
      addPayrollRun({
        id: runId,
        period: CURRENT_PERIOD_LABEL,
        employees,
        totals: { gross: totals.gross, net: totals.net, statutory: totals.statutory, employerCost: totals.employerCost },
        prns: { zra: "", napsa: "", nhima: "" },
      });
      resetCycleDeductions();
      setStatus("processed");
      setPageTab("history");
      setOpenRunId(runId);
      return;
    }
    setStatus("draft");
  };

  const mainActionLabel =
    status === "draft" ? "Run Payroll Calculations" : status === "in-review" ? "Approve & Lock Payroll" : "Start next cycle";

  return (
    <>
      <PageHeader title="Payroll" />

      <div className="space-y-6 px-8 pb-10">
        <div className="flex rounded-lg border border-line p-0.5 w-fit">
          {pageTabs.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setPageTab(t.value)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                pageTab === t.value ? "bg-ink text-paper" : "text-muted hover:bg-mist"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {pageTab === "run" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper p-4">
              <div className="flex items-center gap-3">
                <Select value={currentPeriod} onChange={setCurrentPeriod} options={periodOptions} className="min-w-36" />
                <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${statusMeta[status].style}`}>
                  {statusMeta[status].label}
                </span>
              </div>
              <button
                type="button"
                onClick={mainAction}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
              >
                {status === "processed" && <Download className="h-4 w-4" />}
                {mainActionLabel}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-line bg-paper p-5">
                <div className="flex items-center gap-2 text-muted">
                  <Wallet className="h-4 w-4" />
                  <p className="text-xs font-medium">Total Gross Payroll</p>
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{currency(totals.gross)}</p>
              </div>
              <div className="rounded-xl border border-line bg-paper p-5">
                <div className="flex items-center gap-2 text-muted">
                  <Banknote className="h-4 w-4" />
                  <p className="text-xs font-medium">Net Pay Disbursement</p>
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{currency(totals.net)}</p>
              </div>
              <div className="rounded-xl border border-line bg-paper p-5">
                <div className="flex items-center gap-2 text-muted">
                  <Landmark className="h-4 w-4" />
                  <p className="text-xs font-medium">Total Statutory Liabilities</p>
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{currency(totals.statutory)}</p>
                <p className="mt-1 text-[11px] text-muted">PAYE + NAPSA + NHIMA + SDL</p>
              </div>
              <div className="rounded-xl border border-line bg-paper p-5">
                <div className="flex items-center gap-2 text-muted">
                  <Users className="h-4 w-4" />
                  <p className="text-xs font-medium">Employees</p>
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{employees.length} Active Staff</p>
                {totals.missing > 0 ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                    <AlertTriangle className="h-3 w-3" /> {totals.missing} Missing TPIN/NRC
                  </p>
                ) : (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" /> All records complete
                  </p>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-line bg-paper">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-56" />
                  <col className="w-36" />
                  <col className="w-28" />
                  <col className="w-28" />
                  <col className="w-16" />
                </colgroup>
                <thead className="bg-mist text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Pay Structure</th>
                    <th className="px-4 py-3 font-medium">Gross Pay</th>
                    <th className="px-4 py-3 font-medium">Net Pay</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {employees.map((e) => (
                      <motion.tr
                        key={e.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedId(e.id)}
                        className="cursor-pointer border-t border-line transition-colors hover:bg-mist"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <TpinAlert employee={e} />
                            <span className="truncate font-medium text-ink">{e.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {e.payType === "monthly" ? (
                            <span className="whitespace-nowrap rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600">
                              Monthly Fixed
                            </span>
                          ) : (
                            <span className="whitespace-nowrap rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-600">
                              Hourly Rate
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">{currency(grossPay(e))}</td>
                        <td className="px-4 py-3 font-semibold text-ink">{currency(netPay(e))}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            aria-label={`Adjust ${e.name}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedId(e.id);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-paper hover:text-ink"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                        No employees yet — add staff first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {pageTab === "history" && (
          <div className="overflow-hidden rounded-2xl border border-line bg-paper">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col />
                <col className="w-32" />
                <col className="w-32" />
                <col className="w-28" />
              </colgroup>
              <thead className="bg-mist text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Employees paid</th>
                  <th className="px-4 py-3 font-medium">Total cost</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {payrollRuns.map((r) => (
                  <tr key={r.id} onClick={() => setOpenRunId(r.id)} className="cursor-pointer border-t border-line transition-colors hover:bg-mist">
                    <td className="px-4 py-3 font-medium text-ink">{r.period}</td>
                    <td className="px-4 py-3 text-muted">{r.employees.length}</td>
                    <td className="px-4 py-3 text-muted">{currency(r.totals.employerCost)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600">
                        <Lock className="h-3 w-3" /> Processed
                      </span>
                    </td>
                  </tr>
                ))}
                {payrollRuns.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                      No payroll has been processed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <EmployeeDrawer
            employee={selected}
            gross={grossPay(selected)}
            basic={basicPay(selected)}
            hours={selected.payType === "hourly" ? hoursWorkedFor(selected.id) : null}
            locked={locked}
            onClose={() => setSelectedId(null)}
            onUpdateDeduction={(key, value) =>
              updateEmployee(selected.id, { deductions: { ...selected.deductions, [key]: value } })
            }
          />
        )}
        {openRun && (
          <FilingDrawer
            run={openRun}
            onClose={() => setOpenRunId(null)}
            onSavePrns={(prns) => updatePayrollRun(openRun.id, { prns })}
          />
        )}
      </AnimatePresence>
    </>
  );
}
