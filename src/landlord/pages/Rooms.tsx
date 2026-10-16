import { useEffect, useMemo, useRef, useState } from "react";
import { hasMovedIn } from "../../lib/tenants";
import SearchInput from "../components/SearchInput";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CaretDown,
  Wrench,
  Bed,
  UsersThree,
  DoorOpen,
  PencilSimple,
  Trash,
  CalendarCheck,
  MagnifyingGlass,
  SquaresFour,
  Rows,
  FunnelSimple,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantSearchDrawer from "../components/TenantSearchDrawer";
import AddRoomTypeDrawer from "../components/AddRoomTypeDrawer";
import MetricCard from "../components/MetricCard";
import SectionLabel from "../components/SectionLabel";
import {
  useTenants,
  formatCurrency,
  type Tenant,
} from "../TenantsContext";
import {
  useRooms,
  useRoomsView,
  roomLabel,
  type RoomStatus,
  type RoomTypeConfig,
  type RoomView,
  type VacantRoom,
} from "../RoomsContext";
import { Skeleton } from "../components/Skeleton";
import Button from "../components/Button";
import FieldLabel, { FieldError } from "../components/FieldLabel";
import { calcTotalOwed } from "../invoiceUtils";
import { TableCard, DataTable, DataTableHead, Th, DataTableBody, Td, StatusPill as StatusBadge } from "../components/DataTable";
import { dicebearAvatarUrl } from "../avatar";

// ---------- Status vocabulary ----------
// Every status is expressed three ways — color, a written label, and an icon — so the board is
// readable without relying on color alone (WCAG 1.4.1). The filter chips reuse the same swatches,
// which is what lets the board drop a separate legend entirely.

const statusMeta: Record<
  RoomStatus,
  {
    label: string;
    chip: string;
    chipBorder: string;
    swatch: string;
    card: string;
    /** Tinted background for the detail modal's status/terms banner — same hue family as `chip`,
     * just low-saturation enough to sit behind text instead of as a small pill. */
    panel: string;
    Icon: typeof UsersThree;
  }
> = {
  occupied: {
    label: "Occupied",
    chip: "bg-teal-50 text-teal-700",
    chipBorder: "border-gray-400",
    swatch: "bg-teal-600",
    card: "border-line bg-paper hover:border-teal-300",
    panel: "border-gray-400 bg-gray-50",
    Icon: UsersThree,
  },
  vacant: {
    label: "Vacant",
    chip: "bg-slate-100 text-slate-600",
    chipBorder: "border-line",
    swatch: "border border-line bg-paper",
    card: "border-dashed border-line bg-mist/50 hover:border-brand hover:bg-brand-soft/30",
    panel: "border-line bg-mist/60",
    Icon: DoorOpen,
  },
  reserved: {
    label: "Reserved",
    chip: "bg-sky-50 text-sky-700",
    chipBorder: "border-sky-200",
    swatch: "bg-sky-500",
    card: "border-sky-200 bg-sky-50/40 hover:border-sky-300",
    panel: "border-sky-200 bg-sky-50",
    Icon: CalendarCheck,
  },
  "not-ready": {
    label: "Not ready",
    chip: "bg-amber-50 text-amber-700",
    chipBorder: "border-amber-200",
    swatch: "bg-amber-500",
    card: "border-amber-200 bg-amber-50/40 hover:border-amber-300",
    panel: "border-amber-200 bg-amber-50",
    Icon: Wrench,
  },
};

/** Rent trouble in any bed — surfaced on the room itself so the board doubles as an arrears map. */
function rentAlert(room: RoomView): Tenant | null {
  return (
    room.beds.find(
      (b) => b && hasMovedIn(b) && (b.status === "overdue" || b.status === "unpaid"),
    ) ?? null
  );
}

function vacantRoomFor(room: RoomView): VacantRoom {
  return {
    room: roomLabel(room.number),
    roomType: room.typeConfig.name,
    rent: room.typeConfig.rent,
    depositAmount: room.typeConfig.depositAmount,
    depositRefundability: room.typeConfig.depositRefundability,
    openBeds: room.beds.filter((b) => !b).length,
  };
}

