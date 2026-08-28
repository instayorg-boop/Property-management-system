import { createContext, useContext, useState, type ReactNode } from "react";

export type Category = {
  id: string;
  name: string;
  active: boolean;
};

export type Expense = {
  id: string;
  description: string;
  categoryId: string;
  amount: number;
  date: string; // ISO
  hasPhoto: boolean;
  source: "manual" | "payroll";
  property?: string;
};

const defaultCategories: Category[] = [
  { id: "maintenance", name: "Maintenance", active: true },
  { id: "staff-wages", name: "Staff wages", active: true },
  { id: "utilities", name: "Utilities", active: true },
  { id: "other", name: "Other", active: true },
];

const initialExpenses: Expense[] = [
  { id: "e1", description: "Plumber — Room 08 leak", categoryId: "maintenance", amount: 450, date: "2026-08-22", hasPhoto: true, source: "manual" },
  { id: "e2", description: "Security guard salaries", categoryId: "staff-wages", amount: 6200, date: "2026-08-20", hasPhoto: false, source: "manual" },
  { id: "e3", description: "ZESCO bill", categoryId: "utilities", amount: 1340, date: "2026-08-18", hasPhoto: true, source: "manual" },
  { id: "e4", description: "Water bill", categoryId: "utilities", amount: 620, date: "2026-08-15", hasPhoto: false, source: "manual" },
  { id: "e5", description: "Gate repair", categoryId: "maintenance", amount: 890, date: "2026-08-10", hasPhoto: true, source: "manual" },
  { id: "e6", description: "Office supplies", categoryId: "other", amount: 210, date: "2026-08-06", hasPhoto: false, source: "manual" },
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
