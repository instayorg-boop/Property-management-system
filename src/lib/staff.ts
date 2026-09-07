import { supabase } from "./supabaseClient";
import type { Json, Tables, TablesUpdate } from "./database.types";

export type PayType = "monthly" | "daily" | "hourly";
export type Gender = "male" | "female" | "other";
export type MaritalStatus = "single" | "married" | "divorced" | "widowed";
export type ContractType = "permanent" | "fixed-term" | "probationary";

export type BankDetails = { bankName: string; accountNumber: string; accountName: string; branch: string };
export type EmergencyContact = { name: string; relationship: string; phone: string };

export type Employee = {
  id: string;
  name: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  phone: string;
  address: string;
  maritalStatus: MaritalStatus | null;
  dependants: number;
  emergencyContact: EmergencyContact;
  role: string;
  startDate: string | null;
  contractType: ContractType;
  probationMonths?: number;
  contractEndDate?: string | null;
  standardHoursPerDay?: number;
  noticePeriodDays?: number;
  payType: PayType;
  basicSalary?: number;
  dailyRate?: number;
  hourlyRate?: number;
  daysWorked: number;
  allowances: { housing: number; transport: number; bonus: number };
  deductions: { advance: number; loan: number };
  nrc: string | null;
  tpin: string | null;
  napsaNumber: string | null;
  nhimaNumber: string | null;
  bank: BankDetails;
  active: boolean;
};

export type ClockEntry = {
  id: string;
  employeeId: string;
  date: string;
  hours: number;
  overtimeHours: number;
  source: "manual" | "gatehouse";
};

export type PayrollRun = {
  id: string;
  period: string;
  employees: Employee[];
  totals: { gross: number; net: number; statutory: number; employerCost: number };
  prns: { zra: string; napsa: string; nhima: string };
};

function toEmployee(row: Tables<"employees">): Employee {
  const emergencyContact = row.emergency_contact as unknown as EmergencyContact;
  const allowances = row.allowances as unknown as Employee["allowances"];
  const deductions = row.deductions as unknown as Employee["deductions"];
  const bank = row.bank as unknown as BankDetails;
  return {
    id: row.id,
    name: row.name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender as Gender | null,
    phone: row.phone ?? "",
    address: row.address ?? "",
    maritalStatus: row.marital_status as MaritalStatus | null,
    dependants: row.dependants,
    emergencyContact,
    role: row.role,
    startDate: row.start_date,
    contractType: row.contract_type as ContractType,
    probationMonths: row.probation_months ?? undefined,
    contractEndDate: row.contract_end_date,
    standardHoursPerDay: row.standard_hours_per_day ?? undefined,
    noticePeriodDays: row.notice_period_days ?? undefined,
    payType: row.pay_type as PayType,
    basicSalary: row.basic_salary ?? undefined,
    dailyRate: row.daily_rate ?? undefined,
    hourlyRate: row.hourly_rate ?? undefined,
    daysWorked: row.days_worked,
    allowances,
    deductions,
    nrc: row.nrc,
    tpin: row.tpin,
    napsaNumber: row.napsa_number,
    nhimaNumber: row.nhima_number,
    bank,
    active: row.active,
  };
}

function toClockEntry(row: Tables<"clock_entries">): ClockEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    hours: row.hours,
    overtimeHours: row.overtime_hours,
    source: row.source as ClockEntry["source"],
  };
}

function toPayrollRun(row: Tables<"payroll_runs">): PayrollRun {
  return {
    id: row.id,
    period: row.period,
    employees: row.employees_snapshot as unknown as Employee[],
    totals: row.totals as unknown as PayrollRun["totals"],
    prns: row.prns as unknown as PayrollRun["prns"],
  };
}

const EMPLOYEE_COLUMNS =
  "id, name, date_of_birth, gender, phone, address, marital_status, dependants, emergency_contact, role, " +
  "start_date, contract_type, probation_months, contract_end_date, standard_hours_per_day, notice_period_days, " +
  "pay_type, basic_salary, daily_rate, hourly_rate, days_worked, allowances, deductions, nrc, tpin, " +
  "napsa_number, nhima_number, bank, active";

export async function listEmployees(propertyId: string): Promise<Employee[]> {
  const { data, error } = await supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("property_id", propertyId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Tables<"employees">[]).map(toEmployee);
}

/** Clock entries accumulate daily per employee — cap the read so years of history don't all load at once. */
const CLOCK_ENTRY_LIST_LIMIT = 2000;

export async function listClockEntries(propertyId: string): Promise<ClockEntry[]> {
  const { data, error } = await supabase
    .from("clock_entries")
    .select("id, employee_id, date, hours, overtime_hours, source")
    .eq("property_id", propertyId)
    .order("date", { ascending: false })
    .limit(CLOCK_ENTRY_LIST_LIMIT);
  if (error) throw error;
  return (data as unknown as Tables<"clock_entries">[]).map(toClockEntry);
}

export async function listPayrollRuns(propertyId: string): Promise<PayrollRun[]> {
  const { data, error } = await supabase
    .from("payroll_runs")
    .select("id, period, employees_snapshot, totals, prns")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return (data as unknown as Tables<"payroll_runs">[]).map(toPayrollRun);
}

