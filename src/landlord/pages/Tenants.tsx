import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import Modal from "../components/Modal";
import LogPaymentModal from "../components/LogPaymentModal";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <path d="M10.5 2.5 13.5 5.5 5 14H2v-3l8.5-8.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6.5 7.5v4M9.5 7.5v4M3.5 4.5l.6 8a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


type PaymentStatus = "paid" | "overdue" | "partial";

type LedgerRow = { month: string; amount: string; status: PaymentStatus };

type Tenant = {
  id: string;
  name: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  property: string;
  room: string;
  moveInDate: string;
  rent: string;
  status: PaymentStatus;
  daysOverdue?: number;
  owed?: string;
  depositAmount: string;
  depositStatus: "Held" | "Refunded" | "Forfeited";
  onTimeCount: number;
  active: boolean;
  ledger: LedgerRow[];
};

const initialTenants: Tenant[] = [
  {
    id: "t1", name: "A. Mwansa", phone: "0977 123 456", guardianName: "P. Mwansa", guardianPhone: "0966 234 567",
    property: "Sunrise Apartments", room: "Room 12", moveInDate: "12 Jan 2025", rent: "K1,200", status: "paid",
    depositAmount: "K1,200", depositStatus: "Held", onTimeCount: 7, active: true,
    ledger: [
      { month: "August 2026", amount: "K1,200", status: "paid" },
      { month: "July 2026", amount: "K1,200", status: "paid" },
      { month: "June 2026", amount: "K1,200", status: "paid" },
    ],
  },
  {
    id: "t2", name: "B. Phiri", phone: "0955 345 678", guardianName: "R. Phiri", guardianPhone: "0977 456 789",
    property: "Sunrise Apartments", room: "Room 08", moveInDate: "3 Mar 2025", rent: "K950", status: "overdue", daysOverdue: 12, owed: "K1,140",
    depositAmount: "K950", depositStatus: "Held", onTimeCount: 3, active: true,
    ledger: [
      { month: "August 2026", amount: "K1,140", status: "overdue" },
      { month: "July 2026", amount: "K950", status: "paid" },
      { month: "June 2026", amount: "K950", status: "paid" },
    ],
  },
  {
    id: "t3", name: "C. Banda", phone: "0966 456 789", guardianName: "S. Banda", guardianPhone: "0955 567 890",
    property: "Sunrise Apartments", room: "Room 03", moveInDate: "20 Feb 2025", rent: "K1,100", status: "partial", owed: "K400",
    depositAmount: "K1,100", depositStatus: "Held", onTimeCount: 5, active: true,
    ledger: [
      { month: "August 2026", amount: "K700 of K1,100", status: "partial" },
      { month: "July 2026", amount: "K1,100", status: "paid" },
    ],
  },
  {
    id: "t4", name: "D. Zulu", phone: "0977 567 890", guardianName: "T. Zulu", guardianPhone: "0966 678 901",
    property: "Sunrise Apartments", room: "Room 05", moveInDate: "1 Apr 2025", rent: "K1,000", status: "paid",
    depositAmount: "K1,000", depositStatus: "Held", onTimeCount: 9, active: true,
    ledger: [{ month: "August 2026", amount: "K1,000", status: "paid" }],
  },
  {
    id: "t5", name: "F. Chileshe", phone: "0955 678 901", guardianName: "U. Chileshe", guardianPhone: "0977 789 012",
    property: "Kabulonga House", room: "Room 19", moveInDate: "15 May 2025", rent: "K950", status: "paid",
    depositAmount: "K950", depositStatus: "Held", onTimeCount: 4, active: true,
    ledger: [{ month: "August 2026", amount: "K950", status: "paid" }],
  },
  {
    id: "t6", name: "G. Mwape", phone: "0977 890 123", guardianName: "W. Mwape", guardianPhone: "0966 901 234",
    property: "Kabulonga House", room: "Room 22", moveInDate: "8 Jun 2025", rent: "K1,100", status: "paid",
    depositAmount: "K1,100", depositStatus: "Held", onTimeCount: 3, active: true,
    ledger: [{ month: "August 2026", amount: "K1,100", status: "paid" }],
  },
  {
    id: "t7", name: "H. Banda", phone: "0955 901 234", guardianName: "X. Banda", guardianPhone: "0977 012 345",
    property: "Kabulonga House", room: "Room 14", moveInDate: "2 Jul 2025", rent: "K1,200", status: "overdue", daysOverdue: 4, owed: "K1,200",
    depositAmount: "K1,200", depositStatus: "Held", onTimeCount: 2, active: true,
    ledger: [{ month: "August 2026", amount: "K1,200", status: "overdue" }],
  },
  {
    id: "t8", name: "M. Ngoma", phone: "0966 789 012", guardianName: "V. Ngoma", guardianPhone: "0955 890 123",
    property: "Sunrise Apartments", room: "Room 30", moveInDate: "10 Nov 2024", rent: "K900", status: "paid",
    depositAmount: "K900", depositStatus: "Refunded", onTimeCount: 10, active: false,
    ledger: [{ month: "July 2026", amount: "K900", status: "paid" }],
  },
];

