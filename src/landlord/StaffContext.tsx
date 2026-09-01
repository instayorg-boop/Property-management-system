import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";

// --- Types -------------------------------------------------------------------

export type PayType = "monthly" | "daily" | "hourly";
export type CycleStatus = "draft" | "in-review" | "processed";
export type Gender = "male" | "female" | "other";
export type MaritalStatus = "single" | "married" | "divorced" | "widowed";
export type ContractType = "permanent" | "fixed-term" | "probationary";

export type BankDetails = {
  bankName: string;
  accountNumber: string;
  accountName: string;
  branch: string;
};

export type EmergencyContact = {
  name: string;
  relationship: string;
  phone: string;
};

export type Employee = {
  id: string;

  // Personal
  name: string;
  dateOfBirth: string | null; // ISO
  gender: Gender | null;
  phone: string;
  address: string;
  maritalStatus: MaritalStatus | null;
  dependants: number;
  emergencyContact: EmergencyContact;

  // Employment
  role: string;
  startDate: string | null; // ISO — required for NAPSA registration within 30 days of hire
  contractType: ContractType;
  probationMonths?: number;
  contractEndDate?: string | null; // fixed-term only
  standardHoursPerDay?: number;
  noticePeriodDays?: number;

  // Compensation
  payType: PayType;
  basicSalary?: number; // monthly
  dailyRate?: number; // daily
  hourlyRate?: number; // hourly
  /** Days worked this cycle, for daily-rate staff — the PM fills this in before running payroll. Resets each cycle. */
  daysWorked: number;
  allowances: { housing: number; transport: number; bonus: number };
  deductions: { advance: number; loan: number }; // per-cycle, reset after each processed run

  // Compliance
  nrc: string | null;
  tpin: string | null;
  napsaNumber: string | null;
  nhimaNumber: string | null;

  // Banking — required for salary payment and the bank batch file
  bank: BankDetails;

  /** Soft-deleted employees are hidden from the roster and payroll by default, but their history (clock entries, past runs) stays intact. */
  active: boolean;
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
    id: "e1", name: "Chanda Mumba",
    dateOfBirth: "1985-03-12", gender: "male", phone: "0977 111 222", address: "Plot 14, Kabulonga, Lusaka",
    maritalStatus: "married", dependants: 3,
    emergencyContact: { name: "Mutinta Mumba", relationship: "Spouse", phone: "0966 111 222" },
    role: "Site Manager", startDate: "2023-02-01", contractType: "permanent", standardHoursPerDay: 8, noticePeriodDays: 30,
    payType: "monthly", basicSalary: 8500, daysWorked: 0,
    allowances: { housing: 1000, transport: 500, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
    nrc: "123456/10/1", tpin: "1000123456", napsaNumber: "NAP1002233", nhimaNumber: "NHI5511223",
    bank: { bankName: "Zanaco", accountNumber: "0123456789", accountName: "Chanda Mumba", branch: "Cairo Road" },
    active: true,
  },
  {
    id: "e2", name: "Bwalya Tembo",
    dateOfBirth: "1992-07-25", gender: "male", phone: "0977 222 333", address: "Chelstone, Lusaka",
    maritalStatus: "single", dependants: 0,
    emergencyContact: { name: "Grace Tembo", relationship: "Mother", phone: "0966 222 333" },
    role: "Security Guard", startDate: "2024-05-15", contractType: "permanent", standardHoursPerDay: 8, noticePeriodDays: 14,
    payType: "hourly", hourlyRate: 30, daysWorked: 0,
    allowances: { housing: 0, transport: 200, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
    nrc: "234567/21/1", tpin: "1000234567", napsaNumber: "NAP1002234", nhimaNumber: "NHI5511224",
    bank: { bankName: "MTN Mobile Money", accountNumber: "0977222333", accountName: "Bwalya Tembo", branch: "" },
    active: true,
  },
  {
    id: "e3", name: "Natasha Phiri",
    dateOfBirth: "1998-11-02", gender: "female", phone: "0977 333 444", address: "Woodlands, Lusaka",
    maritalStatus: "single", dependants: 0,
    emergencyContact: { name: "David Phiri", relationship: "Father", phone: "0966 333 444" },
    role: "Accounts Clerk", startDate: "2025-01-10", contractType: "probationary", probationMonths: 3, standardHoursPerDay: 8, noticePeriodDays: 7,
    payType: "monthly", basicSalary: 4200, daysWorked: 0,
    allowances: { housing: 0, transport: 300, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
    nrc: "345678/63/1", tpin: null, napsaNumber: null, nhimaNumber: null,
    bank: { bankName: "Zanaco", accountNumber: "0234567891", accountName: "Natasha Phiri", branch: "Manda Hill" },
    active: true,
  },
  {
    id: "e4", name: "Mwaka Chileshe",
    dateOfBirth: "1990-05-18", gender: "female", phone: "0977 444 555", address: "Kalingalinga, Lusaka",
    maritalStatus: "married", dependants: 2,
    emergencyContact: { name: "Peter Chileshe", relationship: "Spouse", phone: "0966 444 555" },
    role: "Cleaner", startDate: "2024-09-01", contractType: "fixed-term", contractEndDate: "2027-08-31", standardHoursPerDay: 6, noticePeriodDays: 7,
    payType: "daily", dailyRate: 150, daysWorked: 12,
    allowances: { housing: 0, transport: 0, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
    nrc: "456789/45/1", tpin: "1000456789", napsaNumber: "NAP1002236", nhimaNumber: "NHI5511226",
    bank: { bankName: "Airtel Money", accountNumber: "0977444555", accountName: "Mwaka Chileshe", branch: "" },
    active: true,
  },
  {
    id: "e5", name: "Joseph Banda",
    dateOfBirth: "1978-01-30", gender: "male", phone: "0977 555 666", address: "Kabulonga House, Lusaka",
    maritalStatus: "married", dependants: 4,
    emergencyContact: { name: "Esther Banda", relationship: "Spouse", phone: "0966 555 666" },
    role: "Caretaker", startDate: "2021-06-01", contractType: "permanent", standardHoursPerDay: 8, noticePeriodDays: 30,
    payType: "monthly", basicSalary: 3800, daysWorked: 0,
    allowances: { housing: 0, transport: 200, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
    nrc: "567890/12/1", tpin: "1000567890", napsaNumber: "NAP1002237", nhimaNumber: "NHI5511227",
    bank: { bankName: "Zanaco", accountNumber: "0345678912", accountName: "Joseph Banda", branch: "Cairo Road" },
    active: true,
  },
  {
    id: "e6", name: "Ruth Mulenga",
    dateOfBirth: "1995-09-09", gender: "female", phone: "0977 666 777", address: "Ng'ombe, Lusaka",
    maritalStatus: "single", dependants: 1,
    emergencyContact: { name: "Agnes Mulenga", relationship: "Sister", phone: "0966 666 777" },
    role: "Gardener", startDate: "2025-03-20", contractType: "probationary", probationMonths: 3, standardHoursPerDay: 6, noticePeriodDays: 7,
    payType: "daily", dailyRate: 120, daysWorked: 8,
    allowances: { housing: 0, transport: 0, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
    nrc: null, tpin: "1000678901", napsaNumber: null, nhimaNumber: null,
    bank: { bankName: "", accountNumber: "", accountName: "", branch: "" },
    active: true,
  },
  {
    id: "e7", name: "Davies Zulu",
    dateOfBirth: "1988-12-14", gender: "male", phone: "0977 777 888", address: "Chalala, Lusaka",
    maritalStatus: "married", dependants: 2,
    emergencyContact: { name: "Miriam Zulu", relationship: "Spouse", phone: "0966 777 888" },
    role: "Driver", startDate: "2022-11-01", contractType: "permanent", standardHoursPerDay: 8, noticePeriodDays: 30,
    payType: "monthly", basicSalary: 5000, daysWorked: 0,
    allowances: { housing: 0, transport: 400, bonus: 0 },
    deductions: { advance: 0, loan: 0 },
    nrc: "678901/34/1", tpin: "1000789012", napsaNumber: "NAP1002239", nhimaNumber: "NHI5511229",
    bank: { bankName: "Zanaco", accountNumber: "0456789123", accountName: "Davies Zulu", branch: "Cairo Road" },
    active: true,
  },
];

const initialClockEntries: ClockEntry[] = [
  { id: "c1", employeeId: "e2", date: "2026-08-01", hours: 8, overtimeHours: 0, source: "manual" },
  { id: "c2", employeeId: "e2", date: "2026-08-02", hours: 9, overtimeHours: 1, source: "manual" },
  { id: "c3", employeeId: "e2", date: "2026-08-03", hours: 8, overtimeHours: 0, source: "gatehouse" },
  { id: "c4", employeeId: "e2", date: "2026-07-04", hours: 8, overtimeHours: 0, source: "manual" },
  { id: "c5", employeeId: "e2", date: "2026-07-05", hours: 8, overtimeHours: 0, source: "manual" },
];

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
  const { napsaInsurableEarningsCeiling } = useSettings();
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [clockEntries, setClockEntries] = useState<ClockEntry[]>(initialClockEntries);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [periodOffset, setPeriodOffsetRaw] = useState(0);
  const [status, setStatus] = useState<CycleStatus>("draft");

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
    setEmployees((prev) => [{ ...e, id: `e${Date.now()}` }, ...prev]);
  };
  const updateEmployee = (id: string, patch: Partial<Omit<Employee, "id">>) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };
  const deleteEmployee = (id: string) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, active: false } : e)));
  };
  const reactivateEmployee = (id: string) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, active: true } : e)));
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
  };
  const updatePayrollRun = (id: string, patch: Partial<Omit<PayrollRun, "id">>) => {
    setPayrollRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const resetCycleFigures = () => {
    setEmployees((prev) => prev.map((e) => ({ ...e, deductions: { advance: 0, loan: 0 }, daysWorked: 0 })));
  };

  return (
    <StaffContext.Provider
      value={{
        employees,
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