export async function insertEmployee(propertyId: string, id: string, e: Omit<Employee, "id">): Promise<void> {
  const { error } = await supabase.from("employees").insert({
    id,
    property_id: propertyId,
    name: e.name,
    date_of_birth: e.dateOfBirth,
    gender: e.gender,
    phone: e.phone,
    address: e.address,
    marital_status: e.maritalStatus,
    dependants: e.dependants,
    emergency_contact: e.emergencyContact as unknown as Json,
    role: e.role,
    start_date: e.startDate,
    contract_type: e.contractType,
    probation_months: e.probationMonths ?? null,
    contract_end_date: e.contractEndDate ?? null,
    standard_hours_per_day: e.standardHoursPerDay ?? null,
    notice_period_days: e.noticePeriodDays ?? null,
    pay_type: e.payType,
    basic_salary: e.basicSalary ?? null,
    daily_rate: e.dailyRate ?? null,
    hourly_rate: e.hourlyRate ?? null,
    days_worked: e.daysWorked,
    allowances: e.allowances as unknown as Json,
    deductions: e.deductions as unknown as Json,
    nrc: e.nrc,
    tpin: e.tpin,
    napsa_number: e.napsaNumber,
    nhima_number: e.nhimaNumber,
    bank: e.bank as unknown as Json,
    active: e.active,
  });
  if (error) throw error;
}

export async function updateEmployeeRow(id: string, patch: Partial<Omit<Employee, "id">>): Promise<void> {
  const row: TablesUpdate<"employees"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.dateOfBirth !== undefined) row.date_of_birth = patch.dateOfBirth;
  if (patch.gender !== undefined) row.gender = patch.gender;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.maritalStatus !== undefined) row.marital_status = patch.maritalStatus;
  if (patch.dependants !== undefined) row.dependants = patch.dependants;
  if (patch.emergencyContact !== undefined) row.emergency_contact = patch.emergencyContact as unknown as Json;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.startDate !== undefined) row.start_date = patch.startDate;
  if (patch.contractType !== undefined) row.contract_type = patch.contractType;
  if (patch.probationMonths !== undefined) row.probation_months = patch.probationMonths ?? null;
  if (patch.contractEndDate !== undefined) row.contract_end_date = patch.contractEndDate ?? null;
  if (patch.standardHoursPerDay !== undefined) row.standard_hours_per_day = patch.standardHoursPerDay ?? null;
  if (patch.noticePeriodDays !== undefined) row.notice_period_days = patch.noticePeriodDays ?? null;
  if (patch.payType !== undefined) row.pay_type = patch.payType;
  if (patch.basicSalary !== undefined) row.basic_salary = patch.basicSalary ?? null;
  if (patch.dailyRate !== undefined) row.daily_rate = patch.dailyRate ?? null;
  if (patch.hourlyRate !== undefined) row.hourly_rate = patch.hourlyRate ?? null;
  if (patch.daysWorked !== undefined) row.days_worked = patch.daysWorked;
  if (patch.allowances !== undefined) row.allowances = patch.allowances as unknown as Json;
  if (patch.deductions !== undefined) row.deductions = patch.deductions as unknown as Json;
  if (patch.nrc !== undefined) row.nrc = patch.nrc;
  if (patch.tpin !== undefined) row.tpin = patch.tpin;
  if (patch.napsaNumber !== undefined) row.napsa_number = patch.napsaNumber;
  if (patch.nhimaNumber !== undefined) row.nhima_number = patch.nhimaNumber;
  if (patch.bank !== undefined) row.bank = patch.bank as unknown as Json;
  if (patch.active !== undefined) row.active = patch.active;
  const { error } = await supabase.from("employees").update(row).eq("id", id);
  if (error) throw error;
}

export async function resetAllEmployeeCycleFigures(propertyId: string): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .update({ deductions: { advance: 0, loan: 0 }, days_worked: 0 })
    .eq("property_id", propertyId);
  if (error) throw error;
}

export async function insertClockEntry(propertyId: string, id: string, c: Omit<ClockEntry, "id">): Promise<void> {
  const { error } = await supabase.from("clock_entries").insert({
    id,
    property_id: propertyId,
    employee_id: c.employeeId,
    date: c.date,
    hours: c.hours,
    overtime_hours: c.overtimeHours,
    source: c.source,
  });
  if (error) throw error;
}

export async function updateClockEntryRow(id: string, patch: Partial<Omit<ClockEntry, "id">>): Promise<void> {
  const row: TablesUpdate<"clock_entries"> = {};
  if (patch.employeeId !== undefined) row.employee_id = patch.employeeId;
  if (patch.date !== undefined) row.date = patch.date;
  if (patch.hours !== undefined) row.hours = patch.hours;
  if (patch.overtimeHours !== undefined) row.overtime_hours = patch.overtimeHours;
  if (patch.source !== undefined) row.source = patch.source;
  const { error } = await supabase.from("clock_entries").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteClockEntryRow(id: string): Promise<void> {
  const { error } = await supabase.from("clock_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function insertPayrollRun(propertyId: string, run: PayrollRun): Promise<void> {
  const { error } = await supabase.from("payroll_runs").insert({
    id: run.id,
    property_id: propertyId,
    period: run.period,
    employees_snapshot: run.employees as unknown as Json,
    totals: run.totals as unknown as Json,
    prns: run.prns as unknown as Json,
  });
  if (error) throw error;
}

export async function updatePayrollRunRow(id: string, patch: Partial<Omit<PayrollRun, "id">>): Promise<void> {
  const row: TablesUpdate<"payroll_runs"> = {};
  if (patch.period !== undefined) row.period = patch.period;
  if (patch.employees !== undefined) row.employees_snapshot = patch.employees as unknown as Json;
  if (patch.totals !== undefined) row.totals = patch.totals as unknown as Json;
  if (patch.prns !== undefined) row.prns = patch.prns as unknown as Json;
  const { error } = await supabase.from("payroll_runs").update(row).eq("id", id);
  if (error) throw error;
}
