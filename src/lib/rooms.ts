import { supabase } from "./supabaseClient";
import type { Tables, TablesUpdate } from "./database.types";

export type RoomTypeConfig = {
  id: string;
  name: string;
  capacity: number;
  rent: number;
  depositAmount: number;
  depositRefundability: "Refundable" | "Non-refundable" | "Partially refundable";
};

export type RoomRecord = {
  number: string;
  typeId: string;
  override?: "reserved" | "not-ready";
};

type RoomTypeRow = Pick<Tables<"room_types">, "id" | "name" | "capacity" | "rent" | "deposit_amount" | "deposit_refundability">;
function toRoomTypeConfig(row: RoomTypeRow): RoomTypeConfig {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    rent: row.rent,
    depositAmount: row.deposit_amount,
    depositRefundability: row.deposit_refundability as RoomTypeConfig["depositRefundability"],
  };
}

type RoomRow = Pick<Tables<"rooms">, "number" | "room_type_id" | "override">;
function toRoomRecord(row: RoomRow): RoomRecord {
  return {
    number: row.number,
    typeId: row.room_type_id,
    override: (row.override as RoomRecord["override"]) ?? undefined,
  };
}

export async function listRoomTypeConfigs(propertyId: string): Promise<RoomTypeConfig[]> {
  const { data, error } = await supabase
    .from("room_types")
    .select("id, name, capacity, rent, deposit_amount, deposit_refundability")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(toRoomTypeConfig);
}

export async function listRooms(propertyId: string): Promise<RoomRecord[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select("number, room_type_id, override")
    .eq("property_id", propertyId)
    .order("number", { ascending: true });
  if (error) throw error;
  return data.map(toRoomRecord);
}

export async function markRoomReady(propertyId: string, number: string): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({ override: null })
    .eq("property_id", propertyId)
    .eq("number", number);
  if (error) throw error;
}

/** Takes a vacant room out of service (cleaning/repairs) — the reverse of markRoomReady. */
export async function markRoomNotReady(propertyId: string, number: string): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({ override: "not-ready" })
    .eq("property_id", propertyId)
    .eq("number", number);
  if (error) throw error;
}

/** Removes a room from the inventory. Caller must have already confirmed it's vacant — this
 * doesn't check occupancy itself, since that requires cross-referencing tenants (TenantsContext),
 * which this module intentionally doesn't depend on. */
export async function deleteRoomRow(propertyId: string, number: string): Promise<void> {
  const { error } = await supabase.from("rooms").delete().eq("property_id", propertyId).eq("number", number);
  if (error) throw error;
}

export async function updateRoomTypeRow(
  id: string,
  patch: Partial<Pick<RoomTypeConfig, "name" | "rent" | "depositAmount" | "depositRefundability">>
): Promise<void> {
  const row: TablesUpdate<"room_types"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.rent !== undefined) row.rent = patch.rent;
  if (patch.depositAmount !== undefined) row.deposit_amount = patch.depositAmount;
  if (patch.depositRefundability !== undefined) row.deposit_refundability = patch.depositRefundability;
  const { error } = await supabase.from("room_types").update(row).eq("id", id);
  if (error) throw error;
}

/** Deletes a room type. Caller must ensure no rooms reference it first (the `rooms.room_type_id`
 * foreign key would otherwise reject this) — surfaced in the UI as "remove its rooms first". */
export async function deleteRoomTypeRow(id: string): Promise<void> {
  const { error } = await supabase.from("room_types").delete().eq("id", id);
  if (error) throw error;
}

/** Creates a room type and appends `roomCount` new rooms of it, numbered after the current inventory. */
export async function addRoomTypeWithRooms(
  propertyId: string,
  config: Omit<RoomTypeConfig, "id">,
  roomCount: number,
  startingRoomNumber: number
): Promise<{ roomType: RoomTypeConfig; rooms: RoomRecord[] }> {
  const { data: typeRow, error: typeError } = await supabase
    .from("room_types")
    .insert({
      property_id: propertyId,
      name: config.name,
      capacity: config.capacity,
      rent: config.rent,
      deposit_amount: config.depositAmount,
      deposit_refundability: config.depositRefundability,
    })
    .select()
    .single();
  if (typeError) throw typeError;

  const newRooms = Array.from({ length: roomCount }, (_, i) => ({
    property_id: propertyId,
    room_type_id: typeRow.id,
    number: String(startingRoomNumber + i).padStart(2, "0"),
  }));
  const { data: roomRows, error: roomsError } = await supabase.from("rooms").insert(newRooms).select();
  if (roomsError) throw roomsError;

  return { roomType: toRoomTypeConfig(typeRow), rooms: roomRows.map(toRoomRecord) };
}

export async function findRoomIdByNumber(propertyId: string, number: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("property_id", propertyId)
    .eq("number", number)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function findRoomTypeIdByName(propertyId: string, name: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("room_types")
    .select("id")
    .eq("property_id", propertyId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
