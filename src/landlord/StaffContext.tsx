import { createContext, useContext, useState, type ReactNode } from "react";

// --- Types -------------------------------------------------------------------

export type PayType = "monthly" | "hourly";
export type CycleStatus = "draft" | "in-review" | "processed";

export type Employee = {
  id: string;
  name: string;
  role: string;
  nrc: string | null;
  tpin: string | null;
  payType: PayType;
  basicSalary?: number; // monthly
  hourlyRate?: number; // hourly
  allowances: { housing: number; transport: number; bonus: number };
  deductions: { advance: number; loan: number }; // per-cycle, reset after each processed run
};

export type ClockEntry = {
  id: string;
  employeeId: string;
  date: string; // ISO
  hours: number;
  overtimeHours: number;
  source: "manual" | "gatehouse";
};

export type PayrollRun = {
  id: string;
  period: string;
  employees: Employee[]; // snapshot at time of approval
  totals: { gross: number; net: number; statutory: number; employerCost: number };
  prns: { zra: string; napsa: string; nhima: string };
};

const initialEmployees: Employee[] = [
  {
    id: "e1", name: "Chanda Mumba", role: "Site Manager", nrc: "123456/10/1", tpin: "1000123456",
    payType: "monthly", basicSalary: 8500,
    allowances: { housing: 1000, transport: 500, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
  },
  {
    id: "e2", name: "Bwalya Tembo", role: "Security Guard", nrc: "234567/21/1", tpin: "1000234567",
    payType: "hourly", hourlyRate: 30,
    allowances: { housing: 0, transport: 200, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
  },
  {
    id: "e3", name: "Natasha Phiri", role: "Accounts Clerk", nrc: "345678/63/1", tpin: null,
    payType: "monthly", basicSalary: 4200,
    allowances: { housing: 0, transport: 300, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
  },
  {
    id: "e4", name: "Mwaka Chileshe", role: "Cleaner", nrc: "456789/45/1", tpin: "1000456789",
    payType: "hourly", hourlyRate: 22,
    allowances: { housing: 0, transport: 0, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
  },
  {
    id: "e5", name: "Joseph Banda", role: "Caretaker", nrc: "567890/12/1", tpin: "1000567890",
    payType: "monthly", basicSalary: 3800,
    allowances: { housing: 0, transport: 200, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
  },
  {
    id: "e6", name: "Ruth Mulenga", role: "Gardener", nrc: null, tpin: "1000678901",
    payType: "hourly", hourlyRate: 20,
    allowances: { housing: 0, transport: 0, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
  },
  {
    id: "e7", name: "Davies Zulu", role: "Driver", nrc: "678901/34/1", tpin: "1000789012",
    payType: "monthly", basicSalary: 5000,
    allowances: { housing: 0, transport: 400, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
  },
];

export const CURRENT_PERIOD_LABEL = "August 2026";
const CURRENT_PERIOD_VALUE = "aug-2026";

const initialClockEntries: ClockEntry[] = [
  { id: "c1", employeeId: "e2", date: "2026-08-01", hours: 8, overtimeHours: 0, source: "manual" },
  { id: "c2", employeeId: "e2", date: "2026-08-02", hours: 9, overtimeHours: 1, source: "manual" },
  { id: "c3", employeeId: "e2", date: "2026-08-03", hours: 8, overtimeHours: 0, source: "gatehouse" },
  { id: "c4", employeeId: "e4", date: "2026-08-01", hours: 6, overtimeHours: 0, source: "manual" },
  { id: "c5", employeeId: "e4", date: "2026-08-02", hours: 6, overtimeHours: 0, source: "manual" },
  { id: "c6", employeeId: "e6", date: "2026-08-01", hours: 5, overtimeHours: 0, source: "manual" },
];

// --- Statutory calculations (Zambia) ------------------------------------------

const NAPSA_RATE = 0.05;
const NAPSA_CEILING = 1861.8;
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
export function napsaEmployee(gross: number) {
  return Math.min(gross * NAPSA_RATE, NAPSA_CEILING);
}
export function nhimaEmployee(basic: number) {
  return basic * NHIMA_RATE;
}
export function payeFor(gross: number) {
  return computePaye(gross);
}

// --- Context -------------------------------------------------------------------

type StaffContextValue = {
  employees: Employee[];
  addEmployee: (e: Omit<Employee, "id">) => void;
  updateEmployee: (id: string, patch: Partial<Omit<Employee, "id">>) => void;
  deleteEmployee: (id: string) => void;

  clockEntries: ClockEntry[];
  addClockEntry: (c: Omit<ClockEntry, "id">) => void;
  updateClockEntry: (id: string, patch: Partial<Omit<ClockEntry, "id">>) => void;
  deleteClockEntry: (id: string) => void;
  hoursWorkedFor: (employeeId: string) => { hours: number; overtimeHours: number };

  basicPay: (e: Employee) => number;
  grossPay: (e: Employee) => number;
  netPay: (e: Employee) => number;

  payrollRuns: PayrollRun[];
  addPayrollRun: (run: PayrollRun) => void;
  updatePayrollRun: (id: string, patch: Partial<Omit<PayrollRun, "id">>) => void;

  currentPeriod: string;
  setCurrentPeriod: (p: string) => void;
  status: CycleStatus;
  setStatus: (s: CycleStatus) => void;
  resetCycleDeductions: () => void;
};

const StaffContext = createContext<StaffContextValue | null>(null);

export function StaffProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [clockEntries, setClockEntries] = useState<ClockEntry[]>(initialClockEntries);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState(CURRENT_PERIOD_VALUE);
  const [status, setStatus] = useState<CycleStatus>("draft");

  const addEmployee = (e: Omit<Employee, "id">) => {
    setEmployees((prev) => [{ ...e, id: `e${Date.now()}` }, ...prev]);
  };
  const updateEmployee = (id: string, patch: Partial<Omit<Employee, "id">>) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };
  const deleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  };

  const addClockEntry = (c: Omit<ClockEntry, "id">) => {
    setClockEntries((prev) => [{ ...c, id: `c${Date.now()}` }, ...prev]);
  };
  const updateClockEntry = (id: string, patch: Partial<Omit<ClockEntry, "id">>) => {
    setClockEntries((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const deleteClockEntry = (id: string) => {
    setClockEntries((prev) => prev.filter((c) => c.id !== id));
  };
  const hoursWorkedFor = (employeeId: string) => {
    return clockEntries
      .filter((c) => c.employeeId === employeeId)
      .reduce(
        (acc, c) => ({ hours: acc.hours + c.hours, overtimeHours: acc.overtimeHours + c.overtimeHours }),
        { hours: 0, overtimeHours: 0 }
      );
  };

  const basicPay = (e: Employee) => {
    if (e.payType === "monthly") return e.basicSalary ?? 0;
    const { hours, overtimeHours } = hoursWorkedFor(e.id);
    return (e.hourlyRate ?? 0) * (hours + overtimeHours);
  };
  const grossPay = (e: Employee) => basicPay(e) + allowanceTotal(e);
  const netPay = (e: Employee) => {
    const gross = grossPay(e);
    return Math.max(
      0,
      gross - payeFor(gross) - napsaEmployee(gross) - nhimaEmployee(basicPay(e)) - deductionsTotal(e)
    );
  };

  const addPayrollRun = (run: PayrollRun) => {
    setPayrollRuns((prev) => [run, ...prev]);
  };
  const updatePayrollRun = (id: string, patch: Partial<Omit<PayrollRun, "id">>) => {
    setPayrollRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const resetCycleDeductions = () => {
    setEmployees((prev) => prev.map((e) => ({ ...e, deductions: { advance: 0, loan: 0 } })));
  };

  return (
    <StaffContext.Provider
      value={{
        employees,
        addEmployee,
        updateEmployee,
        deleteEmployee,
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
        currentPeriod,
        setCurrentPeriod,
        status,
        setStatus,
        resetCycleDeductions,
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