const vacantRoomsForAssignment = [
  { room: "Room 21", rent: "K1,200" },
  { room: "Room 24", rent: "K900" },
  { room: "Room 36", rent: "K650" },
];

const statusStyle: Record<PaymentStatus, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  partial: "bg-amber-50 text-amber-600",
};

const statusLabel: Record<PaymentStatus, string> = { paid: "Paid", overdue: "Overdue", partial: "Partial" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function TenantDrawer({
  tenant,
  onClose,
  onLogPayment,
  onMoveOut,
  onEdit,
}: {
  tenant: Tenant;
  onClose: () => void;
  onLogPayment: () => void;
  onMoveOut: () => void;
  onEdit: () => void;
}) {
  return (
    <SlideOver
      onClose={onClose}
      title={tenant.name}
      description={`${tenant.room} · ${tenant.property}`}
      footer={
        <div className="space-y-2">
          <button
            type="button"
            onClick={onLogPayment}
            className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
          >
            Log payment
          </button>
          <button type="button" className="w-full rounded-lg border border-line py-3 text-sm font-medium text-ink hover:bg-mist">
            Send reminder
          </button>
          <button
            type="button"
            onClick={onMoveOut}
            className="w-full rounded-lg py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Move out
          </button>
        </div>
      }
    >
      <div className="flex justify-end">
        <button type="button" onClick={onEdit} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-mist">
          Edit
        </button>
      </div>

      <div className="mt-2 space-y-1 text-sm text-muted">
        <p>{tenant.phone}</p>
        <p>
          Guardian: {tenant.guardianName} · {tenant.guardianPhone}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-line bg-mist p-3">
          <p className="text-[11px] text-muted">Outstanding</p>
          <p className="mt-1 text-sm font-semibold text-ink">{tenant.owed ?? "K0"}</p>
        </div>
        <div className="rounded-xl border border-line bg-mist p-3">
          <p className="text-[11px] text-muted">Deposit</p>
          <p className="mt-1 text-sm font-semibold text-ink">{tenant.depositStatus}</p>
        </div>
        <div className="rounded-xl border border-line bg-mist p-3">
          <p className="text-[11px] text-muted">On-time</p>
          <p className="mt-1 text-sm font-semibold text-ink">{tenant.onTimeCount} months</p>
        </div>
      </div>

      <p className="mt-6 text-sm font-medium text-ink">Payment ledger</p>
      <div className="mt-2 divide-y divide-line rounded-xl border border-line">
        {tenant.ledger.map((row) => (
          <div key={row.month} className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-sm text-ink">{row.month}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">{row.amount}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusStyle[row.status]}`}>
                {statusLabel[row.status]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </SlideOver>
  );
}

function TenantFormModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Tenant | null;
  onClose: () => void;
  onSave: (t: Tenant) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [guardianName, setGuardianName] = useState(editing?.guardianName ?? "");
  const [guardianPhone, setGuardianPhone] = useState(editing?.guardianPhone ?? "");
  const [property, setProperty] = useState(editing?.property ?? "Sunrise Apartments");
  const [roomIndex, setRoomIndex] = useState(0);
  const [moveInDate, setMoveInDate] = useState(todayISO());
  const room = vacantRoomsForAssignment[roomIndex];
  const [rent, setRent] = useState(editing?.rent ?? room.rent);
  const [depositAmount, setDepositAmount] = useState(editing?.depositAmount ?? room.rent);
  const [depositMethod, setDepositMethod] = useState<"mobile" | "cash">("mobile");

  const selectRoom = (i: number) => {
    setRoomIndex(i);
    setRent(vacantRoomsForAssignment[i].rent);
    setDepositAmount(vacantRoomsForAssignment[i].rent);
  };

  const submit = () => {
    if (!name.trim()) return;
    if (editing) {
      onSave({ ...editing, name, phone, guardianName, guardianPhone, property, rent, depositAmount });
      return;
    }
    onSave({
      id: `t${Date.now()}`,
      name,
      phone,
      guardianName,
      guardianPhone,
      property,
      room: room.room,
      moveInDate: new Date(moveInDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      rent,
      status: "paid",
      depositAmount,
      depositStatus: "Held",
      onTimeCount: 0,
      active: true,
      ledger: [],
    });
  };

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-lg"
      title={editing ? "Edit tenant" : "Add tenant"}
      description={editing ? undefined : "Completed at the property office in under 4 minutes."}
      footer={
        <button
          type="button"
          onClick={submit}
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          {editing ? "Save changes" : "Add tenant"}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-muted">Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>
        {editing ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Property</label>
            <input value={property} onChange={(e) => setProperty(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Move-in date</label>
            <input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Guardian name</label>
          <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Guardian phone</label>
          <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>

        {editing ? (
          <div className="sm:col-span-2 rounded-lg bg-mist px-3.5 py-2.5 text-sm text-muted">
            Room: <span className="font-medium text-ink">{editing.room}</span> — reassign rooms from the Rooms page.
          </div>
        ) : (
          <>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted">Property</label>
              <input value={property} onChange={(e) => setProperty(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted">Room (vacant only)</label>
              <div className="grid grid-cols-3 gap-2">
                {vacantRoomsForAssignment.map((r, i) => (
                  <button
                    key={r.room}
                    type="button"
                    onClick={() => selectRoom(i)}
                    className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                      roomIndex === i ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                    }`}
                  >
                    {r.room} · {r.rent}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Agreed rent</label>
          <input value={rent} onChange={(e) => setRent(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Deposit amount</label>
          <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>

        {!editing && (
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-muted">Deposit method</label>
            <div className="grid grid-cols-2 gap-2">
              {(["mobile", "cash"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDepositMethod(m)}
                  className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    depositMethod === m ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                  }`}
                >
                  {m === "mobile" ? "Mobile money" : "Cash"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ConfirmDeleteModal({
  tenant,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Delete tenant?"
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
        This will permanently remove <span className="font-medium text-ink">{tenant.name}</span> and their payment history. This
        can't be undone.
      </p>
    </Modal>
  );
}

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "moved-out">("active");
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [showLogPayment, setShowLogPayment] = useState(false);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Tenant | null>(null);
  const rowsPerPage = 8;

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const matchesQuery = t.name.toLowerCase().includes(query.toLowerCase()) || t.room.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "active" ? t.active : !t.active;
      return matchesQuery && matchesStatus;
    });
  }, [tenants, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <>
      <PageHeader title="Tenants" />

      <div className="space-y-4 px-8 pb-10">
        {/* Top actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            Export all data
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
          >
            + Add tenant
          </button>
        </div>

        <div className="rounded-2xl border border-line bg-paper">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name or room"
                className="w-52 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>

            <div className="ml-auto flex rounded-lg border border-line p-0.5">
              {(["active", "moved-out"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatusFilter(s);
                    setPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === s ? "bg-ink text-paper" : "text-muted hover:bg-mist"
                  }`}
                >
                  {s === "active" ? "Active" : "Moved out"}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-mist text-[11px] text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Property</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Room</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Move-in date</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Rent</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">This month</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className="cursor-pointer border-t border-line transition-colors hover:bg-mist"
                  >
                    <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                    <td className="px-4 py-3 text-muted">{t.property}</td>
                    <td className="px-4 py-3 text-muted">{t.room}</td>
                    <td className="px-4 py-3 text-muted">{t.moveInDate}</td>
                    <td className="px-4 py-3 text-muted">{t.rent}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                        {statusLabel[t.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3 text-muted">
                        <button
                          type="button"
                          aria-label="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(t);
                          }}
                          className="transition-colors hover:text-ink"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleting(t);
                          }}
                          className="transition-colors hover:text-red-600"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
                      No tenants found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
            <div className="flex items-center gap-1.5">
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

            <div className="flex items-center gap-2 text-sm text-muted">
              Go to page
              <input
                type="number"
                min={1}
                max={pageCount}
                value={currentPage}
                onChange={(e) => setPage(Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)))}
                className="w-14 rounded-lg border border-line px-2 py-1 text-center text-sm text-ink outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <TenantDrawer
            tenant={selected}
            onClose={() => setSelected(null)}
            onLogPayment={() => setShowLogPayment(true)}
            onEdit={() => setEditing(selected)}
            onMoveOut={() => {
              setTenants((prev) => prev.map((t) => (t.id === selected.id ? { ...t, active: false } : t)));
              setSelected(null);
            }}
          />
        )}
        {showAdd && (
          <TenantFormModal
            editing={null}
            onClose={() => setShowAdd(false)}
            onSave={(t) => {
              setTenants((prev) => [t, ...prev]);
              setShowAdd(false);
            }}
          />
        )}
        {editing && (
          <TenantFormModal
            editing={editing}
            onClose={() => setEditing(null)}
            onSave={(t) => {
              setTenants((prev) => prev.map((x) => (x.id === t.id ? t : x)));
              setSelected((prev) => (prev && prev.id === t.id ? t : prev));
              setEditing(null);
            }}
          />
        )}
        {deleting && (
          <ConfirmDeleteModal
            tenant={deleting}
            onClose={() => setDeleting(null)}
            onConfirm={() => {
              setTenants((prev) => prev.filter((x) => x.id !== deleting.id));
              setDeleting(null);
              setSelected((prev) => (prev && prev.id === deleting.id ? null : prev));
            }}
          />
        )}
        {showLogPayment && selected && (
          <LogPaymentModal
            tenantName={selected.name}
            room={selected.room}
            outstanding={selected.owed ?? "K0"}
            onClose={() => setShowLogPayment(false)}
            onConfirm={() => {
              setTenants((prev) => prev.map((t) => (t.id === selected.id ? { ...t, status: "paid", owed: undefined } : t)));
              setShowLogPayment(false);
              setSelected(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