// ---------- Shared bits ----------

function StatusPill({ status }: { status: RoomStatus }) {
  const meta = statusMeta[status];
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.chip} ${meta.chipBorder}`}
    >
      <meta.Icon size={11} weight="duotone" />
      {meta.label}
    </span>
  );
}

/** Filled/empty bed segments — an at-a-glance capacity read that stays legible at any card size. */
function BedMeter({ room }: { room: RoomView }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {room.beds.map((bed, i) => (
          <span
            key={i}
            className={`h-1.5 w-4 rounded-full ${bed ? "bg-teal-600" : "bg-line"}`}
          />
        ))}
      </div>
      <span className="text-[11px] text-muted">
        {room.beds.filter(Boolean).length}/{room.beds.length}
      </span>
    </div>
  );
}

// ---------- Grid card ----------
// Just the essentials — room number, status, who's in it (if anyone) — no rent, no bed-meter bars,
// no alert badges. Everything else about a room is one click away in the detail modal, so the
// grid's only job is letting you scan a lot of rooms at once and recognize what you're looking at.

function RoomCard({
  room,
  onSelect,
}: {
  room: RoomView;
  onSelect: () => void;
}) {
  const occupants = room.beds.filter(Boolean) as Tenant[];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-24 flex-col rounded-lg border p-3 text-left transition-all duration-150 active:scale-[0.97] ${statusMeta[room.status].card}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div>
          <p className="text-[9px] font-medium tracking-wide text-muted uppercase">
            Room
          </p>
          <span className="font-display text-sm font-bold tracking-tight text-ink">
            {room.number}
          </span>
        </div>
        <StatusPill status={room.status} />
      </div>

      <div className="mt-auto pt-2">
        {room.beds.length > 1 ? (
          // A shared room — the thing worth knowing at a glance isn't who's in it, it's whether
          // there's still a bed open. Both filled solid icons, just a different color, so an open
          // bed reads clearly instead of disappearing as a faint outline.
          <div className="flex items-center gap-1">
            {room.beds.map((bed, i) => (
              <Bed
                key={i}
                size={15}
                weight="duotone"
                className={bed ? "text-teal-600" : "text-slate-300"}
              />
            ))}
          </div>
        ) : occupants.length > 0 ? (
          <p className="truncate text-xs font-medium text-ink">
            {occupants[0]!.name.split(" ")[0]}
          </p>
        ) : (
          <p className="text-xs text-muted">Empty</p>
        )}
      </div>
    </button>
  );
}

// ---------- List row ----------

function RoomRow({
  room,
  onSelect,
  showType = false,
}: {
  room: RoomView;
  onSelect: () => void;
  /** The flat (ungrouped) list view has no group header to carry the room type, so it needs its
   * own column instead — the per-group table already shows it via the group header above. */
  showType?: boolean;
}) {
  const alert = rentAlert(room);

  return (
    <tr
      onClick={onSelect}
      className="group cursor-pointer transition-colors hover:bg-mist"
    >
      <Td>
        <p className="font-medium text-ink">{roomLabel(room.number)}</p>
        {!showType && <p className="text-xs text-muted">{room.typeConfig.name}</p>}
      </Td>
      {showType && (
        <Td className="text-sm text-muted">{room.typeConfig.name}</Td>
      )}
      <Td>
        <BedMeter room={room} />
      </Td>
      <Td className="text-sm text-muted">
        {formatCurrency(room.typeConfig.rent)}/mo
      </Td>
      <Td>
        <div className="flex items-center gap-1.5">
          <StatusPill status={room.status} />
          {alert && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
              Owing
            </span>
          )}
        </div>
      </Td>
      <Td>
        <span className="font-medium text-ink underline-offset-2 group-hover:underline">
          {room.status === "vacant" ? "Assign" : "Details"}
        </span>
      </Td>
    </tr>
  );
}

// ---------- Grouped section ----------

function RoomGroup({
  type,
  rooms,
  open,
  onToggle,
  onSelectRoom,
  onEdit,
  onDelete,
}: {
  type: RoomTypeConfig;
  rooms: RoomView[];
  open: boolean;
  onToggle: () => void;
  onSelectRoom: (room: RoomView) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const occupied = rooms.filter((r) => r.status === "occupied").length;

  return (
    <div>
      <div
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 transition-colors sm:px-6 ${open ? "bg-mist/50" : ""}`}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2.5 text-left"
        >
          <Bed size={15} weight="duotone" className="shrink-0 text-muted" />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">
              {type.name}
            </span>
            <span className="text-xs text-muted">
              {rooms.length} room{rooms.length === 1 ? "" : "s"} ·{" "}
              {formatCurrency(type.rent)}/mo
            </span>
          </div>
        </button>
        <span className="shrink-0 rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] font-medium text-muted">
          {occupied}/{rooms.length} filled
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${type.name}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <PencilSimple size={15} weight="duotone" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${type.name}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash size={15} weight="duotone" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label={open ? "Collapse" : "Expand"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <CaretDown
              size={15}
              weight="duotone"
              className={`transition-transform ${open ? "" : "-rotate-90"}`}
            />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2.5 border-t border-line px-6 py-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {rooms.map((room) => (
                <RoomCard
                  key={room.number}
                  room={room}
                  onSelect={() => onSelectRoom(room)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Room detail drawer ----------

function OccupantBlock({
  occupant,
  onViewRecord,
  onLogPayment,
}: {
  occupant: Tenant;
  onViewRecord: () => void;
  onLogPayment: () => void;
}) {
  const owing = hasMovedIn(occupant) && (occupant.status === "overdue" || occupant.status === "unpaid");
  const statusTone = owing ? "danger" : occupant.status === "partial" ? "warning" : "success";
  const statusLabel = owing
    ? `${formatCurrency(calcTotalOwed(occupant))} owed`
    : occupant.status === "partial"
      ? "Partly paid"
      : "Paid up";

  return (
    <div className="flex gap-3">
      <img
        src={occupant.photoUrl || dicebearAvatarUrl(occupant.id || occupant.name)}
        alt=""
        className="h-12 w-12 shrink-0 rounded-md bg-mist object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onViewRecord}
              className="truncate text-sm font-semibold text-ink hover:underline"
            >
              {occupant.name}
            </button>
            <p className="text-xs text-muted">{occupant.phones[0] ?? "—"}</p>
          </div>
          <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
        </div>
        <p className="mt-1 text-xs text-muted">Moved in {occupant.moveInDate}</p>
        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onViewRecord}
            className="flex-1"
          >
            View full record
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onLogPayment}
            className="flex-1 hover:scale-[1.01]"
          >
            Log payment
          </Button>
        </div>
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
  const emptyBeds = room.beds.filter((b) => !b).length;

  return (
    <Modal
      onClose={onClose}
      title={roomLabel(room.number)}
      description={`${room.typeConfig.name} · ${room.beds.length} bed${room.beds.length === 1 ? "" : "s"}`}
      footer={
        room.status === "not-ready" ? (
          <Button
            variant="primary"
            onClick={onMarkReady}
            className="w-full py-3 hover:scale-[1.01]"
          >
            Mark as ready
          </Button>
        ) : room.status === "vacant" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                variant="secondary"
                onClick={onMarkNotReady}
                className="py-3"
              >
                Take out of service
              </Button>
              <Button
                variant="primary"
                onClick={onAssignTenant}
                className="py-3 hover:scale-[1.01]"
              >
                Assign tenant
              </Button>
            </div>
            <button
              type="button"
              onClick={onDeleteRoom}
              className="flex w-full items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-red-600 hover:underline"
            >
              <Trash size={12} weight="duotone" />
              Delete this room
            </button>
          </div>
        ) : emptyBeds > 0 ? (
          <Button
            variant="primary"
            onClick={onAssignTenant}
            className="w-full py-3 hover:scale-[1.01]"
          >
            Fill empty bed
          </Button>
        ) : undefined
      }
    >
      {/* Status first — the one thing you opened this room to check — tinted to match the room's
          status so it reads as a banner, not just another row of text. */}
      <div className={`rounded-lg border p-4 ${statusMeta[room.status].panel}`}>
        <div className="flex items-center justify-between gap-3">
          <StatusPill status={room.status} />
          {room.beds.length > 1 && <BedMeter room={room} />}
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Rent</span>
            <span className="font-medium text-ink">
              {formatCurrency(room.typeConfig.rent)}/mo
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Deposit</span>
            <span className="font-medium text-ink">
              {formatCurrency(room.typeConfig.depositAmount)}
            </span>
          </div>
        </div>
      </div>

      {room.status === "reserved" && (
        <p className="mt-5 text-sm text-muted">
          {room.reservedFor
            ? `Held for ${room.reservedFor.name} — it won't show as available to assign until released.`
            : "Held for an upcoming booking — it won't show as available to assign until released."}
        </p>
      )}

      {room.status === "not-ready" && (
        <p className="mt-5 text-sm text-muted">
          Out of service for cleaning or repairs. Mark it ready once it's turned
          around.
        </p>
      )}

      {room.status === "occupied" && (
        <div className="mt-6">
          <SectionLabel>
            {room.beds.length > 1 ? "Occupants" : "Occupant"}
          </SectionLabel>
          <div className="mt-2 divide-y divide-line">
            {room.beds.map((bed, i) => (
              <div key={i} className={`py-4 ${i === 0 ? "pt-0" : ""}`}>
                {room.beds.length > 1 && (
                  <p className="mb-2 text-[11px] font-medium text-muted">
                    Bed {i + 1}
                  </p>
                )}
                {bed ? (
                  <OccupantBlock
                    occupant={bed}
                    onViewRecord={() => onViewRecord(bed)}
                    onLogPayment={() => onLogPayment(bed)}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted">Empty</span>
                    <button
                      type="button"
                      onClick={onAssignTenant}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      Assign tenant
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Move tenant
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        Move <span className="font-medium text-ink">{tenant.name}</span> from{" "}
        <span className="font-medium text-ink">{tenant.room}</span> to{" "}
        <span className="font-medium text-ink">{targetRoom.room}</span>? Their
        rent will update to {formatCurrency(targetRoom.rent)}/month to match the
        new room.
      </p>
    </Modal>
  );
}

// ---------- Room type edit / delete ----------

const refundabilityOptions: RoomTypeConfig["depositRefundability"][] = [
  "Refundable",
  "Partially refundable",
  "Non-refundable",
];

function EditRoomTypeModal({
  type,
  onClose,
  onSave,
}: {
  type: RoomTypeConfig;
  onClose: () => void;
  onSave: (
    patch: Pick<
      RoomTypeConfig,
      "name" | "rent" | "depositAmount" | "depositRefundability"
    >,
  ) => void;
}) {
  const [name, setName] = useState(type.name);
  const [rent, setRent] = useState(type.rent);
  const [depositAmount, setDepositAmount] = useState(type.depositAmount);
  const [depositRefundability, setDepositRefundability] = useState(
    type.depositRefundability,
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const canSave = name.trim().length > 0 && rent > 0;

  const trySave = () => {
    if (!canSave) {
      setSubmitAttempted(true);
      return;
    }
    onSave({ name: name.trim(), rent, depositAmount, depositRefundability });
  };

  return (
    <Modal
      onClose={onClose}
      title="Edit room type"
      description="Beds per room can't be changed here — that would affect rooms already assigned to tenants."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={trySave}>
            Save changes
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {submitAttempted && !canSave && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 sm:col-span-2">
            A few required fields still need attention — they're marked below.
          </div>
        )}

        <div className="sm:col-span-2">
          <FieldLabel required>Name</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full rounded-lg border bg-mist px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/30 ${
              submitAttempted && !name.trim() ? "border-red-400" : "border-transparent"
            }`}
          />
          {submitAttempted && !name.trim() && (
            <FieldError>Name is required.</FieldError>
          )}
        </div>
        <div>
          <FieldLabel required>Rent (K/month)</FieldLabel>
          <input
            type="number"
            min={0}
            value={rent}
            onChange={(e) => setRent(Number(e.target.value) || 0)}
            className={`w-full rounded-lg border bg-mist px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/30 ${
              submitAttempted && rent <= 0 ? "border-red-400" : "border-transparent"
            }`}
          />
          {submitAttempted && rent <= 0 && (
            <FieldError>Enter a rent amount greater than zero.</FieldError>
          )}
        </div>
        <div>
          <FieldLabel>Deposit (K)</FieldLabel>
          <input
            type="number"
            min={0}
            value={depositAmount}
            onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-transparent bg-mist px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Deposit terms</FieldLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {refundabilityOptions.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setDepositRefundability(o)}
                className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${
                  depositRefundability === o
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line text-muted hover:bg-mist"
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="dangerSolid"
            onClick={onConfirm}
            disabled={roomCount > 0}
          >
            Delete
          </Button>
        </div>
      }
    >
      {roomCount > 0 ? (
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{type.name}</span> still has{" "}
          {roomCount} room{roomCount === 1 ? "" : "s"}. Delete or reassign{" "}
          {roomCount === 1 ? "it" : "them all"} first.
        </p>
      ) : (
        <p className="text-sm text-muted">
          This removes <span className="font-medium text-ink">{type.name}</span>{" "}
          for good. This can't be undone.
        </p>
      )}
    </Modal>
  );
}

function ConfirmDeleteRoomModal({
  number,
  onClose,
  onConfirm,
}: {
  number: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title={`Delete Room ${number}?`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="dangerSolid" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">This can't be undone.</p>
    </Modal>
  );
}

// ---------- Page ----------

const statusFilters: ("all" | RoomStatus)[] = [
  "all",
  "occupied",
  "vacant",
  "not-ready",
  "reserved",
];

/** Single "Filter" button standing in for the row of status pills — opens the same options in a
 * dropdown, same pattern as Maintenance's FilterMenu. */
function RoomStatusFilterMenu({
  value,
  onChange,
  counts,
}: {
  value: "all" | RoomStatus;
  onChange: (v: "all" | RoomStatus) => void;
  counts: Record<"all" | RoomStatus, number>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const activeLabel = value === "all" ? "All" : statusMeta[value].label;

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
      >
        <FunnelSimple size={14} weight="bold" />
        Filter
        {value !== "all" && <span className="text-white/80">· {activeLabel}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
          >
            {statusFilters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  onChange(f);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-mist ${
                  value === f ? "text-brand" : "text-ink"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {f !== "all" && <span className={`h-2.5 w-2.5 rounded-sm ${statusMeta[f].swatch}`} />}
                  {f === "all" ? "All" : statusMeta[f].label}
                </span>
                <span className="text-muted">{counts[f]}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Rooms() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    markReady,
    markNotReady,
    deleteRoom,
    roomTypeConfigs,
    addRoomType,
    updateRoomType,
    deleteRoomType,
    isReady,
  } = useRooms();
  const { logPayments, updateTenant } = useTenants();
  const rooms = useRoomsView();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RoomStatus>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [assigningRoom, setAssigningRoom] = useState<VacantRoom | null>(null);
  const [reassignCandidate, setReassignCandidate] = useState<Tenant | null>(
    null,
  );
  const [payingTenant, setPayingTenant] = useState<Tenant | null>(null);
  const [addingType, setAddingType] = useState(false);

  // Picked up when the global Create launcher (Sidebar.tsx) navigates here with
  // ?action=add-room-type instead of clicking this page's own "+ Add room type" button — cleared
  // immediately after so a refresh or back/forward doesn't reopen the drawer.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("action") === "add-room-type") {
      setAddingType(true);
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  const [editingType, setEditingType] = useState<RoomTypeConfig | null>(null);
  const [deletingType, setDeletingType] = useState<RoomTypeConfig | null>(null);
  const [deletingRoomNumber, setDeletingRoomNumber] = useState<string | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
  };

  const selected = rooms.find((r) => r.number === selectedNumber) ?? null;

  // Bed-level maths: a half-full sharing room is half-empty too, so rooms alone can't answer
  // "how much am I leaving on the table" — beds can.
  const stats = useMemo(() => {
    const totalBeds = rooms.reduce((sum, r) => sum + r.beds.length, 0);
    const filledBeds = rooms.reduce(
      (sum, r) => sum + r.beds.filter(Boolean).length,
      0,
    );
    const openBeds = rooms
      .filter((r) => r.status === "vacant" || r.status === "occupied")
      .reduce((sum, r) => sum + r.beds.filter((b) => !b).length, 0);
    const idleRent = rooms.reduce(
      (sum, r) => sum + r.beds.filter((b) => !b).length * r.typeConfig.rent,
      0,
    );
    const notReady = rooms.filter((r) => r.status === "not-ready").length;
    return {
      totalBeds,
      filledBeds,
      openBeds,
      idleRent,
      notReady,
      occupancyPct: totalBeds ? Math.round((filledBeds / totalBeds) * 100) : 0,
    };
  }, [rooms]);

  const statusCounts = useMemo(() => {
    return {
      all: rooms.length,
      occupied: rooms.filter((r) => r.status === "occupied").length,
      vacant: rooms.filter((r) => r.status === "vacant").length,
      "not-ready": rooms.filter((r) => r.status === "not-ready").length,
      reserved: rooms.filter((r) => r.status === "reserved").length,
    } as Record<"all" | RoomStatus, number>;
  }, [rooms]);

  // Searching a room by its occupant's name is the request behind "which room is X in?" — the one
  // lookup this page couldn't answer before.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        roomLabel(r.number).toLowerCase().includes(q) ||
        r.typeConfig.name.toLowerCase().includes(q) ||
        r.beds.some((b) => b?.name.toLowerCase().includes(q))
      );
    });
  }, [rooms, statusFilter, query]);

  const isFiltering = query.trim().length > 0 || statusFilter !== "all";

  const groups = useMemo(
    () =>
      roomTypeConfigs
        .map((type) => ({
          type,
          rooms: filtered.filter((r) => r.typeId === type.id),
        }))
        .filter((g) => g.rooms.length > 0),
    [roomTypeConfigs, filtered],
  );

  // List view drops the room-type grouping in favor of one flat, sortable-by-eye table with its
  // own "Room type" column — sorted by type then room number so it still reads in grouped order.
  const flatRooms = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const typeCompare = a.typeConfig.name.localeCompare(b.typeConfig.name);
        return typeCompare !== 0 ? typeCompare : roomLabel(a.number).localeCompare(roomLabel(b.number));
      }),
    [filtered],
  );

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="Rooms"
        description="Track occupancy, assign tenants, and manage room types."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-line p-0.5">
              {[
                { id: "grid" as const, Icon: SquaresFour, label: "Grid view" },
                { id: "list" as const, Icon: Rows, label: "List view" },
              ].map(({ id, Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  aria-label={label}
                  aria-pressed={view === id}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    view === id ? "bg-ink text-paper" : "text-muted hover:bg-mist"
                  }`}
                >
                  <Icon size={16} weight="duotone" />
                </button>
              ))}
            </div>
            <Button
              variant="primary"
              onClick={() => setAddingType(true)}
              className="hover:scale-[1.02]"
            >
              + Add room type
            </Button>
          </div>
        }
      />

      <div className="space-y-5 px-4 sm:px-8 pb-10">
        {/* What the property is doing right now, in money and beds */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {!isReady ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-line bg-paper p-5"
              >
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-7 w-14" />
                <Skeleton className="mt-1.5 h-3 w-24" />
              </div>
            ))
          ) : (
            <>
              <MetricCard
                compact
                iconClassName="bg-teal-100 text-teal-700"
                label="Occupancy"
                value={`${stats.occupancyPct}%`}
                caption={`${stats.filledBeds} of ${stats.totalBeds} beds filled`}
              />
              <MetricCard
                compact
                iconClassName="bg-sky-100 text-sky-700"
                label="Open beds"
                value={stats.openBeds}
                caption={
                  stats.openBeds > 0 ? "Ready to fill now" : "Everything is let"
                }
              />
              <MetricCard
                compact
                iconClassName="bg-amber-100 text-amber-700"
                label="Idle rent"
                value={formatCurrency(stats.idleRent)}
                tone={stats.idleRent > 0 ? "warning" : "success"}
                caption="Per month, from empty beds"
              />
              <MetricCard
                compact
                iconClassName="bg-slate-100 text-slate-600"
                label="Not ready"
                value={stats.notReady}
                caption={
                  stats.notReady > 0
                    ? "Needs turnaround"
                    : "Nothing out of service"
                }
              />
            </>
          )}
        </div>

        {/* Search + filter row, same pill-search-plus-filter-button pattern as Maintenance. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search room, type or tenant" className="w-full sm:w-64" />

          <RoomStatusFilterMenu value={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
        </div>

        <TableCard>

          {/* Room type accordions */}
          {!isReady ? (
            <div className="divide-y divide-line">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-3 px-6 py-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 border-t border-line px-6 py-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <Skeleton key={j} className="h-24 rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : roomTypeConfigs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                <DoorOpen size={22} weight="duotone" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  No room types yet
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Add a room type to set up rent and deposit terms, then start
                  adding rooms.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() => setAddingType(true)}
                className="mt-2 hover:scale-[1.02]"
              >
                + Add room type
              </Button>
            </div>
          ) : flatRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                <MagnifyingGlass size={22} weight="duotone" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">No rooms match</p>
                <p className="mt-0.5 text-xs text-muted">
                  Try a different search or status filter.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                }}
                className="mt-2"
              >
                Clear filters
              </Button>
            </div>
          ) : view === "list" ? (
            // Flat, ungrouped table — a dedicated "Room type" column stands in for the grid
            // view's group headers instead of nesting a table per room type.
            <DataTable>
              <DataTableHead>
                <Th>Room</Th>
                <Th>Room type</Th>
                <Th>Beds</Th>
                <Th>Rent</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </DataTableHead>
              <DataTableBody>
                {flatRooms.map((room) => (
                  <RoomRow
                    key={room.number}
                    room={room}
                    showType
                    onSelect={() => setSelectedNumber(room.number)}
                  />
                ))}
              </DataTableBody>
            </DataTable>
          ) : (
            <div className="divide-y divide-line">
              {groups.map(({ type, rooms: groupRooms }) => (
                <RoomGroup
                  key={type.id}
                  type={type}
                  rooms={groupRooms}
                  // A filtered board never hides its results behind a collapsed header.
                  open={isFiltering || !collapsed.has(type.id)}
                  onToggle={() => toggleGroup(type.id)}
                  onSelectRoom={(r) => setSelectedNumber(r.number)}
                  onEdit={() => setEditingType(type)}
                  onDelete={() => setDeletingType(type)}
                />
              ))}
            </div>
          )}
        </TableCard>
      </div>

      <AnimatePresence>
        {selected && (
          <RoomDetailDrawer
            room={selected}
            onClose={() => setSelectedNumber(null)}
            onViewRecord={(tenant) => {
              setSelectedNumber(null);
              navigate(`/tenants/${tenant.portalToken}`);
            }}
            onLogPayment={(tenant) => setPayingTenant(tenant)}
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
            outstanding={calcTotalOwed(payingTenant) || payingTenant.rentAmount}
            rentAmount={payingTenant.rentAmount}
            ledger={payingTenant.ledger}
            moveInDate={payingTenant.moveInDate}
            onClose={() => setPayingTenant(null)}
            onConfirm={(payments) => {
              logPayments(
                payingTenant.id,
                payments.map((payment) => ({
                  amount: payment.amount,
                  label: payment.label,
                  method: payment.method === "mobile" ? "mobile-money" : "cash",
                  paidAt: payment.date,
                })),
              );
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
