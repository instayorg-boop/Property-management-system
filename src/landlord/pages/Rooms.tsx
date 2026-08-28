import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/PageHeader";

// ---------- Icons ----------

function ChevronDownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`fill-none stroke-current ${className}`} strokeWidth={2}>
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`fill-none stroke-current ${className}`} strokeWidth={1.75}>
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <path
        d="M11.5 2.5a3 3 0 0 0-3.9 3.9L2 12l2 2 5.6-5.6a3 3 0 0 0 3.9-3.9l-2.1 2.1-1.5-.5-.5-1.5 2.1-2.1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth={1.75}>
      <path d="M3.5 8h9M8.5 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75}>
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}

function BedIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.5}>
      <path d="M1.5 13V4.5M1.5 9h13V13M1.5 9V7a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 8.5 7v2M8.5 9V6a1 1 0 0 1 1-1h3.5A1.5 1.5 0 0 1 14.5 6.5V9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.5}>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M1.5 14v-.5A3.5 3.5 0 0 1 5 10h2a3.5 3.5 0 0 1 3.5 3.5v.5M10.5 4a2.25 2.25 0 0 1 0 4.5M14.5 14v-.5a3.5 3.5 0 0 0-2.5-3.36" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DoorIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.5}>
      <rect x="3.5" y="1.5" width="9" height="13" rx="1" />
      <circle cx="9.5" cy="8" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ---------- Mock data ----------

type PaymentStatus = "paid" | "overdue" | "partial";

type Occupant = {
  name: string;
  phone: string;
  moveInDate: string;
  status: PaymentStatus;
  daysOverdue?: number;
  owed?: string;
};

type RoomStatus = "vacant" | "occupied" | "reserved" | "not-ready";

type Room = {
  number: string;
  typeId: string;
  status: RoomStatus;
  rent: string;
  beds: (Occupant | null)[];
};

const roomTypes = [
  { id: "single", name: "Single", capacity: 1, count: 15, rent: "K1,200" },
  { id: "two-sharing", name: "Two sharing", capacity: 2, count: 15, rent: "K900" },
  { id: "four-sharing", name: "Four sharing", capacity: 4, count: 8, rent: "K650" },
];

const names = [
  "A. Mwansa", "B. Phiri", "C. Banda", "D. Zulu", "F. Chileshe", "G. Mwape",
  "H. Banda", "I. Tembo", "J. Kunda", "K. Mulenga", "L. Sakala", "M. Ngoma",
];

function occupantFor(seed: number): Occupant {
  const statuses: PaymentStatus[] = ["paid", "paid", "paid", "overdue", "partial"];
  const status = statuses[seed % statuses.length];
  return {
    name: names[seed % names.length],
    phone: "097" + (7000000 + seed * 137).toString().slice(0, 7),
    moveInDate: "12 Jan 2025",
    status,
    daysOverdue: status === "overdue" ? 3 + (seed % 10) : undefined,
    owed: status === "overdue" ? `K${(950 + seed * 13) % 400 + 950}` : undefined,
  };
}

function buildRoomsForType(typeId: string, count: number, capacity: number, rent: string, offset: number): Room[] {
  const rooms: Room[] = [];
  for (let i = 0; i < count; i++) {
    const n = offset + i + 1;
    const bucket = n % 9;
    let beds: (Occupant | null)[];
    let status: RoomStatus;

    if (bucket === 0) {
      beds = Array(capacity).fill(null);
      status = "vacant";
    } else if (capacity === 1 && bucket === 1) {
      beds = [null];
      status = "reserved";
    } else if (bucket === 2) {
      beds = Array(capacity).fill(null);
      status = "not-ready";
    } else {
      beds = Array.from({ length: capacity }, (_, bed) => ((n + bed) % 6 === 0 ? null : occupantFor(n + bed * 5)));
      status = beds.every((b) => b === null) ? "vacant" : "occupied";
    }

    rooms.push({ number: String(n).padStart(2, "0"), typeId, status, rent, beds });
  }
  return rooms;
}

