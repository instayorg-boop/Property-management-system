import { supabase } from "./supabaseClient";
import type { Tables } from "./database.types";

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
