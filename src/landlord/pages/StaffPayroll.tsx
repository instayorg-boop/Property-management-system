import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Warning as AlertTriangle,
  CheckCircle as CheckCircle2,
  DownloadSimple as Download,
  UsersThree as Users,
  Wallet,
  Bank as Landmark,
  FileText,
  Sliders as SlidersHorizontal,
  Lock,
  Money as Banknote,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import Modal from "../components/Modal";
import MetricCard from "../components/MetricCard";
import SectionLabel from "../components/SectionLabel";
import { useExpenses } from "../ExpensesContext";
import { useSettings } from "../SettingsContext";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import {
  useStaff,
  currency,
  allowanceTotal,
  deductionsTotal,
  napsaEmployee,
  nhimaEmployee,
  payeFor,
  type Employee,
  type PayrollRun,
} from "../StaffContext";

const SDL_RATE = 0.005;
const ROWS_PER_PAGE = 8;

const payTypeMeta: Record<Employee["payType"], { label: string; style: string }> = {
  monthly: { label: "Monthly Fixed", style: "bg-violet-50 text-violet-600" },
  daily: { label: "Daily Rate", style: "bg-amber-50 text-amber-600" },
  hourly: { label: "Hourly Rate", style: "bg-sky-50 text-sky-600" },
};

