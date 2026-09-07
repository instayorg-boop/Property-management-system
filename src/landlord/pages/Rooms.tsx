import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CaretDown,
  Plus,
  Wrench,
  Bed,
  UsersThree,
  DoorOpen,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import Modal from "../components/Modal";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantSearchDrawer from "../components/TenantSearchDrawer";
import AddRoomTypeDrawer from "../components/AddRoomTypeDrawer";
import { useTenants, formatCurrency, type PaymentStatus, type Tenant } from "../TenantsContext";
import { useRooms, useRoomsView, roomLabel, type RoomTypeConfig, type RoomView, type VacantRoom } from "../RoomsContext";
import { Skeleton } from "../components/Skeleton";

// ---------- Icons ----------

function ChevronDownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <CaretDown className={className} weight="bold" />;
}

function PlusIcon({ className = "h-3 w-3" }: { className?: string }) {
  return <Plus className={className} weight="bold" />;
}

function WrenchIcon() {
  return <Wrench size={14} weight="duotone" />;
}

function BedIcon() {
  return <Bed size={16} weight="duotone" />;
}

function UsersIcon() {
  return <UsersThree size={16} weight="duotone" />;
}

function DoorIcon() {
  return <DoorOpen size={16} weight="duotone" />;
}

const dotColor: Record<PaymentStatus, string> = {
  paid: "bg-emerald-500",
  overdue: "bg-red-500",
  unpaid: "bg-slate-400",
  partial: "bg-amber-500",
};

function vacantRoomFor(room: RoomView): VacantRoom {
  return {
    room: roomLabel(room.number),
    roomType: room.typeConfig.name,
    rent: room.typeConfig.rent,
    depositAmount: room.typeConfig.depositAmount,
    depositRefundability: room.typeConfig.depositRefundability,
  };
}

// ---------- Room card ----------

