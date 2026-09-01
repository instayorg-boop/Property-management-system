import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useTenants, type RoomType, type DepositRefundability, type Tenant } from "./TenantsContext";

// --- Types -------------------------------------------------------------------

export type RoomStatus = "vacant" | "occupied" | "reserved" | "not-ready";

export type RoomTypeConfig = {
  id: string;
  name: RoomType;
  capacity: number;
  /** Standard monthly rent for this room type, in Kwacha. */
  rent: number;
  depositAmount: number;
  depositRefundability: DepositRefundability;
};

/** The physical inventory — structural facts a landlord sets up once. Occupancy is derived from TenantsContext, not stored here. */
type RoomRecord = {
  number: string;
  typeId: string;
  /** Only for statuses that can't be derived from a tenant assignment. */
  override?: "reserved" | "not-ready";
};

/** A room merged with its live occupancy, computed from the tenants who currently have `room` set to it. */
export type RoomView = {
  number: string;
  typeId: string;
  typeConfig: RoomTypeConfig;
  status: RoomStatus;
  beds: (Tenant | null)[];
};

export function roomLabel(number: string) {
  return `Room ${number}`;
}

// --- Seed config & inventory ---------------------------------------------------

const initialRoomTypeConfigs: RoomTypeConfig[] = [
  { id: "single", name: "Single", capacity: 1, rent: 1200, depositAmount: 1200, depositRefundability: "Refundable" },
  { id: "two-sharing", name: "Two sharing", capacity: 2, rent: 900, depositAmount: 900, depositRefundability: "Partially refundable" },
  { id: "four-sharing", name: "Four sharing", capacity: 4, rent: 650, depositAmount: 400, depositRefundability: "Non-refundable" },
];

function typeIdFor(number: number): string {
  if (SINGLE_NUMBERS.has(number)) return "single";
  if (TWO_SHARING_NUMBERS.has(number)) return "two-sharing";
  return "four-sharing";
}

// Room numbers pinned to a type so they line up with the tenants already assigned to them in TenantsContext's mock data.
const SINGLE_NUMBERS = new Set([1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
const TWO_SHARING_NUMBERS = new Set([3, 5, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);

const overrides: Record<string, "reserved" | "not-ready"> = {
  "02": "reserved",
  "06": "not-ready",
  "26": "not-ready",
};

const initialRooms: RoomRecord[] = Array.from({ length: 38 }, (_, i) => {
  const n = i + 1;
  const number = String(n).padStart(2, "0");
  return { number, typeId: typeIdFor(n), override: overrides[number] };
});

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `type-${Date.now()}`;
}

// --- Context -------------------------------------------------------------------

type RoomsContextValue = {
  rooms: RoomRecord[];
  roomTypeConfigs: RoomTypeConfig[];
  markReady: (number: string) => void;
  /** Adds a new room type and appends `roomCount` new rooms of it to the inventory. */
  addRoomType: (config: Omit<RoomTypeConfig, "id">, roomCount: number) => void;
};

const RoomsContext = createContext<RoomsContextValue | null>(null);

// Temporary switch for previewing empty states across the app — flip back to `false`
// once the preview is done.
const DEMO_EMPTY_STATE = true;

export function RoomsProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<RoomRecord[]>(DEMO_EMPTY_STATE ? [] : initialRooms);
  const [roomTypeConfigs, setRoomTypeConfigs] = useState<RoomTypeConfig[]>(DEMO_EMPTY_STATE ? [] : initialRoomTypeConfigs);

  const markReady = (number: string) => {
    setRooms((prev) => prev.map((r) => (r.number === number ? { ...r, override: undefined } : r)));
  };

  const addRoomType = (config: Omit<RoomTypeConfig, "id">, roomCount: number) => {
    const id = slugify(config.name);
    setRoomTypeConfigs((prev) => [...prev, { ...config, id }]);
    setRooms((prev) => {
      const nextNumber = prev.length + 1;
      const added: RoomRecord[] = Array.from({ length: roomCount }, (_, i) => ({
        number: String(nextNumber + i).padStart(2, "0"),
        typeId: id,
      }));
      return [...prev, ...added];
    });
  };

  return (
    <RoomsContext.Provider value={{ rooms, roomTypeConfigs, markReady, addRoomType }}>{children}</RoomsContext.Provider>
  );
}

export function useRooms() {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error("useRooms must be used within RoomsProvider");
  return ctx;
}

/** Rent per room type, for callers that just need the number (e.g. the Rent page's rate-diff label). */
export function useRoomTypeRent(): Record<RoomType, number> {
  const { roomTypeConfigs } = useRooms();
  return useMemo(() => Object.fromEntries(roomTypeConfigs.map((c) => [c.name, c.rent])), [roomTypeConfigs]);
}

/**
 * The single merged view of the property: physical inventory (RoomsContext) crossed with who's
 * actually assigned to each room right now (TenantsContext). This is what makes rooms and tenants
 * one source of truth — a room's occupied/vacant status is never stored, only ever derived, so it
 * can't drift out of sync with the tenant list the way two independently-tracked copies could.
 */
export function useRoomsView(): RoomView[] {
  const { rooms, roomTypeConfigs } = useRooms();
  const { tenants } = useTenants();

  return useMemo(() => {
    return rooms.map((r) => {
      const typeConfig = roomTypeConfigs.find((t) => t.id === r.typeId)!;
      const label = roomLabel(r.number);
      const occupants = tenants.filter((t) => t.active && t.room === label);
      const beds: (Tenant | null)[] = Array.from({ length: typeConfig.capacity }, (_, i) => occupants[i] ?? null);
      const status: RoomStatus = occupants.length > 0 ? "occupied" : (r.override ?? "vacant");
      return { number: r.number, typeId: r.typeId, typeConfig, status, beds };
    });
  }, [rooms, roomTypeConfigs, tenants]);
}

export type VacantRoom = { room: string; roomType: RoomType; rent: number; depositAmount: number; depositRefundability: DepositRefundability };

/** Vacant rooms available to assign a new tenant to — always in sync since it's filtered from the live merged view. */
export function useVacantRoomsForAssignment(): VacantRoom[] {
  const view = useRoomsView();
  return useMemo(
    () =>
      view
        .filter((r) => r.status === "vacant")
        .map((r) => ({
          room: roomLabel(r.number),
          roomType: r.typeConfig.name,
          rent: r.typeConfig.rent,
          depositAmount: r.typeConfig.depositAmount,
          depositRefundability: r.typeConfig.depositRefundability,
        })),
    [view]
  );
}
