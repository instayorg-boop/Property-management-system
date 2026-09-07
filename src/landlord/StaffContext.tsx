import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import {
  listEmployees,
  listClockEntries,
  listPayrollRuns,
  insertEmployee,
  updateEmployeeRow,
  resetAllEmployeeCycleFigures,
  insertClockEntry,
  updateClockEntryRow,
  deleteClockEntryRow,
  insertPayrollRun,
  updatePayrollRunRow,
  type Employee,
  type ClockEntry,
  type PayrollRun,
} from "../lib/staff";

// --- Types -------------------------------------------------------------------

export type { Employee, ClockEntry, PayrollRun };
export type { PayType, Gender, MaritalStatus, ContractType, BankDetails, EmergencyContact } from "../lib/staff";
export type CycleStatus = "draft" | "in-review" | "processed";

// --- Statutory calculations (Zambia) ------------------------------------------

const NAPSA_RATE = 0.05;
/** Default NAPSA insurable-earnings ceiling (K/month) — overridden by Settings once configured, since NAPSA updates this annually. */
const DEFAULT_NAPSA_INSURABLE_EARNINGS_CEILING = 37236;
const NHIMA_RATE = 0.01;
const SDL_RATE = 0.005;

const PAYE_BANDS = [
  { upTo: 5100, rate: 0 },
  { upTo: 7100, rate: 0.2 },
  { upTo: 9200, rate: 0.3 },
  { upTo: Infinity, rate: 0.37 },
];

function computePaye(taxable: number) {
  let tax = 0;
  let prev = 0;
  for (const band of PAYE_BANDS) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, band.upTo) - prev) * band.rate;
    prev = band.upTo;
  }
  return tax;
}