function PayTypeBadge({ payType }: { payType: Employee["payType"] }) {
  const meta = payTypeMeta[payType];
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${meta.style}`}>{meta.label}</span>
  );
}

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
  const { napsaInsurableEarningsCeiling } = useSettings();
  const napsa = napsaEmployee(gross, napsaInsurableEarningsCeiling);
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
    <div className="rounded-lg border border-line bg-mist p-4">
      <SectionLabel>Live tax breakdown</SectionLabel>
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
  periodLabel,
  locked,
  onClose,
  onUpdateDeduction,
  onUpdateDaysWorked,
}: {
  employee: Employee;
  gross: number;
  basic: number;
  hours: { hours: number; overtimeHours: number } | null;
  periodLabel: string;
  locked: boolean;
  onClose: () => void;
  onUpdateDeduction: (key: keyof Employee["deductions"], value: number) => void;
  onUpdateDaysWorked: (value: number) => void;
}) {
  const inputCls =
    "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-mist disabled:text-muted";

  return (
    <SlideOver onClose={onClose} title={employee.name} description={employee.role}>
      <div className="flex flex-wrap items-center gap-2">
        <PayTypeBadge payType={employee.payType} />
        {(!employee.tpin || !employee.nrc) && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
            <AlertTriangle className="h-3 w-3" /> Missing {!employee.tpin ? "TPIN" : "NRC"}
          </span>
        )}
      </div>

      {employee.payType === "hourly" && hours && (
        <div className="mt-4 rounded-lg bg-mist px-3.5 py-2.5 text-sm text-muted">
          {hours.hours + hours.overtimeHours} hours logged for {periodLabel}
          {hours.overtimeHours > 0 && ` (${hours.overtimeHours} overtime)`} — edit on the Clock page.
        </div>
      )}

      {employee.payType === "daily" && (
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-muted">Days worked in {periodLabel}</label>
          <input
            type="number"
            min={0}
            disabled={locked}
            value={employee.daysWorked}
            onChange={(e) => onUpdateDaysWorked(Number(e.target.value) || 0)}
            className={inputCls}
          />
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

function ConfirmApproveModal({
  periodLabel,
  employeeCount,
  net,
  onClose,
  onConfirm,
}: {
  periodLabel: string;
  employeeCount: number;
  net: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Approve & lock payroll?"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper"
          >
            Approve & lock
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        This will lock {periodLabel} payroll for <span className="font-medium text-ink">{employeeCount} employees</span>,
        disburse <span className="font-medium text-ink">{currency(net)}</span> net pay, and log it to Expenses. Deductions and
        days-worked figures can't be changed after this — confirm the numbers are right first.
      </p>
    </Modal>
  );
}

function FilingDrawer({ run, onClose, onSavePrns }: { run: PayrollRun; onClose: () => void; onSavePrns: (p: PayrollRun["prns"]) => void }) {
  const [prns, setPrns] = useState(run.prns);

  return (
    <SlideOver
      onClose={onClose}
      title={run.period}
      description="Send to government and pay staff"
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
        Download these forms to file with the tax authority, pension fund and health fund, then paste in the payment reference
        number (PRN) each one gives you once you've paid.
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
  const {
    employees: allEmployees,
    grossPay,
    netPay,
    basicPay,
    hoursWorkedFor,
    payrollRuns,
    addPayrollRun,
    updatePayrollRun,
    resetCycleFigures,
    status,
    setStatus,
    periodOffset,
    setPeriodOffset,
    periodLabel,
    updateEmployee,
    isReady,
  } = useStaff();
  const { addExpense } = useExpenses();
  const { napsaInsurableEarningsCeiling } = useSettings();

  const employees = useMemo(() => allEmployees.filter((e) => e.active), [allEmployees]);

  const [pageTab, setPageTab] = useState<PageTab>("run");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);

  const locked = status !== "draft";
  const selected = employees.find((e) => e.id === selectedId) ?? null;
  const openRun = payrollRuns.find((r) => r.id === openRunId) ?? null;

  const filteredEmployees = useMemo(() => {
    const q = query.toLowerCase();
    return employees.filter((e) => !q || e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q));
  }, [employees, query]);
  const pageCount = Math.max(1, Math.ceil(filteredEmployees.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredEmployees.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const totals = useMemo(() => {
    const gross = employees.reduce((sum, e) => sum + grossPay(e), 0);
    const net = employees.reduce((sum, e) => sum + netPay(e), 0);
    const paye = employees.reduce((sum, e) => sum + payeFor(grossPay(e)), 0);
    const napsaE = employees.reduce((sum, e) => sum + napsaEmployee(grossPay(e), napsaInsurableEarningsCeiling), 0);
    const nhimaE = employees.reduce((sum, e) => sum + nhimaEmployee(basicPay(e)), 0);
    const sdl = gross * SDL_RATE;
    const statutory = paye + napsaE * 2 + nhimaE * 2 + sdl;
    const employerCost = gross + napsaE + nhimaE + sdl;
    const missing = employees.filter((e) => !e.tpin || !e.nrc).length;
    return { gross, net, statutory, employerCost, missing };
  }, [employees, grossPay, netPay, basicPay, napsaInsurableEarningsCeiling]);

  const lockAndProcess = () => {
    addExpense({
      name: `Staff payroll — ${periodLabel}`,
      categoryId: "staff-wages",
      amount: totals.employerCost,
      date: new Date().toISOString().slice(0, 10),
      hasPhoto: false,
      source: "payroll",
    });

    const runId = `run${Date.now()}`;
    addPayrollRun({
      id: runId,
      period: periodLabel,
      employees,
      totals: { gross: totals.gross, net: totals.net, statutory: totals.statutory, employerCost: totals.employerCost },
      prns: { zra: "", napsa: "", nhima: "" },
    });
    resetCycleFigures();
    setStatus("processed");
    setPageTab("history");
    setOpenRunId(runId);
    setConfirmingApprove(false);
  };

  const mainAction = () => {
    if (status === "draft") {
      setStatus("in-review");
      return;
    }
    if (status === "in-review") {
      setConfirmingApprove(true);
      return;
    }
    setStatus("draft");
  };

  const mainActionLabel =
    status === "draft" ? "Calculate payroll" : status === "in-review" ? "Approve & lock payroll" : "Start next month";

  return (
    <>
      <PageHeader title="Payroll" />

      <div className="space-y-6 px-4 sm:px-8 pb-10">
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-lg border border-line bg-paper px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => setPeriodOffset((o) => o - 1)}
                    disabled={locked}
                    aria-label="Previous period"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <CaretLeft size={14} weight="bold" />
                  </button>
                  <span className="w-36 text-center text-sm font-medium text-ink">{periodLabel}</span>
                  <button
                    type="button"
                    onClick={() => setPeriodOffset((o) => Math.min(0, o + 1))}
                    disabled={locked || periodOffset === 0}
                    aria-label="Next period"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <CaretRight size={14} weight="bold" />
                  </button>
                </div>
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
              {!isReady ? (
                <>
                  <div className="rounded-lg border border-line bg-paper p-5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="mt-2 h-7 w-24" />
                  </div>
                  <div className="rounded-lg border border-line bg-paper p-5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="mt-2 h-7 w-24" />
                  </div>
                  <div className="rounded-lg border border-line bg-paper p-5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="mt-2 h-7 w-24" />
                  </div>
                  <div className="rounded-lg border border-line bg-paper p-5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="mt-2 h-7 w-24" />
                    <Skeleton className="mt-1.5 h-3 w-28" />
                  </div>
                </>
              ) : (
                <>
                  <MetricCard
                    compact
                    icon={<Wallet className="h-3.5 w-3.5" />}
                    label="Total pay before deductions"
                    value={currency(totals.gross)}
                  />
                  <MetricCard
                    compact
                    icon={<Banknote className="h-3.5 w-3.5" />}
                    label="Total paid to staff"
                    value={currency(totals.net)}
                    tone="success"
                  />
                  <MetricCard
                    compact
                    icon={<Landmark className="h-3.5 w-3.5" />}
                    label="Total tax & pension owed"
                    value={currency(totals.statutory)}
                    caption="Income tax, pension, health levy and skills levy"
                  />
                  <MetricCard
                    icon={<Users className="h-3.5 w-3.5" />}
                    label="Employees"
                    value={`${employees.length} active`}
                    tone={totals.missing > 0 ? "danger" : "success"}
                    insight={
                      totals.missing > 0 ? (
                        <>
                          <AlertTriangle className="h-3 w-3" /> {totals.missing} missing tax ID
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> All records complete
                        </>
                      )
                    }
                  />
                </>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 w-fit">
              <MagnifyingGlass size={16} weight="bold" className="text-muted" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name or role"
                className="w-56 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-line bg-paper">
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
                    <th className="px-4 py-3 font-medium">Pay type</th>
                    <th className="px-4 py-3 font-medium">Pay before deductions</th>
                    <th className="px-4 py-3 font-medium">Pay after deductions</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {!isReady && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
                  <AnimatePresence initial={false}>
                    {isReady && pageRows.map((e) => (
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
                          <PayTypeBadge payType={e.payType} />
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
                  {isReady && pageRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                        No employees match.
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
          </>
        )}

        {pageTab === "history" && (
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
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
                {!isReady && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={4} />)}
                {isReady && payrollRuns.map((r) => (
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
                {isReady && payrollRuns.length === 0 && (
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
            periodLabel={periodLabel}
            locked={locked}
            onClose={() => setSelectedId(null)}
            onUpdateDeduction={(key, value) =>
              updateEmployee(selected.id, { deductions: { ...selected.deductions, [key]: value } })
            }
            onUpdateDaysWorked={(value) => updateEmployee(selected.id, { daysWorked: value })}
          />
        )}
        {confirmingApprove && (
          <ConfirmApproveModal
            periodLabel={periodLabel}
            employeeCount={employees.length}
            net={totals.net}
            onClose={() => setConfirmingApprove(false)}
            onConfirm={lockAndProcess}
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