function BedSlot({ bed }: { bed: Tenant | null }) {
  if (!bed) {
    return (
      <div className="flex flex-1 items-center justify-center text-paper/40">
        <PlusIcon />
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-0.5 px-0.5">
      <span className="truncate text-[9px] leading-tight font-medium text-paper">{bed.name.split(" ")[0]}</span>
      <span className={`h-1 w-1 rounded-full ${dotColor[bed.status]}`} />
    </div>
  );
}

function RoomCard({ room, onSelect }: { room: RoomView; onSelect: () => void }) {
  const capacity = room.beds.length;

  if (room.status === "vacant") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex aspect-square flex-col items-center justify-center rounded-lg border border-line bg-paper transition-colors hover:border-ink/20"
      >
        <span className="font-display text-sm font-semibold text-muted">{room.number}</span>
      </button>
    );
  }

  if (room.status === "reserved") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg bg-sky-100 transition-opacity hover:opacity-90"
      >
        <span className="font-display text-sm font-semibold text-sky-900">{room.number}</span>
        <span className="text-[8px] font-medium text-sky-700 uppercase">Reserved</span>
      </button>
    );
  }

  if (room.status === "not-ready") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg bg-slate-200 transition-opacity hover:opacity-90"
      >
        <WrenchIcon />
        <span className="font-display text-xs font-semibold text-slate-600">{room.number}</span>
      </button>
    );
  }

  // occupied
  if (capacity === 1) {
    const occupant = room.beds[0];
    return (
      <button
        type="button"
        onClick={onSelect}
        className="relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg bg-teal-600 transition-opacity hover:opacity-90"
      >
        <span className="absolute top-1 left-1 text-[9px] font-semibold text-paper/70">{room.number}</span>
        {occupant && (
          <>
            <span className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${dotColor[occupant.status]}`} />
            <span className="truncate px-1.5 text-xs font-medium text-paper">{occupant.name.split(" ")[0]}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex aspect-square flex-col overflow-hidden rounded-lg bg-teal-600 transition-opacity hover:opacity-90"
    >
      <span className="px-1.5 pt-1 text-[9px] font-semibold text-paper/70">{room.number}</span>
      <div className={`grid flex-1 divide-paper/15 ${capacity === 2 ? "grid-cols-1 divide-y" : "grid-cols-2 divide-x divide-y"}`}>
        {room.beds.map((bed, i) => (
          <BedSlot key={i} bed={bed} />
        ))}
      </div>
    </button>
  );
}

// ---------- Room detail (SlideOver, matching every other page) ----------

function OccupantLine({ occupant, onViewRecord, onLogPayment }: { occupant: Tenant; onViewRecord: () => void; onLogPayment: () => void }) {
  return (
    <div className="mt-3 rounded-lg border border-line bg-mist p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold">{occupant.name}</p>
        <span className={`h-2.5 w-2.5 rounded-full ${dotColor[occupant.status]}`} />
      </div>
      <p className="mt-1 text-sm text-muted">{occupant.phone}</p>
      <p className="mt-1 text-xs text-muted">Moved in {occupant.moveInDate}</p>

      <div className="mt-3 border-t border-line pt-3 text-sm">
        {occupant.status === "overdue" || occupant.status === "unpaid" ? (
          <p className="font-medium text-red-600">
            {occupant.daysOverdue ? `${occupant.daysOverdue} days overdue — ` : ""}
            {formatCurrency(occupant.owedAmount)} owed
          </p>
        ) : occupant.status === "partial" ? (
          <p className="font-medium text-amber-600">Partial payment this month</p>
        ) : (
          <p className="font-medium text-emerald-600">Paid this month</p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onViewRecord}
          className="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          View full record
        </button>
        <button
          type="button"
          onClick={onLogPayment}
          className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          Log payment
        </button>
      </div>
    </div>
  );
}

function RoomDetailDrawer({
  room,
  onClose,
  onViewRecord,
  onLogPayment,
  onAssignTenant,
  onMarkReady,
  onMarkNotReady,
  onDeleteRoom,
}: {
  room: RoomView;
  onClose: () => void;
  onViewRecord: (tenant: Tenant) => void;
  onLogPayment: (tenant: Tenant) => void;
  onAssignTenant: () => void;
  onMarkReady: () => void;
  onMarkNotReady: () => void;
  onDeleteRoom: () => void;
}) {
  const capacity = room.beds.length;

  return (
    <SlideOver
      onClose={onClose}
      title={`Room ${room.number}`}
      description={`${room.typeConfig.name}${room.status === "reserved" ? " · Reserved" : ""}${room.status === "not-ready" ? " · Not ready" : ""}`}
    >
      {room.status === "vacant" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-line bg-mist p-3">
              <p className="text-[11px] text-muted">Rent</p>
              <p className="mt-1 text-sm font-semibold text-ink">{formatCurrency(room.typeConfig.rent)} / month</p>
            </div>
            <div className="rounded-lg border border-line bg-mist p-3">
              <p className="text-[11px] text-muted">Deposit</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {formatCurrency(room.typeConfig.depositAmount)} · {room.typeConfig.depositRefundability}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAssignTenant}
            className="mt-6 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
          >
            Assign tenant
          </button>
          <button
            type="button"
            onClick={onMarkNotReady}
            className="mt-2 w-full rounded-lg border border-line py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            Take out of service
          </button>
          <button
            type="button"
            onClick={onDeleteRoom}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
          >
            <Trash size={12} weight="bold" />
            Delete this room
          </button>
        </>
      )}

      {room.status === "reserved" && (
        <p className="text-sm text-muted">
          This room is reserved for an upcoming booking and won't be shown as available until it's released.
        </p>
      )}

      {room.status === "not-ready" && (
        <>
          <p className="text-sm text-muted">Marked as under maintenance or cleaning. Mark ready once it's turned around.</p>
          <button
            type="button"
            onClick={onMarkReady}
            className="mt-6 w-full rounded-lg border border-line py-3 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            Mark as ready
          </button>
          <button
            type="button"
            onClick={onDeleteRoom}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
          >
            <Trash size={12} weight="bold" />
            Delete this room
          </button>
        </>
      )}

      {room.status === "occupied" &&
        (capacity === 1 ? (
          room.beds[0] && (
            <OccupantLine
              occupant={room.beds[0]}
              onViewRecord={() => onViewRecord(room.beds[0]!)}
              onLogPayment={() => onLogPayment(room.beds[0]!)}
            />
          )
        ) : (
          room.beds.map((bed, i) => (
            <div key={i}>
              <p className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">Bed {i + 1}</p>
              {bed ? (
                <OccupantLine occupant={bed} onViewRecord={() => onViewRecord(bed)} onLogPayment={() => onLogPayment(bed)} />
              ) : (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-dashed border-line p-4">
                  <span className="text-sm text-muted">Empty bed</span>
                  <button type="button" onClick={onAssignTenant} className="rounded-lg bg-brand px-4 py-1.5 text-xs font-medium text-paper">
                    Assign tenant
                  </button>
                </div>
              )}
            </div>
          ))
        ))}
    </SlideOver>
  );
}

function ReassignConfirmModal({
  tenant,
  targetRoom,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  targetRoom: VacantRoom;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Move this tenant?"
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
            Move tenant
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        Move <span className="font-medium text-ink">{tenant.name}</span> from{" "}
        <span className="font-medium text-ink">{tenant.room}</span> to{" "}
        <span className="font-medium text-ink">{targetRoom.room}</span>? Their rent will update to{" "}
        {formatCurrency(targetRoom.rent)}/month to match the new room.
      </p>
    </Modal>
  );
}

// ---------- Room type edit / delete ----------

const refundabilityOptions: RoomTypeConfig["depositRefundability"][] = ["Refundable", "Partially refundable", "Non-refundable"];

function EditRoomTypeModal({
  type,
  onClose,
  onSave,
}: {
  type: RoomTypeConfig;
  onClose: () => void;
  onSave: (patch: Pick<RoomTypeConfig, "name" | "rent" | "depositAmount" | "depositRefundability">) => void;
}) {
  const [name, setName] = useState(type.name);
  const [rent, setRent] = useState(type.rent);
  const [depositAmount, setDepositAmount] = useState(type.depositAmount);
  const [depositRefundability, setDepositRefundability] = useState(type.depositRefundability);

  const canSave = name.trim().length > 0 && rent > 0;

  return (
    <Modal
      onClose={onClose}
      title="Edit room type"
      description="Beds per room can't be changed here — that would affect rooms already assigned to tenants."
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => canSave && onSave({ name: name.trim(), rent, depositAmount, depositRefundability })}
            disabled={!canSave}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-muted">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Rent (K/month)</label>
          <input
            type="number"
            min={0}
            value={rent}
            onChange={(e) => setRent(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Deposit (K)</label>
          <input
            type="number"
            min={0}
            value={depositAmount}
            onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-muted">Deposit terms</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {refundabilityOptions.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setDepositRefundability(o)}
                className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${
                  depositRefundability === o ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteRoomTypeModal({
  type,
  roomCount,
  onClose,
  onConfirm,
}: {
  type: RoomTypeConfig;
  roomCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Delete this room type?"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={roomCount > 0}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      }
    >
      {roomCount > 0 ? (
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{type.name}</span> still has {roomCount} room{roomCount === 1 ? "" : "s"}. Delete
          or reassign {roomCount === 1 ? "it" : "them all"} first.
        </p>
      ) : (
        <p className="text-sm text-muted">
          This removes <span className="font-medium text-ink">{type.name}</span> for good. This can't be undone.
        </p>
      )}
    </Modal>
  );
}

function ConfirmDeleteRoomModal({ number, onClose, onConfirm }: { number: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title={`Delete Room ${number}?`}
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
      <p className="text-sm text-muted">This can't be undone.</p>
    </Modal>
  );
}

// ---------- Room type section (accordion) ----------

function RoomTypeSection({
  type,
  rooms,
  defaultOpen,
  onSelectRoom,
  onEdit,
  onDelete,
}: {
  type: RoomTypeConfig;
  rooms: RoomView[];
  defaultOpen: boolean;
  onSelectRoom: (room: RoomView) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const vacant = rooms.filter((r) => r.status === "vacant").length;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-paper">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3.5">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-3 text-left">
          <span className="font-display text-sm font-semibold text-ink">{type.name}</span>
          <span className="text-xs text-muted">{rooms.length} rooms</span>
        </button>
        <div className="flex items-center gap-1">
          <span className="hidden text-xs text-muted sm:inline">
            {occupied} occupied · {vacant} vacant
          </span>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${type.name}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <PencilSimple size={13} weight="duotone" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${type.name}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash size={13} weight="duotone" />
          </button>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Expand"} className="shrink-0 p-1">
            <ChevronDownIcon className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-2 border-t border-line px-4 py-4 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
              {rooms.map((room) => (
                <RoomCard key={room.number} room={room} onSelect={() => onSelectRoom(room)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Page ----------

export default function Rooms() {
  const navigate = useNavigate();
  const { markReady, markNotReady, deleteRoom, roomTypeConfigs, addRoomType, updateRoomType, deleteRoomType, isReady } = useRooms();
  const { logPayment, updateTenant } = useTenants();
  const rooms = useRoomsView();

  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [assigningRoom, setAssigningRoom] = useState<VacantRoom | null>(null);
  const [reassignCandidate, setReassignCandidate] = useState<Tenant | null>(null);
  const [payingTenant, setPayingTenant] = useState<Tenant | null>(null);
  const [addingType, setAddingType] = useState(false);
  const [editingType, setEditingType] = useState<RoomTypeConfig | null>(null);
  const [deletingType, setDeletingType] = useState<RoomTypeConfig | null>(null);
  const [deletingRoomNumber, setDeletingRoomNumber] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
  };

  const selected = rooms.find((r) => r.number === selectedNumber) ?? null;

  const stats = useMemo(() => {
    const byStatus = (status: RoomView["status"]) => rooms.filter((r) => r.status === status);
    const bedsIn = (rs: RoomView[]) => rs.reduce((sum, r) => sum + r.beds.length, 0);
    const occupiedBedsIn = (rs: RoomView[]) => rs.reduce((sum, r) => sum + r.beds.filter((b) => b !== null).length, 0);

    const occupiedRooms = byStatus("occupied");
    const vacantRooms = byStatus("vacant");
    const notReadyRooms = byStatus("not-ready");

    return [
      { label: "Total beds", rooms: rooms.length, beds: bedsIn(rooms), Icon: BedIcon, tint: "bg-slate-100 text-slate-600" },
      { label: "Occupied", rooms: occupiedRooms.length, beds: occupiedBedsIn(occupiedRooms), Icon: UsersIcon, tint: "bg-teal-100 text-teal-700" },
      { label: "Vacant", rooms: vacantRooms.length, beds: bedsIn(vacantRooms), Icon: DoorIcon, tint: "bg-sky-100 text-sky-700" },
      { label: "Not ready", rooms: notReadyRooms.length, beds: bedsIn(notReadyRooms), Icon: WrenchIcon, tint: "bg-amber-100 text-amber-700" },
    ];
  }, [rooms]);

  return (
    <>
      <PageHeader title="Rooms" />

      <div className="space-y-6 px-4 sm:px-8 pb-10">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setAddingType(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
          >
            + Add room type
          </button>
        </div>

        {/* Stat cards — beds are the headline number, rooms shown as a small secondary count */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-line bg-paper p-5">
              <p className="text-xs text-muted">{s.label}</p>
              {isReady ? (
                <>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="font-display text-2xl font-semibold tracking-tight text-ink">{s.beds}</p>
                    <span className="text-xs text-muted">beds</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{s.rooms} rooms</p>
                </>
              ) : (
                <>
                  <Skeleton className="mt-2 h-7 w-14" />
                  <Skeleton className="mt-1.5 h-3 w-16" />
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4 rounded-lg py-3">
          {[
            { label: "Occupied", swatch: "bg-teal-600" },
            { label: "Vacant", swatch: "bg-paper border border-line" },
            { label: "Reserved", swatch: "bg-sky-100" },
            { label: "Not ready", swatch: "bg-slate-200" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-2">
              <span className={`h-3.5 w-3.5 rounded ${l.swatch}`} />
              <span className="text-xs text-muted">{l.label}</span>
            </div>
          ))}
        </div>

        {/* Room type accordions */}
        {!isReady ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-line bg-paper">
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-line px-4 py-4 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Skeleton key={j} className="aspect-square rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : roomTypeConfigs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-paper py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
              <DoorIcon />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">No room types yet</p>
              <p className="mt-0.5 text-xs text-muted">Add a room type to set up rent and deposit terms, then start adding rooms.</p>
            </div>
            <button
              type="button"
              onClick={() => setAddingType(true)}
              className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
            >
              + Add room type
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {roomTypeConfigs.map((type, i) => (
              <RoomTypeSection
                key={type.id}
                type={type}
                rooms={rooms.filter((r) => r.typeId === type.id)}
                defaultOpen={i === 0}
                onSelectRoom={(r) => setSelectedNumber(r.number)}
                onEdit={() => setEditingType(type)}
                onDelete={() => setDeletingType(type)}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <RoomDetailDrawer
            room={selected}
            onClose={() => setSelectedNumber(null)}
            onViewRecord={(tenant) => {
              setSelectedNumber(null);
              navigate("/tenants", { state: { openTenantId: tenant.id } });
            }}
            onLogPayment={(tenant) => {
              setPayingTenant(tenant);
            }}
            onAssignTenant={() => {
              setAssigningRoom(vacantRoomFor(selected));
              setSelectedNumber(null);
            }}
            onMarkReady={() => {
              markReady(selected.number);
              setSelectedNumber(null);
            }}
            onMarkNotReady={() => {
              markNotReady(selected.number);
              setSelectedNumber(null);
            }}
            onDeleteRoom={() => setDeletingRoomNumber(selected.number)}
          />
        )}
        {editingType && (
          <EditRoomTypeModal
            type={editingType}
            onClose={() => setEditingType(null)}
            onSave={(patch) => {
              updateRoomType(editingType.id, patch);
              setEditingType(null);
            }}
          />
        )}
        {deletingType && (
          <ConfirmDeleteRoomTypeModal
            type={deletingType}
            roomCount={rooms.filter((r) => r.typeId === deletingType.id).length}
            onClose={() => setDeletingType(null)}
            onConfirm={async () => {
              try {
                await deleteRoomType(deletingType.id);
                setDeletingType(null);
              } catch (e) {
                console.error("Failed to delete room type", e);
                showToast("Couldn't delete — remove its rooms first.");
              }
            }}
          />
        )}
        {deletingRoomNumber && (
          <ConfirmDeleteRoomModal
            number={deletingRoomNumber}
            onClose={() => setDeletingRoomNumber(null)}
            onConfirm={() => {
              deleteRoom(deletingRoomNumber);
              setDeletingRoomNumber(null);
              setSelectedNumber(null);
            }}
          />
        )}
        {assigningRoom && !reassignCandidate && (
          <TenantSearchDrawer
            title={`Assign to ${assigningRoom.room}`}
            description="Pick a tenant to move into this room."
            onClose={() => setAssigningRoom(null)}
            onPick={(tenant) => setReassignCandidate(tenant)}
          />
        )}
        {assigningRoom && reassignCandidate && (
          <ReassignConfirmModal
            tenant={reassignCandidate}
            targetRoom={assigningRoom}
            onClose={() => setReassignCandidate(null)}
            onConfirm={() => {
              updateTenant(reassignCandidate.id, {
                room: assigningRoom.room,
                roomType: assigningRoom.roomType,
                rentAmount: assigningRoom.rent,
              });
              setReassignCandidate(null);
              setAssigningRoom(null);
            }}
          />
        )}
        {payingTenant && (
          <LogPaymentModal
            tenantName={payingTenant.name}
            room={payingTenant.room}
            outstanding={payingTenant.owedAmount || payingTenant.rentAmount}
            onClose={() => setPayingTenant(null)}
            onConfirm={() => {
              logPayment(payingTenant.id, payingTenant.owedAmount || payingTenant.rentAmount);
              setPayingTenant(null);
              setSelectedNumber(null);
            }}
          />
        )}
        {addingType && (
          <AddRoomTypeDrawer
            onClose={() => setAddingType(false)}
            onSave={(config, roomCount) => {
              addRoomType(config, roomCount);
              setAddingType(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper shadow-card"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
