import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Warning as AlertTriangle, CheckCircle as CheckCircle2, MagnifyingGlass as Search, ShieldCheck, Phone as PhoneIcon, FloppyDisk } from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import SlideOver from "../components/SlideOver";
import Select from "../components/Select";
import { useStaff, type Employee, type PayType, type Gender, type MaritalStatus, type ContractType } from "../StaffContext";
import { SkeletonRow } from "../components/Skeleton";
import Button from "../components/Button";

function TpinBadge({ tpin }: { tpin: string | null }) {
  if (tpin) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> TPIN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
      <AlertTriangle className="h-3 w-3" /> Missing TPIN
    </span>
  );
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const payTypeOptions = [
  { value: "monthly", label: "Monthly Fixed" },
  { value: "daily", label: "Daily Rate" },
  { value: "hourly", label: "Hourly Rate" },
];
const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];
const maritalOptions = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
];
const contractOptions = [
  { value: "permanent", label: "Permanent" },
  { value: "fixed-term", label: "Fixed-term" },
  { value: "probationary", label: "Probationary" },
];

const payTypeStyle: Record<PayType, string> = {
  monthly: "bg-violet-50 text-violet-600",
  daily: "bg-amber-50 text-amber-600",
  hourly: "bg-sky-50 text-sky-600",
};
const payTypeLabel: Record<PayType, string> = {
  monthly: "Monthly Fixed",
  daily: "Daily Rate",
  hourly: "Hourly Rate",
};

const inputCls = "w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-medium text-muted";

const formSteps = [
  { n: 1, label: "Personal" },
  { n: 2, label: "Employment" },
  { n: 3, label: "Pay & compliance" },
] as const;

type DraftFields = {
  step: 1 | 2 | 3;
  name: string; dateOfBirth: string; gender: Gender | ""; phone: string; address: string;
  maritalStatus: MaritalStatus | ""; dependants: number; ecName: string; ecRelationship: string; ecPhone: string;
  role: string; startDate: string; contractType: ContractType; probationMonths: string; contractEndDate: string;
  standardHoursPerDay: string; noticePeriodDays: string;
  payType: PayType; basicSalary: string; dailyRate: string; hourlyRate: string;
  nrc: string; tpin: string; napsaNumber: string; nhimaNumber: string;
  bankName: string; accountNumber: string; accountName: string; branch: string;
  savedAt: string;
};

function draftKeyFor(editing: Employee | null) {
  return `staff-draft:${editing?.id ?? "new"}`;
}

function readDraft(key: string): DraftFields | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftFields;
    // Ignore empty drafts — nothing worth offering to resume.
    if (!draft.name?.trim() && !draft.role?.trim()) return null;
    return draft;
  } catch {
    return null;
  }
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function DraftBanner({ draft, onResume, onDiscard }: { draft: DraftFields; onResume: () => void; onDiscard: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
      <p className="text-xs text-amber-800">
        Unsaved draft from {timeAgo(draft.savedAt)}
        {draft.name ? ` — ${draft.name}` : ""}.
      </p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onDiscard} className="text-xs font-medium text-red-600 hover:underline">
          Discard
        </button>
        <button type="button" onClick={onResume} className="text-xs font-medium text-brand hover:underline">
          Resume
        </button>
      </div>
    </div>
  );
}

function EmployeeFormModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Employee | null;
  onClose: () => void;
  onSave: (e: Employee | Omit<Employee, "id">) => void;
}) {
  const draftKey = draftKeyFor(editing);
  const [pendingDraft, setPendingDraft] = useState<DraftFields | null>(() => readDraft(draftKey));

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Personal
  const [name, setName] = useState(editing?.name ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(editing?.dateOfBirth ?? "");
  const [gender, setGender] = useState<Gender | "">(editing?.gender ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus | "">(editing?.maritalStatus ?? "");
  const [dependants, setDependants] = useState(editing?.dependants ?? 0);
  const [ecName, setEcName] = useState(editing?.emergencyContact.name ?? "");
  const [ecRelationship, setEcRelationship] = useState(editing?.emergencyContact.relationship ?? "");
  const [ecPhone, setEcPhone] = useState(editing?.emergencyContact.phone ?? "");

  // Employment
  const [role, setRole] = useState(editing?.role ?? "");
  const [startDate, setStartDate] = useState(editing?.startDate ?? "");
  const [contractType, setContractType] = useState<ContractType>(editing?.contractType ?? "permanent");
  const [probationMonths, setProbationMonths] = useState(editing?.probationMonths?.toString() ?? "3");
  const [contractEndDate, setContractEndDate] = useState(editing?.contractEndDate ?? "");
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(editing?.standardHoursPerDay?.toString() ?? "8");
  const [noticePeriodDays, setNoticePeriodDays] = useState(editing?.noticePeriodDays?.toString() ?? "30");

  // Pay & compliance
  const [payType, setPayType] = useState<PayType>(editing?.payType ?? "monthly");
  const [basicSalary, setBasicSalary] = useState(editing?.basicSalary?.toString() ?? "");
  const [dailyRate, setDailyRate] = useState(editing?.dailyRate?.toString() ?? "");
  const [hourlyRate, setHourlyRate] = useState(editing?.hourlyRate?.toString() ?? "");
  const [nrc, setNrc] = useState(editing?.nrc ?? "");
  const [tpin, setTpin] = useState(editing?.tpin ?? "");
  const [napsaNumber, setNapsaNumber] = useState(editing?.napsaNumber ?? "");
  const [nhimaNumber, setNhimaNumber] = useState(editing?.nhimaNumber ?? "");
  const [bankName, setBankName] = useState(editing?.bank.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(editing?.bank.accountNumber ?? "");
  const [accountName, setAccountName] = useState(editing?.bank.accountName ?? "");
  const [branch, setBranch] = useState(editing?.bank.branch ?? "");

  // Autosave every change to localStorage so an accidental close doesn't lose progress.
  useEffect(() => {
    const draft: DraftFields = {
      step, name, dateOfBirth, gender, phone, address, maritalStatus, dependants, ecName, ecRelationship, ecPhone,
      role, startDate, contractType, probationMonths, contractEndDate, standardHoursPerDay, noticePeriodDays,
      payType, basicSalary, dailyRate, hourlyRate, nrc, tpin, napsaNumber, nhimaNumber,
      bankName, accountNumber, accountName, branch, savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // localStorage unavailable — autosave silently no-ops, form still works normally.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step, name, dateOfBirth, gender, phone, address, maritalStatus, dependants, ecName, ecRelationship, ecPhone,
    role, startDate, contractType, probationMonths, contractEndDate, standardHoursPerDay, noticePeriodDays,
    payType, basicSalary, dailyRate, hourlyRate, nrc, tpin, napsaNumber, nhimaNumber,
    bankName, accountNumber, accountName, branch,
  ]);

  const resumeDraft = () => {
    if (!pendingDraft) return;
    const d = pendingDraft;
    setStep(d.step);
    setName(d.name); setDateOfBirth(d.dateOfBirth); setGender(d.gender); setPhone(d.phone); setAddress(d.address);
    setMaritalStatus(d.maritalStatus); setDependants(d.dependants); setEcName(d.ecName); setEcRelationship(d.ecRelationship); setEcPhone(d.ecPhone);
    setRole(d.role); setStartDate(d.startDate); setContractType(d.contractType); setProbationMonths(d.probationMonths);
    setContractEndDate(d.contractEndDate); setStandardHoursPerDay(d.standardHoursPerDay); setNoticePeriodDays(d.noticePeriodDays);
    setPayType(d.payType); setBasicSalary(d.basicSalary); setDailyRate(d.dailyRate); setHourlyRate(d.hourlyRate);
    setNrc(d.nrc); setTpin(d.tpin); setNapsaNumber(d.napsaNumber); setNhimaNumber(d.nhimaNumber);
    setBankName(d.bankName); setAccountNumber(d.accountNumber); setAccountName(d.accountName); setBranch(d.branch);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    if (!window.confirm("Discard this draft? The previous data will be lost and can't be recovered.")) return;
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    setPendingDraft(null);
  };

  const submit = () => {
    if (!name.trim() || !role.trim()) return;
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    const base = {
      name,
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      phone,
      address,
      maritalStatus: maritalStatus || null,
      dependants,
      emergencyContact: { name: ecName, relationship: ecRelationship, phone: ecPhone },
      role,
      startDate: startDate || null,
      contractType,
      probationMonths: contractType === "probationary" ? parseInt(probationMonths, 10) || undefined : undefined,
      contractEndDate: contractType === "fixed-term" ? contractEndDate || null : null,
      standardHoursPerDay: parseFloat(standardHoursPerDay) || undefined,
      noticePeriodDays: parseInt(noticePeriodDays, 10) || undefined,
      payType,
      basicSalary: payType === "monthly" ? parseFloat(basicSalary) || 0 : undefined,
      dailyRate: payType === "daily" ? parseFloat(dailyRate) || 0 : undefined,
      hourlyRate: payType === "hourly" ? parseFloat(hourlyRate) || 0 : undefined,
      daysWorked: editing?.daysWorked ?? 0,
      allowances: editing?.allowances ?? { housing: 0, transport: 0, bonus: 0 },
      deductions: editing?.deductions ?? { advance: 0, loan: 0 },
      nrc: nrc.trim() || null,
      tpin: tpin.trim() || null,
      napsaNumber: napsaNumber.trim() || null,
      nhimaNumber: nhimaNumber.trim() || null,
      bank: { bankName, accountNumber, accountName, branch },
      active: editing?.active ?? true,
    };
    onSave(editing ? { ...base, id: editing.id } : base);
  };

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-lg"
      title={editing ? "Edit staff" : "Add staff"}
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)))}
              disabled={step === 1}
            >
              Back
            </Button>
            <button
              type="button"
              onClick={onClose}
              title="Your progress is saved automatically — you can pick this back up later."
              className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
            >
              <FloppyDisk size={14} weight="duotone" />
              Save as draft
            </button>
          </div>
          {step < 3 ? (
            <Button variant="primary" className="px-5" onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}>
              Next
            </Button>
          ) : (
            <Button variant="primary" className="px-5" onClick={submit}>
              {editing ? "Save changes" : "Add staff"}
            </Button>
          )}
        </div>
      }
    >
      {pendingDraft && <DraftBanner draft={pendingDraft} onResume={resumeDraft} onDiscard={discardDraft} />}

      {/* Step indicator */}
      <div className="mb-5 flex items-center gap-2">
        {formSteps.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(s.n)}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                step === s.n ? "bg-brand text-paper" : step > s.n ? "bg-brand-soft text-brand" : "bg-mist text-muted"
              }`}
            >
              {s.n}
            </button>
            <span className={`text-xs font-medium ${step === s.n ? "text-ink" : "text-muted"}`}>{s.label}</span>
            {i < formSteps.length - 1 && <div className="h-px flex-1 bg-line" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Full legal name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date of birth</label>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Gender</label>
              <Select value={gender} onChange={(v) => setGender(v as Gender)} options={genderOptions} className="w-full" placeholder="Select" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Phone number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0977 123 456" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Residential address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Marital status</label>
              <Select value={maritalStatus} onChange={(v) => setMaritalStatus(v as MaritalStatus)} options={maritalOptions} className="w-full" placeholder="Select" />
            </div>
            <div>
              <label className={labelCls}>Dependants</label>
              <input type="number" min={0} value={dependants} onChange={(e) => setDependants(Number(e.target.value) || 0)} className={inputCls} />
            </div>
          </div>

          <p className="pt-2 text-xs font-medium text-muted">Emergency contact</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input value={ecName} onChange={(e) => setEcName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Relationship</label>
              <input value={ecRelationship} onChange={(e) => setEcRelationship(e.target.value)} placeholder="Spouse, parent, sibling…" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Phone number</label>
            <input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} className={inputCls} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Job title / role</label>
            <input value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Employment start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            <p className="mt-1 text-xs text-muted">Required for NAPSA registration within 30 days of hire.</p>
          </div>
          <div>
            <label className={labelCls}>Contract type</label>
            <Select value={contractType} onChange={(v) => setContractType(v as ContractType)} options={contractOptions} className="w-full" />
          </div>
          {contractType === "probationary" && (
            <div>
              <label className={labelCls}>Probation period (months)</label>
              <input type="number" min={0} value={probationMonths} onChange={(e) => setProbationMonths(e.target.value)} className={inputCls} />
            </div>
          )}
          {contractType === "fixed-term" && (
            <div>
              <label className={labelCls}>Contract end date</label>
              <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} className={inputCls} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Standard hours / day</label>
              <input type="number" min={0} value={standardHoursPerDay} onChange={(e) => setStandardHoursPerDay(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Notice period (days)</label>
              <input type="number" min={0} value={noticePeriodDays} onChange={(e) => setNoticePeriodDays(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Pay setup</label>
            <Select value={payType} onChange={(v) => setPayType(v as PayType)} options={payTypeOptions} className="w-full" />
          </div>
          {payType === "monthly" && (
            <div>
              <label className={labelCls}>Monthly salary (K)</label>
              <input value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} inputMode="decimal" className={inputCls} />
            </div>
          )}
          {payType === "daily" && (
            <div>
              <label className={labelCls}>Rate per day (K)</label>
              <input value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} inputMode="decimal" className={inputCls} />
              <p className="mt-1.5 text-xs text-muted">Days worked each cycle are entered on the Payroll page.</p>
            </div>
          )}
          {payType === "hourly" && (
            <div>
              <label className={labelCls}>Hourly rate (K)</label>
              <input value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} inputMode="decimal" className={inputCls} />
              <p className="mt-1.5 text-xs text-muted">Hours are logged on the Clock page.</p>
            </div>
          )}

          <p className="pt-2 text-xs font-medium text-muted">Compliance numbers</p>
          <div>
            <label className={labelCls}>NRC number</label>
            <input value={nrc} onChange={(e) => setNrc(e.target.value)} placeholder="123456/10/1" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>TPIN</label>
            <div className="flex gap-2">
              <input value={tpin} onChange={(e) => setTpin(e.target.value)} placeholder="1000123456" className={inputCls} />
              <Button
                variant="secondary"
                className="shrink-0 gap-1.5 px-3 text-xs"
                title="ZRA TPIN verification isn't available yet — this will check the number once it is."
                disabled
              >
                <ShieldCheck size={14} weight="duotone" />
                Verify
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>NAPSA number</label>
              <input value={napsaNumber} onChange={(e) => setNapsaNumber(e.target.value)} placeholder="If already registered" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>NHIMA number</label>
              <input value={nhimaNumber} onChange={(e) => setNhimaNumber(e.target.value)} placeholder="If already registered" className={inputCls} />
            </div>
          </div>

          <p className="pt-2 text-xs font-medium text-muted">Bank details</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Bank name</label>
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Branch / sort code</label>
              <input value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Account number</label>
            <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Account name</label>
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} />
            <p className="mt-1.5 text-xs text-amber-600">Must match the NRC name exactly, or the bank batch file will be rejected.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function EmployeeDetailDrawer({
  employee,
  onClose,
  onEdit,
  onDelete,
  onReactivate,
  onUpdateAllowance,
}: {
  employee: Employee;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReactivate: () => void;
  onUpdateAllowance: (key: keyof Employee["allowances"], value: number) => void;
}) {
  const rowInputCls = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <SlideOver
      onClose={onClose}
      title={employee.name}
      description={employee.role}
      footer={
        employee.active ? (
          <div className="flex justify-end gap-2">
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
            <Button variant="secondary" onClick={onEdit}>
              Edit
            </Button>
          </div>
        ) : (
          <Button variant="primary" className="w-full py-3" onClick={onReactivate}>
            Reactivate
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {!employee.active && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Inactive</span>
        )}
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${payTypeStyle[employee.payType]}`}>
          {payTypeLabel[employee.payType]}
        </span>
        <TpinBadge tpin={employee.tpin} />
        {!employee.nrc && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
            <AlertTriangle className="h-3 w-3" /> Missing NRC
          </span>
        )}
      </div>

      <p className="mt-6 text-sm font-medium text-ink">Personal</p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted">
        <p>DOB: {formatDate(employee.dateOfBirth)}</p>
        <p>Gender: {employee.gender ?? "—"}</p>
        <p>Phone: {employee.phone || "—"}</p>
        <p>Marital status: {employee.maritalStatus ?? "—"}</p>
        <p className="col-span-2">Address: {employee.address || "—"}</p>
        <p className="col-span-2">Dependants: {employee.dependants}</p>
      </div>

      <p className="mt-4 text-sm font-medium text-ink">Emergency contact</p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted">
        <p>{employee.emergencyContact.name || "—"}</p>
        <p>{employee.emergencyContact.relationship || "—"}</p>
        <p className="col-span-2">{employee.emergencyContact.phone || "—"}</p>
      </div>

      <p className="mt-4 text-sm font-medium text-ink">Employment</p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted">
        <p>Start date: {formatDate(employee.startDate)}</p>
        <p className="capitalize">Contract: {employee.contractType}</p>
        {employee.contractType === "probationary" && <p>Probation: {employee.probationMonths ?? "—"} months</p>}
        {employee.contractType === "fixed-term" && <p>Ends: {formatDate(employee.contractEndDate)}</p>}
        <p>Hours/day: {employee.standardHoursPerDay ?? "—"}</p>
        <p>Notice period: {employee.noticePeriodDays ?? "—"} days</p>
      </div>

      <p className="mt-4 text-sm font-medium text-ink">Compliance</p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted">
        <p>NRC: {employee.nrc ?? "—"}</p>
        <p>TPIN: {employee.tpin ?? "—"}</p>
        <p>NAPSA no.: {employee.napsaNumber ?? "—"}</p>
        <p>NHIMA no.: {employee.nhimaNumber ?? "—"}</p>
      </div>

      <p className="mt-4 text-sm font-medium text-ink">Bank details</p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted">
        <p>{employee.bank.bankName || "—"}</p>
        <p>{employee.bank.branch || "—"}</p>
        <p className="col-span-2">Acc: {employee.bank.accountNumber || "—"}</p>
        <p className="col-span-2">Name on account: {employee.bank.accountName || "—"}</p>
      </div>

      <div className="mt-4 space-y-1 text-sm text-muted">
        <p>
          {employee.payType === "monthly"
            ? `K${employee.basicSalary?.toLocaleString()} / month`
            : employee.payType === "daily"
              ? `K${employee.dailyRate?.toLocaleString()} / day`
              : `K${employee.hourlyRate} / hr`}
        </p>
      </div>

      <p className="mt-6 text-sm font-medium text-ink">Default allowances</p>
      <p className="text-xs text-muted">Recurring amounts applied to every payroll cycle for this person.</p>
      <div className="mt-2 space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Housing (K)</label>
          <input
            type="number"
            min={0}
            disabled={!employee.active}
            value={employee.allowances.housing}
            onChange={(e) => onUpdateAllowance("housing", Number(e.target.value) || 0)}
            className={rowInputCls}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Transport (K)</label>
          <input
            type="number"
            min={0}
            disabled={!employee.active}
            value={employee.allowances.transport}
            onChange={(e) => onUpdateAllowance("transport", Number(e.target.value) || 0)}
            className={rowInputCls}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Bonus (K)</label>
          <input
            type="number"
            min={0}
            disabled={!employee.active}
            value={employee.allowances.bonus}
            onChange={(e) => onUpdateAllowance("bonus", Number(e.target.value) || 0)}
            className={rowInputCls}
          />
        </div>
      </div>
    </SlideOver>
  );
}

