import { supabase } from "./supabaseClient";
import type { Tables, TablesUpdate } from "./database.types";

export type Category = { id: string; name: string; active: boolean };

export type Expense = {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  amount: number;
  date: string;
  hasPhoto: boolean;
  photoUrl?: string;
  source: "manual" | "payroll";
};

const DEFAULT_CATEGORY_NAMES = ["Maintenance", "Staff wages", "Utilities", "Other"];

type CategoryRow = Pick<Tables<"expense_categories">, "id" | "name" | "active">;
function toCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, active: row.active };
}

type ExpenseRow = Pick<Tables<"expenses">, "id" | "name" | "description" | "category_id" | "amount" | "date" | "photo_url" | "source">;
function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    categoryId: row.category_id ?? "",
    amount: row.amount,
    date: row.date,
    hasPhoto: !!row.photo_url,
    photoUrl: row.photo_url ?? undefined,
    source: row.source as Expense["source"],
  };
}

export async function listCategories(propertyId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name, active")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (data.length > 0) return data.map(toCategory);

  const { data: created, error: insertError } = await supabase
    .from("expense_categories")
    .insert(DEFAULT_CATEGORY_NAMES.map((name) => ({ property_id: propertyId, name })))
    .select("id, name, active");
  if (insertError) throw insertError;
  return created.map(toCategory);
}

/** Most recent expenses only — see the matching note on `listInvoices`. */
const EXPENSE_LIST_LIMIT = 1000;

export async function listExpenses(propertyId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, name, description, category_id, amount, date, photo_url, source")
    .eq("property_id", propertyId)
    .order("date", { ascending: false })
    .limit(EXPENSE_LIST_LIMIT);
  if (error) throw error;
  return data.map(toExpense);
}

export async function insertExpense(propertyId: string, id: string, e: Omit<Expense, "id">): Promise<void> {
  const { error } = await supabase.from("expenses").insert({
    id,
    property_id: propertyId,
    category_id: e.categoryId || null,
    name: e.name,
    description: e.description ?? null,
    amount: e.amount,
    date: e.date,
    photo_url: e.photoUrl ?? null,
    source: e.source,
  });
  if (error) throw error;
}

export async function updateExpenseRow(id: string, patch: Partial<Omit<Expense, "id">>): Promise<void> {
  const row: TablesUpdate<"expenses"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description ?? null;
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId || null;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.date !== undefined) row.date = patch.date;
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl ?? null;
  if (patch.source !== undefined) row.source = patch.source;
  const { error } = await supabase.from("expenses").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteExpenseRow(id: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

export async function insertCategory(propertyId: string, id: string, name: string): Promise<void> {
  const { error } = await supabase.from("expense_categories").insert({ id, property_id: propertyId, name });
  if (error) throw error;
}

export async function updateCategoryRow(id: string, patch: Partial<Category>): Promise<void> {
  const row: TablesUpdate<"expense_categories"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.active !== undefined) row.active = patch.active;
  const { error } = await supabase.from("expense_categories").update(row).eq("id", id);
  if (error) throw error;
}