const allRooms: Room[] = [
  ...buildRoomsForType("single", 15, 1, "K1,200", 0),
  ...buildRoomsForType("two-sharing", 15, 2, "K900", 15),
  ...buildRoomsForType("four-sharing", 8, 4, "K650", 30),
];

const upcomingVacancies = [
  { room: "12", type: "Single", tenant: "A. Mwansa", moveOut: "2 Sep 2026", daysLeft: 4 },
  { room: "27", type: "Two sharing", tenant: "F. Chileshe", moveOut: "9 Sep 2026", daysLeft: 11 },
  { room: "38", type: "Four sharing", tenant: "J. Kunda", moveOut: "16 Sep 2026", daysLeft: 18 },
  { room: "05", type: "Single", tenant: "D. Zulu", moveOut: "24 Sep 2026", daysLeft: 26 },
];

const dotColor: Record<PaymentStatus, string> = {
  paid: "bg-emerald-500",
  overdue: "bg-red-500",
  partial: "bg-amber-500",
};

// ---------- Room card ----------

function BedSlot({ bed }: { bed: Occupant | null }) {
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

function RoomCard({ room, onSelect }: { room: Room; onSelect: () => void }) {
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

// ---------- Centered modal ----------

function RoomModal({ room, onClose, onViewRecord }: { room: Room; onClose: () => void; onViewRecord: () => void }) {
  const capacity = room.beds.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-paper p-6 shadow-card"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <CloseIcon />
        </button>

        <p className="font-display text-xl font-semibold tracking-tight">Room {room.number}</p>
        <p className="mt-0.5 text-sm text-muted">
          {typeLabel(room.typeId)}
          {room.status === "reserved" && " · Reserved"}
          {room.status === "not-ready" && " · Not ready"}
        </p>

        {room.status === "vacant" && (
          <>
            <p className="mt-4 text-sm text-muted">Rent</p>
            <p className="font-display text-lg font-semibold">{room.rent} / month</p>
            <button
              type="button"
              className="mt-6 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
            >
              Assign tenant
            </button>
          </>
        )}

        {room.status === "reserved" && (
          <p className="mt-4 text-sm text-muted">
            This room is reserved for an upcoming booking and won't appear on the marketplace until it's released.
          </p>
        )}

        {room.status === "not-ready" && (
          <>
            <p className="mt-4 text-sm text-muted">Marked as under maintenance or cleaning. Mark ready once it's turned around.</p>
            <button
              type="button"
              className="mt-6 w-full rounded-lg border border-line py-3 text-sm font-medium text-ink transition-colors hover:bg-mist"
            >
              Mark as ready
            </button>
          </>
        )}

        {room.status === "occupied" &&
          (capacity === 1 ? (
            room.beds[0] && <OccupantLine occupant={room.beds[0]} onViewRecord={onViewRecord} />
          ) : (
            room.beds.map((bed, i) => (
              <div key={i}>
                <p className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">Bed {i + 1}</p>
                {bed ? (
                  <OccupantLine occupant={bed} onViewRecord={onViewRecord} />
                ) : (
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-line p-4">
                    <span className="text-sm text-muted">Empty bed</span>
                    <button type="button" className="rounded-lg bg-brand px-4 py-1.5 text-xs font-medium text-paper">
                      Assign tenant
                    </button>
                  </div>
                )}
              </div>
            ))
          ))}
      </motion.div>
    </div>
  );
}

function typeLabel(typeId: string) {
  return roomTypes.find((t) => t.id === typeId)?.name ?? "";
}

function OccupantLine({ occupant, onViewRecord }: { occupant: Occupant; onViewRecord: () => void }) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-mist p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold">{occupant.name}</p>
        <span className={`h-2.5 w-2.5 rounded-full ${dotColor[occupant.status]}`} />
      </div>
      <p className="mt-1 text-sm text-muted">{occupant.phone}</p>
      <p className="mt-1 text-xs text-muted">Moved in {occupant.moveInDate}</p>

      <div className="mt-3 border-t border-line pt-3 text-sm">
        {occupant.status === "overdue" ? (
          <p className="font-medium text-red-600">
            {occupant.daysOverdue} days overdue — {occupant.owed} owed
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
          className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          Log payment
        </button>
      </div>
    </div>
  );
}

// ---------- Room type section (accordion) ----------

function RoomTypeSection({
  type,
  rooms,
  defaultOpen,
  onSelectRoom,
}: {
  type: (typeof roomTypes)[number];
  rooms: Room[];
  defaultOpen: boolean;
  onSelectRoom: (room: Room) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const vacant = rooms.filter((r) => r.status === "vacant").length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-display text-sm font-semibold text-ink">{type.name}</span>
          <span className="text-xs text-muted">{rooms.length} rooms</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">
            {occupied} occupied · {vacant} vacant
          </span>
          <ChevronDownIcon className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-6 gap-2 border-t border-line px-4 py-4 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
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
  const [selected, setSelected] = useState<Room | null>(null);

  const stats = useMemo(() => {
    const byStatus = (status: RoomStatus) => allRooms.filter((r) => r.status === status);
    const bedsIn = (rooms: Room[]) => rooms.reduce((sum, r) => sum + r.beds.length, 0);
    const occupiedBedsIn = (rooms: Room[]) => rooms.reduce((sum, r) => sum + r.beds.filter((b) => b !== null).length, 0);

    const occupiedRooms = byStatus("occupied");
    const vacantRooms = byStatus("vacant");
    const notReadyRooms = byStatus("not-ready");

    return [
      { label: "Total beds", rooms: allRooms.length, beds: bedsIn(allRooms), Icon: BedIcon, tint: "bg-slate-100 text-slate-600" },
      { label: "Occupied", rooms: occupiedRooms.length, beds: occupiedBedsIn(occupiedRooms), Icon: UsersIcon, tint: "bg-teal-100 text-teal-700" },
      { label: "Vacant", rooms: vacantRooms.length, beds: bedsIn(vacantRooms), Icon: DoorIcon, tint: "bg-sky-100 text-sky-700" },
      { label: "Not ready", rooms: notReadyRooms.length, beds: bedsIn(notReadyRooms), Icon: WrenchIcon, tint: "bg-amber-100 text-amber-700" },
    ];
  }, []);

  return (
    <>
      <PageHeader title="Rooms" />

      <div className="space-y-6 px-8 pb-10">
        {/* Legend, up top */}
        

        {/* Stat cards — beds are the headline number, rooms shown as a small secondary count */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-paper p-5">
              <p className="text-xs text-muted">{s.label}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="font-display text-2xl font-semibold tracking-tight text-ink">{s.beds}</p>
                <span className="text-xs text-muted">beds</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">{s.rooms} rooms</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4 rounded-xl py-3">
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
        <div className="space-y-3">
          {roomTypes.map((type, i) => (
            <RoomTypeSection
              key={type.id}
              type={type}
              rooms={allRooms.filter((r) => r.typeId === type.id)}
              defaultOpen={i === 0}
              onSelectRoom={setSelected}
            />
          ))}
        </div>

        {/* Upcoming vacancies */}
        <div>
          <p className="mb-3 text-sm font-medium text-ink">Upcoming vacancies</p>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-mist text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Room</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Move-out date</th>
                  <th className="px-4 py-3 font-medium">Days left</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {upcomingVacancies.map((v) => (
                  <tr key={v.room} className="border-t border-line transition-colors hover:bg-mist">
                    <td className="px-4 py-3 font-medium text-ink">Room {v.room}</td>
                    <td className="px-4 py-3 text-muted">{v.type}</td>
                    <td className="px-4 py-3 text-ink">{v.tenant}</td>
                    <td className="px-4 py-3 text-muted">{v.moveOut}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                        {v.daysLeft} days
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className="text-muted transition-colors hover:text-ink">
                        <ArrowIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <RoomModal room={selected} onClose={() => setSelected(null)} onViewRecord={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
