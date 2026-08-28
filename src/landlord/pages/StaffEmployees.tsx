import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import SlideOver from "../components/SlideOver";
import Select from "../components/Select";
import { useStaff, type Employee, type PayType } from "../StaffContext";

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

const payTypeOptions = [
  { value: "monthly", label: "Monthly Fixed" },
  { value: "hourly", label: "Hourly Rate" },
];

function EmployeeFormModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Employee | null;
  onClose: () => void;
  onSave: (e: Employee | Omit<Employee, "id">) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [role, setRole] = useState(editing?.role ?? "");
  const [nrc, setNrc] = useState(editing?.nrc ?? "");
  const [tpin, setTpin] = useState(editing?.tpin ?? "");
  const [payType, setPayType] = useState<PayType>(editing?.payType ?? "monthly");
  const [basicSalary, setBasicSalary] = useState(editing?.basicSalary?.toString() ?? "");
  const [hourlyRate, setHourlyRate] = useState(editing?.hourlyRate?.toString() ?? "");

  const submit = () => {
    if (!name.trim() || !role.trim()) return;
    const base = {
      name,
      role,
      nrc: nrc.trim() || null,
      tpin: tpin.trim() || null,
      payType,
      basicSalary: payType === "monthly" ? parseFloat(basicSalary) || 0 : undefined,
      hourlyRate: payType === "hourly" ? parseFloat(hourlyRate) || 0 : undefined,
      allowances: editing?.allowances ?? { housing: 0, transport: 0, bonus: 0 },
      deductions: editing?.deductions ?? { advance: 0, loan: 0 },
    };
    onSave(editing ? { ...base, id: editing.id } : base);
  };

  return (
    <Modal
      onClose={onClose}
      title={editing ? "Edit staff" : "Add staff"}
      footer={
        <button
          type="button"
          onClick={submit}
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          {editing ? "Save changes" : "Add staff"}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Role</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">NRC</label>
            <input value={nrc} onChange={(e) => setNrc(e.target.value)} placeholder="123456/10/1" className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">TPIN</label>
            <input value={tpin} onChange={(e) => setTpin(e.target.value)} placeholder="1000123456" className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Pay setup</label>
          <Select value={payType} onChange={(v) => setPayType(v as PayType)} options={payTypeOptions} className="w-full" />
        </div>

        {payType === "monthly" ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Monthly salary (K)</label>
            <input value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Hourly rate (K)</label>
            <input value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
            <p className="mt-1.5 text-xs text-muted">Hours worked are logged on the Clock page and feed into payroll automatically.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function EmployeeDetailDrawer({
  employee,
  onClose,
  onEdit,
  onDelete,
  onUpdateAllowance,
}: {
  employee: Employee;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdateAllowance: (key: keyof Employee["allowances"], value: number) => void;
}) {
  const inputCls = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <SlideOver
      onClose={onClose}
      title={employee.name}
      description={employee.role}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onDelete} className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
            Delete
          </button>
          <button type="button" onClick={onEdit} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Edit
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {employee.payType === "monthly" ? (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600">Monthly Fixed</span>
        ) : (
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-600">Hourly Rate</span>
        )}
        <TpinBadge tpin={employee.tpin} />
        {!employee.nrc && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
            <AlertTriangle className="h-3 w-3" /> Missing NRC
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1 text-sm text-muted">
        <p>NRC: {employee.nrc ?? "—"}</p>
        <p>TPIN: {employee.tpin ?? "—"}</p>
        <p>{employee.payType === "monthly" ? `K${employee.basicSalary?.toLocaleString()} / month` : `K${employee.hourlyRate} / hr`}</p>
      </div>

      <p className="mt-6 text-sm font-medium text-ink">Default allowances</p>
      <p className="text-xs text-muted">Recurring amounts applied to every payroll cycle for this person.</p>
      <div className="mt-2 space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Housing (K)</label>
          <input
            type="number"
            min={0}
            value={employee.allowances.housing}
            onChange={(e) => onUpdateAllowance("housing", Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Transport (K)</label>
          <input
            type="number"
            min={0}
            value={employee.allowances.transport}
            onChange={(e) => onUpdateAllowance("transport", Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Bonus (K)</label>
          <input
            type="number"
            min={0}
            value={employee.allowances.bonus}
            onChange={(e) => onUpdateAllowance("bonus", Number(e.target.value) || 0)}
            className={inputCls}
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
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        This will permanently remove <span className="font-medium text-ink">{employee.name}</span> from the staff roster. This
        can't be undone.
      </p>
    </Modal>
  );
}

export default function StaffEmployees() {
  const { employees, addEmployee, updateEmployee, deleteEmployee } = useStaff();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);

  const selected = employees.find((e) => e.id === selectedId) ?? null;

  const filtered = employees.filter((e) => {
    const q = query.toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || (e.nrc ?? "").toLowerCase().includes(q);
  });

  return (
    <>
      <PageHeader title="Staff" />

      <div className="space-y-4 px-8 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <Search className="h-4 w-4 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, role or NRC"
              className="w-64 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
          >
            + Add staff
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-56" />
              <col className="w-40" />
              <col className="w-36" />
              <col className="w-36" />
              <col className="w-16" />
            </colgroup>
            <thead className="bg-mist text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Pay setup</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-mist"
                >
                  <td className="truncate px-4 py-3 font-medium text-ink">{e.name}</td>
                  <td className="truncate px-4 py-3 text-muted">{e.role}</td>
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
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
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
