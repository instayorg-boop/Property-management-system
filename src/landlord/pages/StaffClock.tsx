import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MagnifyingGlass as Search } from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import Select from "../components/Select";
import { useStaff, type ClockEntry } from "../StaffContext";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function EntryFormModal({
  editing,
  employeeOptions,
  onClose,
  onSave,
}: {
  editing: ClockEntry | null;
  employeeOptions: { value: string; label: string }[];
  onClose: () => void;
  onSave: (e: ClockEntry | Omit<ClockEntry, "id">) => void;
}) {
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? employeeOptions[0]?.value ?? "");
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [hours, setHours] = useState(editing?.hours?.toString() ?? "8");
  const [overtimeHours, setOvertimeHours] = useState(editing?.overtimeHours?.toString() ?? "0");

  const submit = () => {
    if (!employeeId) return;
    const base = {
      employeeId,
      date,
      hours: parseFloat(hours) || 0,
      overtimeHours: parseFloat(overtimeHours) || 0,
      source: "manual" as const,
    };
    onSave(editing ? { ...base, id: editing.id } : base);
  };

  return (
    <Modal
      onClose={onClose}
      title={editing ? "Edit time entry" : "Add time entry"}
      footer={
        <button
          type="button"
          onClick={submit}
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          {editing ? "Save changes" : "Add entry"}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Employee</label>
          <Select value={employeeId} onChange={setEmployeeId} options={employeeOptions} className="w-full" placeholder="Choose employee" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Hours</label>
            <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Overtime hours</label>
            <input value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Delete time entry?"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-700">
            Delete
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted">This entry will be permanently removed and no longer count toward payroll hours.</p>
    </Modal>
  );
}

export default function StaffClock() {
  const { employees, clockEntries, addClockEntry, updateClockEntry, deleteClockEntry } = useStaff();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClockEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const hourlyEmployees = useMemo(() => employees.filter((e) => e.payType === "hourly" && e.active), [employees]);
  const employeeOptions = hourlyEmployees.map((e) => ({ value: e.id, label: e.name }));
  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? "Unknown";

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const rows = clockEntries.filter((c) => !q || employeeName(c.employeeId).toLowerCase().includes(q));
    return [...rows].sort((a, b) => (a.date < b.date ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockEntries, query, employees]);

  return (
    <>
      <PageHeader title="Clock in & Clock out" />

      <div className="space-y-4 px-4 sm:px-8 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <Search className="h-4 w-4 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by employee"
              className="w-64 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <button
            type="button"
            disabled={hourlyEmployees.length === 0}
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Add entry
          </button>
        </div>

        <p className="text-xs text-muted">
          Hours logged here are added automatically to each hourly employee's pay.
        </p>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-48" />
              <col className="w-32" />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-28" />
              <col className="w-16" />
            </colgroup>
            <thead className="bg-mist text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3 font-medium">Overtime</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-line transition-colors hover:bg-mist">
                  <td className="truncate px-4 py-3 font-medium text-ink">{employeeName(c.employeeId)}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(c.date)}</td>
                  <td className="px-4 py-3 text-muted">{c.hours}</td>
                  <td className="px-4 py-3 text-muted">{c.overtimeHours > 0 ? c.overtimeHours : "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.source === "manual" ? "bg-sky-50 text-sky-600" : "bg-violet-50 text-violet-600"
                      }`}
                    >
                      {c.source === "manual" ? "Manual" : "Gatehouse"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(c);
                          setShowForm(true);
                        }}
                        className="text-xs font-medium text-ink transition-colors hover:text-brand"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(c.id)}
                        className="text-xs font-medium text-red-600 transition-colors hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No time entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <EntryFormModal
            editing={editing}
            employeeOptions={employeeOptions}
            onClose={() => setShowForm(false)}
            onSave={(e) => {
              if ("id" in e) {
                updateClockEntry(e.id, e);
              } else {
                addClockEntry(e);
              }
              setShowForm(false);
            }}
          />
        )}
        {deletingId && (
          <ConfirmDeleteModal
            onClose={() => setDeletingId(null)}
            onConfirm={() => {
              deleteClockEntry(deletingId);
              setDeletingId(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
