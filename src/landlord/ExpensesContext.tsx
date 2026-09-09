import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import { useToast } from "./ToastContext";
import {
  listCategories,
  listExpenses,
  insertExpense,
  updateExpenseRow,
  deleteExpenseRow,
  insertCategory,
  updateCategoryRow,
  type Category,
  type Expense,
} from "../lib/expenses";
import { readCachedView, writeCachedView } from "../lib/offline/cachedView";

export type { Category, Expense };

const CATEGORIES_VIEW_KEY = "expense_categories";
const EXPENSES_VIEW_KEY = "expenses";

type ExpensesContextValue = {
  expenses: Expense[];
  categories: Category[];
  /** False until the initial Supabase fetch resolves. */
  isReady: boolean;
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
  const { propertyId } = useSettings();
  const { showToast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;

    Promise.all([
      readCachedView<Category>(CATEGORIES_VIEW_KEY, propertyId),
      readCachedView<Expense>(EXPENSES_VIEW_KEY, propertyId),
    ]).then(([cachedCats, cachedExps]) => {
      if (cancelled) return;
      if (cachedCats) setCategories(cachedCats);
      if (cachedExps) setExpenses(cachedExps);
      if (cachedCats || cachedExps) setIsReady(true);
    });

    (async () => {
      try {
        const [cats, exps] = await Promise.all([listCategories(propertyId), listExpenses(propertyId)]);
        if (cancelled) return;
        setCategories(cats);
        setExpenses(exps);
        setIsReady(true);
        void writeCachedView(CATEGORIES_VIEW_KEY, propertyId, cats);
        void writeCachedView(EXPENSES_VIEW_KEY, propertyId, exps);
      } catch (e) {
        if (!cancelled && !navigator.onLine) setIsReady(true);
        else console.error("Failed to load expenses", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const addExpense = (e: Omit<Expense, "id">) => {
    const expense: Expense = { ...e, id: crypto.randomUUID() };
    setExpenses((prev) => [expense, ...prev]);
    if (propertyId) {
      void insertExpense(propertyId, expense.id, e)
        .then(() => showToast(`${e.name || "Expense"} added`, "success"))
        .catch((err) => {
          console.error("Failed to save expense", err);
          setExpenses((prev) => prev.filter((x) => x.id !== expense.id));
          showToast(`Couldn't save ${e.name || "that expense"} — please try again.`, "error");
        });
    } else {
      setExpenses((prev) => prev.filter((x) => x.id !== expense.id));
      showToast(`Couldn't save ${e.name || "that expense"} — the app is still loading. Please wait a moment and try again.`, "error");
    }
  };

  const updateExpense = (id: string, patch: Partial<Omit<Expense, "id">>) => {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    void updateExpenseRow(id, patch).catch((err) => {
      console.error("Failed to update expense", err);
      showToast("Couldn't save that change — please try again.", "error");
    });
  };

  const deleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    void deleteExpenseRow(id).catch((err) => {
      console.error("Failed to delete expense", err);
      showToast("Couldn't delete that expense — please try again.", "error");
    });
  };

  const addCategory = (name: string) => {
    const category: Category = { id: crypto.randomUUID(), name, active: true };
    setCategories((prev) => [...prev, category]);
    if (propertyId)
      void insertCategory(propertyId, category.id, name).catch((err) => {
        console.error("Failed to save category", err);
        showToast("Couldn't save that category — please try again.", "error");
      });
    return category;
  };

  const renameCategory = (id: string, name: string) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    void updateCategoryRow(id, { name }).catch((err) => {
      console.error("Failed to rename category", err);
      showToast("Couldn't rename that category — please try again.", "error");
    });
  };

  const setCategoryActive = (id: string, active: boolean) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, active } : c)));
    void updateCategoryRow(id, { active }).catch((err) => {
      console.error("Failed to update category", err);
      showToast("Couldn't save that change — please try again.", "error");
    });
  };

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Uncategorized";

  return (
    <ExpensesContext.Provider
      value={{ expenses, categories, isReady, addExpense, updateExpense, deleteExpense, addCategory, renameCategory, setCategoryActive, categoryName }}
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
