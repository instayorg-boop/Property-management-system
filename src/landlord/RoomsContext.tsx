import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTenants, type RoomType, type DepositRefundability, type Tenant } from "./TenantsContext";
import { useSettings } from "./SettingsContext";
import {
  listRoomTypeConfigs,
  listRooms,
  markRoomReady,
  markRoomNotReady,
  deleteRoomRow,
  updateRoomTypeRow,
  deleteRoomTypeRow,
  addRoomTypeWithRooms,
  type RoomTypeConfig,
  type RoomRecord,
} from "../lib/rooms";

// --- Types -------------------------------------------------------------------

export type RoomStatus = "vacant" | "occupied" | "reserved" | "not-ready";

export type { RoomTypeConfig, RoomRecord };

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

// --- Context -------------------------------------------------------------------

type RoomsContextValue = {
  rooms: RoomRecord[];
  roomTypeConfigs: RoomTypeConfig[];
  /** False until the initial Supabase fetch resolves. */
  isReady: boolean;
  markReady: (number: string) => void;
  /** Takes a vacant room out of service (cleaning/repairs) — the reverse of markReady. */
  markNotReady: (number: string) => void;
  /** Removes a room from the inventory. Caller is responsible for only offering this on a vacant room. */
  deleteRoom: (number: string) => void;
  /** Adds a new room type and appends `roomCount` new rooms of it to the inventory. */
  addRoomType: (config: Omit<RoomTypeConfig, "id">, roomCount: number) => void;
  /** Edits an existing room type's name/rent/deposit terms — not its capacity or bed count. */
  updateRoomType: (id: string, patch: Partial<Pick<RoomTypeConfig, "name" | "rent" | "depositAmount" | "depositRefundability">>) => void;
  /** Deletes a room type. Only succeeds when no rooms reference it (Postgres FK rejects it
   * otherwise) — callers should remove or reassign its rooms first and check `rooms` themselves. */
  deleteRoomType: (id: string) => Promise<void>;
};

const RoomsContext = createContext<RoomsContextValue | null>(null);

export function RoomsProvider({ children }: { children: ReactNode }) {
  const { propertyId } = useSettings();
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [roomTypeConfigs, setRoomTypeConfigs] = useState<RoomTypeConfig[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      const [types, roomRows] = await Promise.all([listRoomTypeConfigs(propertyId), listRooms(propertyId)]);
      if (cancelled) return;
      setRoomTypeConfigs(types);
      setRooms(roomRows);
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const markReady = (number: string) => {
    setRooms((prev) => prev.map((r) => (r.number === number ? { ...r, override: undefined } : r)));
    if (propertyId) void markRoomReady(propertyId, number);
  };

  const markNotReady = (number: string) => {
    setRooms((prev) => prev.map((r) => (r.number === number ? { ...r, override: "not-ready" } : r)));
    if (propertyId) void markRoomNotReady(propertyId, number);
  };

  const deleteRoom = (number: string) => {
    setRooms((prev) => prev.filter((r) => r.number !== number));
    if (propertyId) void deleteRoomRow(propertyId, number).catch((e) => console.error("Failed to delete room", e));
  };

  const addRoomType = async (config: Omit<RoomTypeConfig, "id">, roomCount: number) => {
    if (!propertyId) return;
    const startingRoomNumber = rooms.length + 1;
    const { roomType, rooms: newRooms } = await addRoomTypeWithRooms(propertyId, config, roomCount, startingRoomNumber);
    setRoomTypeConfigs((prev) => [...prev, roomType]);
    setRooms((prev) => [...prev, ...newRooms]);
  };

  const updateRoomType = (
    id: string,
    patch: Partial<Pick<RoomTypeConfig, "name" | "rent" | "depositAmount" | "depositRefundability">>
  ) => {
    setRoomTypeConfigs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    void updateRoomTypeRow(id, patch).catch((e) => console.error("Failed to update room type", e));
  };

  // Not optimistic like the other mutators here — a delete that fails (e.g. rooms still reference
  // this type) needs to be reported to the caller, not silently reverted after the UI already
  // dropped it from the list.
  const deleteRoomType = async (id: string) => {
    await deleteRoomTypeRow(id);
    setRoomTypeConfigs((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <RoomsContext.Provider
      value={{ rooms, roomTypeConfigs, isReady, markReady, markNotReady, deleteRoom, addRoomType, updateRoomType, deleteRoomType }}
    >
      {children}
    </RoomsContext.Provider>
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

export type VacantRoom = {
  room: string;
  roomType: RoomType;
  rent: number;
  depositAmount: number;
  depositRefundability: DepositRefundability;
  /** Free beds in this room right now — 1 for a private room, up to `capacity` for a shared one.
   * Lets the picker distinguish "brand new, nobody's moved in" from "shared room, some beds still open". */
  openBeds: number;
};

/** Rooms available to assign a new tenant to — always in sync since it's filtered from the live
 * merged view. Includes both fully empty rooms AND shared rooms (e.g. 4-sharing) that still have
 * open beds — a room with 1 of 4 beds filled is `status === "occupied"` (see useRoomsView above)
 * but still has 3 spare beds, and previously was completely invisible here despite the Rooms page
 * showing that same open capacity via its bed meters. `reserved`/`not-ready` rooms are still
 * excluded — those are deliberately held back, not just partially filled. */
export function useVacantRoomsForAssignment(): VacantRoom[] {
  const view = useRoomsView();
  return useMemo(
    () =>
      view
        .filter((r) => r.status === "vacant" || (r.status === "occupied" && r.beds.some((b) => !b)))
        .map((r) => ({
          room: roomLabel(r.number),
          roomType: r.typeConfig.name,
          rent: r.typeConfig.rent,
          depositAmount: r.typeConfig.depositAmount,
          depositRefundability: r.typeConfig.depositRefundability,
          openBeds: r.beds.filter((b) => !b).length,
        })),
    [view]
  );
}
