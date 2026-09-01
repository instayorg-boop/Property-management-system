import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DeviceMobile, Money, Bank, CaretDown } from "@phosphor-icons/react";
import SlideOver from "./SlideOver";
import { useTenants, type DepositMethod, type Tenant } from "../TenantsContext";
import { useVacantRoomsForAssignment, type VacantRoom } from "../RoomsContext";
import { useSettings } from "../SettingsContext";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const depositMethods: { id: DepositMethod; label: string; Icon: typeof Money }[] = [
  { id: "mobile", label: "Mobile money", Icon: DeviceMobile },
  { id: "cash", label: "Cash", Icon: Money },
  { id: "bank", label: "Bank transfer", Icon: Bank },
];

/** Searchable, vacant-only room picker — a plain grid gets unwieldy once there are more than a handful of rooms. */
function RoomPicker({
  rooms,
  selected,
  onSelect,
}: {
  rooms: VacantRoom[];
  selected: VacantRoom | null;
  onSelect: (r: VacantRoom) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<number | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => r.room.toLowerCase().includes(q) || r.roomType.toLowerCase().includes(q));
  }, [rooms, query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-left text-sm outline-none focus:border-brand"
      >
        <span className={selected ? "text-ink" : "text-muted"}>
          {selected ? `${selected.room} · ${selected.roomType} · K${selected.rent.toLocaleString()}` : "Select a vacant room"}
        </span>
        <CaretDown size={14} weight="bold" className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-paper shadow-card">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                blurTimeout.current = window.setTimeout(() => setOpen(false), 120);
              }}
              onFocus={() => {
                if (blurTimeout.current) window.clearTimeout(blurTimeout.current);
              }}
              placeholder="Search room number or type"
              className="w-full rounded-md bg-mist px-2.5 py-1.5 text-sm outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.room}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(r);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-mist"
              >
                <span className="text-ink">
                  {r.room} · {r.roomType}
                </span>
                <span className="text-muted">K{r.rent.toLocaleString()}</span>
              </button>
            ))}
            {results.length === 0 && <p className="px-3 py-3 text-sm text-muted">No vacant rooms match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TenantFormDrawer({
  editing,
  onClose,
  onSaved,
}: {
  editing: Tenant | null;
  onClose: () => void;
  onSaved?: (t: Tenant) => void;
}) {
  const { addTenant, updateTenant } = useTenants();
  const { propertyName } = useSettings();
  const vacantRooms = useVacantRoomsForAssignment();

  const [name, setName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [guardianName, setGuardianName] = useState(editing?.guardianName ?? "");
  const [guardianPhone, setGuardianPhone] = useState(editing?.guardianPhone ?? "");
  const [selectedRoom, setSelectedRoom] = useState<VacantRoom | null>(null);
  const [moveInDate, setMoveInDate] = useState(todayISO());

  const [depositAmount, setDepositAmount] = useState(editing?.depositAmount ?? 0);
  const [depositDate, setDepositDate] = useState(editing?.depositDate ?? todayISO());
  const [depositMethod, setDepositMethod] = useState<DepositMethod>(editing?.depositMethod ?? "mobile");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  const selectRoom = (r: VacantRoom) => {
    setSelectedRoom(r);
    setDepositAmount(r.depositAmount);
  };

  const submit = () => {
    if (!name.trim()) return;
    if (editing) {
      const patch = {
        name,
        phone,
        guardianName,
        guardianPhone,
        depositAmount,
        depositDate,
        depositMethod,
        notes,
      };
      updateTenant(editing.id, patch);
      onSaved?.({ ...editing, ...patch });
      onClose();
      return;
    }
    if (!selectedRoom) return;
    const created = addTenant({
      name,
      phone,
      guardianName,
      guardianPhone,
      property: propertyName,
      room: selectedRoom.room,
      roomType: selectedRoom.roomType,
      moveInDate: new Date(moveInDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      rentAmount: selectedRoom.rent,
      status: "paid",
      owedAmount: 0,
      depositAmount,
      depositDate: new Date(depositDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      depositMethod,
      depositStatus: "Held",
      notes,
      onTimeCount: 0,
      totalMonthsCount: 0,
      active: true,
      ledger: [],
    });
    onSaved?.(created);
    onClose();
  };

  return (
    <SlideOver
      onClose={onClose}
      title={editing ? "Edit tenant" : "Add tenant"}
      description={editing ? undefined : "Completed at the property office in under 4 minutes."}
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={!editing && !selectedRoom}
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
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
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Property</label>
          <div className="flex h-10.5 items-center rounded-lg bg-mist px-3 text-sm text-muted">{editing?.property ?? propertyName}</div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Parent/guardian name</label>
          <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Parent/guardian phone</label>
          <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>

        {editing ? (
          <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-lg bg-mist px-3.5 py-2.5 text-sm">
            <span className="text-muted">
              Room: <span className="font-medium text-ink">{editing.room}</span> ({editing.roomType})
            </span>
            <Link to="/rooms" className="shrink-0 text-xs font-medium text-brand hover:underline">
              Change room →
            </Link>
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Move-in date</label>
              <input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted">Room (vacant only)</label>
              <RoomPicker rooms={vacantRooms} selected={selectedRoom} onSelect={selectRoom} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Agreed rent</label>
              <div className="flex h-10.5 items-center rounded-lg bg-mist px-3 text-sm text-muted">
                {selectedRoom ? `K${selectedRoom.rent.toLocaleString()} / month` : "Set by the room you select"}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Deposit terms</label>
              <div className="flex h-10.5 items-center rounded-lg bg-mist px-3 text-sm text-muted">
                {selectedRoom ? selectedRoom.depositRefundability : "Set by the room you select"}
              </div>
            </div>
          </>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Deposit amount (K)</label>
          <input
            type="number"
            min={0}
            value={depositAmount}
            onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Deposit date</label>
          <input
            type="date"
            value={depositDate}
            onChange={(e) => setDepositDate(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-muted">Deposit method</label>
          <div className="grid grid-cols-3 gap-2">
            {depositMethods.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setDepositMethod(id)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border py-2.5 text-xs font-medium transition-colors ${
                  depositMethod === id ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                }`}
              >
                <Icon size={18} weight="duotone" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-muted">Notes (landlord-only)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Payment arrangements, special circumstances, anything worth remembering about this tenant."
            className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
      </div>
    </SlideOver>
  );
}
