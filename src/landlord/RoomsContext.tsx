import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTenants, type RoomType, type DepositRefundability, type Tenant } from "./TenantsContext";
import { useSettings } from "./SettingsContext";
import {
  listRoomTypeConfigs,
  listRooms,
  markRoomReady,
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
  markReady: (number: string) => void;
  /** Adds a new room type and appends `roomCount` new rooms of it to the inventory. */
  addRoomType: (config: Omit<RoomTypeConfig, "id">, roomCount: number) => void;
};

const RoomsContext = createContext<RoomsContextValue | null>(null);

export function RoomsProvider({ children }: { children: ReactNode }) {
  const { propertyId } = useSettings();
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [roomTypeConfigs, setRoomTypeConfigs] = useState<RoomTypeConfig[]>([]);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      const [types, roomRows] = await Promise.all([listRoomTypeConfigs(propertyId), listRooms(propertyId)]);
      if (cancelled) return;
      setRoomTypeConfigs(types);
      setRooms(roomRows);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const markReady = (number: string) => {
    setRooms((prev) => prev.map((r) => (r.number === number ? { ...r, override: undefined } : r)));
    if (propertyId) void markRoomReady(propertyId, number);
  };

  const addRoomType = async (config: Omit<RoomTypeConfig, "id">, roomCount: number) => {
    if (!propertyId) return;
    const startingRoomNumber = rooms.length + 1;
    const { roomType, rooms: newRooms } = await addRoomTypeWithRooms(propertyId, config, roomCount, startingRoomNumber);
    setRoomTypeConfigs((prev) => [...prev, roomType]);
    setRooms((prev) => [...prev, ...newRooms]);
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
