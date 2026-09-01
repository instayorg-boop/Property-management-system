import { createContext, useContext, useState, type ReactNode } from "react";

export type Category = {
  id: string;
  name: string;
  active: boolean;
};

export type Expense = {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  amount: number;
  date: string; // ISO
  hasPhoto: boolean;
  source: "manual" | "payroll";
};

const defaultCategories: Category[] = [
  { id: "maintenance", name: "Maintenance", active: true },
  { id: "staff-wages", name: "Staff wages", active: true },
  { id: "utilities", name: "Utilities", active: true },
  { id: "other", name: "Other", active: true },
];

const initialExpenses: Expense[] = [
  { id: "e1", name: "Plumber — Room 08 leak", categoryId: "maintenance", amount: 450, date: "2026-08-22", hasPhoto: true, source: "manual" },
  { id: "e2", name: "Security guard salaries", categoryId: "staff-wages", amount: 6200, date: "2026-08-20", hasPhoto: false, source: "manual" },
  { id: "e3", name: "ZESCO bill", categoryId: "utilities", amount: 1340, date: "2026-08-18", hasPhoto: true, source: "manual" },
  { id: "e4", name: "Water bill", categoryId: "utilities", amount: 620, date: "2026-08-15", hasPhoto: false, source: "manual" },
  { id: "e5", name: "Gate repair", categoryId: "maintenance", amount: 890, date: "2026-08-10", hasPhoto: true, source: "manual" },
  { id: "e6", name: "Office supplies", categoryId: "other", amount: 210, date: "2026-08-06", hasPhoto: false, source: "manual" },
  { id: "e7", name: "Cleaner — weekly service", categoryId: "staff-wages", amount: 480, date: "2026-08-25", hasPhoto: false, source: "manual" },
  { id: "e8", name: "Borehole pump repair", categoryId: "maintenance", amount: 1150, date: "2026-08-24", hasPhoto: true, source: "manual" },
  { id: "e9", name: "Internet — property WiFi", categoryId: "utilities", amount: 380, date: "2026-08-12", hasPhoto: false, source: "manual" },
  { id: "e10", name: "Paint — common area touch-up", categoryId: "maintenance", amount: 340, date: "2026-08-08", hasPhoto: true, source: "manual" },
  { id: "e11", name: "Garbage collection", categoryId: "utilities", amount: 260, date: "2026-08-05", hasPhoto: false, source: "manual" },
  { id: "e12", name: "Stationery & printing", categoryId: "other", amount: 95, date: "2026-08-03", hasPhoto: false, source: "manual" },
  { id: "e13", name: "Caretaker salary", categoryId: "staff-wages", amount: 2400, date: "2026-08-01", hasPhoto: false, source: "manual" },
  { id: "e14", name: "Security guard salaries", categoryId: "staff-wages", amount: 6100, date: "2026-07-20", hasPhoto: false, source: "manual" },
  { id: "e15", name: "ZESCO bill", categoryId: "utilities", amount: 1210, date: "2026-07-18", hasPhoto: true, source: "manual" },
  { id: "e16", name: "Water bill", categoryId: "utilities", amount: 590, date: "2026-07-15", hasPhoto: false, source: "manual" },
  { id: "e17", name: "Roof leak repair — Room 22", categoryId: "maintenance", amount: 1620, date: "2026-07-11", hasPhoto: true, source: "manual" },
  { id: "e18", name: "Caretaker salary", categoryId: "staff-wages", amount: 2400, date: "2026-07-01", hasPhoto: false, source: "manual" },
];

type ExpensesContextValue = {
  expenses: Expense[];
  categories: Category[];
  addExpense: (e: Omit<Expense, "id">) => void;
  updateExpense: (id: string, patch: Partial<Omit<Expense, "id">>) => void;
  deleteExpense: (id: string) => void;
  addCategory: (name: string) => Category;
  renameCategory: (id: string, name: string) => void;
  setCategoryActive: (id: string, active: boolean) => void;
  categoryName: (id: string) => string;
};

const ExpensesContext = createContext<ExpensesContextValue | null>(null);

export function ExpensesProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);

  const addExpense = (e: Omit<Expense, "id">) => {
    setExpenses((prev) => [{ ...e, id: `e${Date.now()}` }, ...prev]);
  };

  const updateExpense = (id: string, patch: Partial<Omit<Expense, "id">>) => {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const deleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const addCategory = (name: string) => {
    const category: Category = { id: `cat${Date.now()}`, name, active: true };
    setCategories((prev) => [...prev, category]);
    return category;
  };

  const renameCategory = (id: string, name: string) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  const setCategoryActive = (id: string, active: boolean) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, active } : c)));
  };

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Uncategorized";

  return (
    <ExpensesContext.Provider
      value={{ expenses, categories, addExpense, updateExpense, deleteExpense, addCategory, renameCategory, setCategoryActive, categoryName }}
    >
      {children}
    </ExpensesContext.Provider>
  );
}

export function useExpenses() {
  const ctx = useContext(ExpensesContext);
  if (!ctx) throw new Error("useExpenses must be used within ExpensesProvider");
  return ctx;
}