function ConfirmDeleteModal({
  employee,
  onClose,
  onConfirm,
}: {
  employee: Employee;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Remove staff member?"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        This removes <span className="font-medium text-ink">{employee.name}</span> from the active roster and payroll. Their
        clock and payroll history is kept, and you can reactivate them later.
      </p>
    </Modal>
  );
}

export default function StaffEmployees() {
  const { employees, isReady, addEmployee, updateEmployee, deleteEmployee, reactivateEmployee } = useStaff();
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);

  const selected = employees.find((e) => e.id === selectedId) ?? null;

  const filtered = employees
    .filter((e) => showInactive || e.active)
    .filter((e) => {
      const q = query.toLowerCase();
      return !q || e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || (e.nrc ?? "").toLowerCase().includes(q);
    });

  return (
    <>
      <PageHeader title="Employees" />

      <div className="space-y-4 px-4 sm:px-8 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <Search className="h-4 w-4 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, role or NRC"
                className="w-64 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            + Add staff
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-64" />
              <col className="w-40" />
              <col className="w-36" />
              <col className="w-32" />
              <col className="w-40" />
              <col className="w-16" />
            </colgroup>
            <thead className="bg-mist text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Pay setup</th>
                <th className="px-4 py-3 font-medium">Start date</th>
                <th className="px-4 py-3 font-medium">Compliance</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {!isReady && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
              {isReady && filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`cursor-pointer border-t border-line transition-colors hover:bg-mist ${!e.active ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist text-[10px] font-semibold text-muted">
                        {e.name.split(" ").map((s) => s[0]).join("")}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{e.name}</p>
                        <p className="truncate text-xs text-muted">
                          {e.role}
                          {!e.active && " · Inactive"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {e.phone ? (
                      <span className="flex items-center gap-1.5">
                        <PhoneIcon size={12} weight="duotone" className="shrink-0" />
                        <span className="truncate">{e.phone}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${payTypeStyle[e.payType]}`}>
                      {payTypeLabel[e.payType]}
                    </span>
                    <p className="mt-1 text-xs text-muted">
                      {e.payType === "monthly"
                        ? e.basicSalary
                          ? `K${e.basicSalary.toLocaleString()}/mo`
                          : "—"
                        : e.payType === "daily"
                          ? e.dailyRate
                            ? `K${e.dailyRate.toLocaleString()}/day`
                            : "—"
                          : e.hourlyRate
                            ? `K${e.hourlyRate}/hr`
                            : "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(e.startDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <TpinBadge tpin={e.tpin} />
                      {!e.nrc && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                          <AlertTriangle className="h-3 w-3" /> Missing NRC
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.active && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEditing(e);
                          setShowForm(true);
                        }}
                        className="text-xs font-medium text-ink transition-colors hover:text-brand"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {isReady && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No staff match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selected && !showForm && (
          <EmployeeDetailDrawer
            employee={selected}
            onClose={() => setSelectedId(null)}
            onEdit={() => {
              setEditing(selected);
              setShowForm(true);
            }}
            onDelete={() => setDeleting(selected)}
            onReactivate={() => {
              reactivateEmployee(selected.id);
              setSelectedId(null);
            }}
            onUpdateAllowance={(key, value) =>
              updateEmployee(selected.id, { allowances: { ...selected.allowances, [key]: value } })
            }
          />
        )}
        {showForm && (
          <EmployeeFormModal
            editing={editing}
            onClose={() => setShowForm(false)}
            onSave={(e) => {
              if ("id" in e) {
                updateEmployee(e.id, e);
              } else {
                addEmployee(e);
              }
              setShowForm(false);
            }}
          />
        )}
        {deleting && (
          <ConfirmDeleteModal
            employee={deleting}
            onClose={() => setDeleting(null)}
            onConfirm={() => {
              deleteEmployee(deleting.id);
              setDeleting(null);
              setSelectedId(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