export function currency(n: number) {
  return `K${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function allowanceTotal(e: Employee) {
  return e.allowances.housing + e.allowances.transport + e.allowances.bonus;
}
export function deductionsTotal(e: Employee) {
  return e.deductions.advance + e.deductions.loan;
}
/** `insurableEarningsCeiling` is the NAPSA-published monthly ceiling (K37,236 as of 2026) — pass the live value from Settings. */
export function napsaEmployee(gross: number, insurableEarningsCeiling: number = DEFAULT_NAPSA_INSURABLE_EARNINGS_CEILING) {
  return Math.min(gross * NAPSA_RATE, insurableEarningsCeiling * NAPSA_RATE);
}
export function nhimaEmployee(basic: number) {
  return basic * NHIMA_RATE;
}
export function payeFor(gross: number) {
  return computePaye(gross);
}

function periodKeyFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabelFor(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// --- Context -------------------------------------------------------------------

type StaffContextValue = {
  employees: Employee[];
  /** False until the initial Supabase fetch resolves. */
  isReady: boolean;
  addEmployee: (e: Omit<Employee, "id">) => void;
  updateEmployee: (id: string, patch: Partial<Omit<Employee, "id">>) => void;
  /** Soft delete — marks inactive rather than removing, so clock/payroll history stays intact. */
  deleteEmployee: (id: string) => void;
  reactivateEmployee: (id: string) => void;

  clockEntries: ClockEntry[];
  addClockEntry: (c: Omit<ClockEntry, "id">) => void;
  updateClockEntry: (id: string, patch: Partial<Omit<ClockEntry, "id">>) => void;
  deleteClockEntry: (id: string) => void;
  /** Hours logged by this employee within the currently selected payroll period only. */
  hoursWorkedFor: (employeeId: string) => { hours: number; overtimeHours: number };

  basicPay: (e: Employee) => number;
  grossPay: (e: Employee) => number;
  netPay: (e: Employee) => number;

  payrollRuns: PayrollRun[];
  addPayrollRun: (run: PayrollRun) => void;
  updatePayrollRun: (id: string, patch: Partial<Omit<PayrollRun, "id">>) => void;

  periodOffset: number;
  setPeriodOffset: (updater: (o: number) => number) => void;
  periodKey: string;
  periodLabel: string;
  status: CycleStatus;
  setStatus: (s: CycleStatus) => void;
  resetCycleFigures: () => void;
};

const StaffContext = createContext<StaffContextValue | null>(null);

export function StaffProvider({ children }: { children: ReactNode }) {
  const { propertyId, napsaInsurableEarningsCeiling } = useSettings();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clockEntries, setClockEntries] = useState<ClockEntry[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [periodOffset, setPeriodOffsetRaw] = useState(0);
  // Draft-cycle workflow state, not yet persisted (see supabase_backend_status memory note): a page
  // refresh mid-cycle-review is an acceptable tradeoff for this phase — the finalized run itself
  // (addPayrollRun) is what actually gets saved.
  const [status, setStatus] = useState<CycleStatus>("draft");

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      const [emps, clocks, runs] = await Promise.all([
        listEmployees(propertyId),
        listClockEntries(propertyId),
        listPayrollRuns(propertyId),
      ]);
      if (cancelled) return;
      setEmployees(emps);
      setClockEntries(clocks);
      setPayrollRuns(runs);
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const periodDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + periodOffset);
    return d;
  }, [periodOffset]);
  const periodKey = periodKeyFor(periodDate);
  const periodLabel = periodLabelFor(periodDate);

  const setPeriodOffset = (updater: (o: number) => number) => {
    setPeriodOffsetRaw((prev) => Math.min(0, updater(prev)));
  };

  const addEmployee = (e: Omit<Employee, "id">) => {
    const employee: Employee = { ...e, id: crypto.randomUUID() };
    setEmployees((prev) => [employee, ...prev]);
    if (propertyId) void insertEmployee(propertyId, employee.id, e).catch((err) => console.error("Failed to save employee", err));
  };
  const updateEmployee = (id: string, patch: Partial<Omit<Employee, "id">>) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    void updateEmployeeRow(id, patch).catch((err) => console.error("Failed to update employee", err));
  };
  const deleteEmployee = (id: string) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, active: false } : e)));
    void updateEmployeeRow(id, { active: false }).catch((err) => console.error("Failed to deactivate employee", err));
  };
  const reactivateEmployee = (id: string) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, active: true } : e)));
    void updateEmployeeRow(id, { active: true }).catch((err) => console.error("Failed to reactivate employee", err));
  };

  const addClockEntry = (c: Omit<ClockEntry, "id">) => {
    const entry: ClockEntry = { ...c, id: crypto.randomUUID() };
    setClockEntries((prev) => [entry, ...prev]);
    if (propertyId) void insertClockEntry(propertyId, entry.id, c).catch((err) => console.error("Failed to save clock entry", err));
  };
  const updateClockEntry = (id: string, patch: Partial<Omit<ClockEntry, "id">>) => {
    setClockEntries((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    void updateClockEntryRow(id, patch).catch((err) => console.error("Failed to update clock entry", err));
  };
  const deleteClockEntry = (id: string) => {
    setClockEntries((prev) => prev.filter((c) => c.id !== id));
    void deleteClockEntryRow(id).catch((err) => console.error("Failed to delete clock entry", err));
  };
  const hoursWorkedFor = (employeeId: string) => {
    return clockEntries
      .filter((c) => c.employeeId === employeeId && c.date.startsWith(periodKey))
      .reduce(
        (acc, c) => ({ hours: acc.hours + c.hours, overtimeHours: acc.overtimeHours + c.overtimeHours }),
        { hours: 0, overtimeHours: 0 }
      );
  };

  const basicPay = (e: Employee) => {
    if (e.payType === "monthly") return e.basicSalary ?? 0;
    if (e.payType === "daily") return (e.dailyRate ?? 0) * e.daysWorked;
    const { hours, overtimeHours } = hoursWorkedFor(e.id);
    return (e.hourlyRate ?? 0) * (hours + overtimeHours);
  };
  const grossPay = (e: Employee) => basicPay(e) + allowanceTotal(e);
  const netPay = (e: Employee) => {
    const gross = grossPay(e);
    return Math.max(
      0,
      gross - payeFor(gross) - napsaEmployee(gross, napsaInsurableEarningsCeiling) - nhimaEmployee(basicPay(e)) - deductionsTotal(e)
    );
  };

  const addPayrollRun = (run: PayrollRun) => {
    setPayrollRuns((prev) => [run, ...prev]);
    if (propertyId) void insertPayrollRun(propertyId, run).catch((err) => console.error("Failed to save payroll run", err));
  };
  const updatePayrollRun = (id: string, patch: Partial<Omit<PayrollRun, "id">>) => {
    setPayrollRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    void updatePayrollRunRow(id, patch).catch((err) => console.error("Failed to update payroll run", err));
  };

  const resetCycleFigures = () => {
    setEmployees((prev) => prev.map((e) => ({ ...e, deductions: { advance: 0, loan: 0 }, daysWorked: 0 })));
    if (propertyId) void resetAllEmployeeCycleFigures(propertyId).catch((err) => console.error("Failed to reset cycle figures", err));
  };

  return (
    <StaffContext.Provider
      value={{
        employees,
        isReady,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        reactivateEmployee,
        clockEntries,
        addClockEntry,
        updateClockEntry,
        deleteClockEntry,
        hoursWorkedFor,
        basicPay,
        grossPay,
        netPay,
        payrollRuns,
        addPayrollRun,
        updatePayrollRun,
        periodOffset,
        setPeriodOffset,
        periodKey,
        periodLabel,
        status,
        setStatus,
        resetCycleFigures,
      }}
    >
      {children}
    </StaffContext.Provider>
  );
}

export function useStaff() {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error("useStaff must be used within StaffProvider");
  return ctx;
}

export { SDL_RATE };
