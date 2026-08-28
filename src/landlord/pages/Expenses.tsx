import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import SlideOver from "../components/SlideOver";
import Select from "../components/Select";
import { useExpenses, type Expense } from "../ExpensesContext";

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <path
        d="M10.5 4.5 5 10a2 2 0 1 0 2.83 2.83L13.5 7a3.5 3.5 0 0 0-5-5L3 7.5a5 5 0 0 0 7.07 7.07"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.5}>
      <circle cx="8" cy="8" r="2" />
      <path
        d="M13 8a5 5 0 0 0-.1-1l1.2-1-1-1.7-1.4.5a5 5 0 0 0-1.7-1L9.7 2H6.3l-.3 1.5a5 5 0 0 0-1.7 1l-1.4-.5-1 1.7 1.2 1a5 5 0 0 0 0 2l-1.2 1 1 1.7 1.4-.5a5 5 0 0 0 1.7 1l.3 1.5h3.4l.3-1.5a5 5 0 0 0 1.7-1l1.4.5 1-1.7-1.2-1c.07-.33.1-.66.1-1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const months = ["August 2026", "July 2026", "June 2026", "May 2026"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatK(n: number) {
  return `K${n.toLocaleString()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isInMonth(iso: string, monthLabel: string) {
  const d = new Date(iso);
  const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return label === monthLabel;
}

// ---------- Add / edit expense ----------

function ExpenseFormDrawer({
  editing,
  onClose,
}: {
  editing: Expense | null;
  onClose: () => void;
}) {
  const { categories, addExpense, updateExpense, deleteExpense, addCategory } = useExpenses();
  const activeCategories = categories.filter((c) => c.active);

  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? activeCategories[0]?.id ?? "");
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [hasPhoto, setHasPhoto] = useState(editing?.hasPhoto ?? false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const confirmNewCategory = () => {
    if (!newCategoryName.trim()) return;
    const cat = addCategory(newCategoryName.trim());
    setCategoryId(cat.id);
    setNewCategoryName("");
    setAddingCategory(false);
  };

  const submit = () => {
    if (!description.trim() || !amount || !categoryId) return;
    const payload = {
      description,
      categoryId,
      amount: parseInt(amount.replace(/[^\d]/g, ""), 10) || 0,
      date,
      hasPhoto,
      source: "manual" as const,
    };
    if (editing) {
      updateExpense(editing.id, payload);
    } else {
      addExpense(payload);
    }
    onClose();
  };

  return (
    <SlideOver
      onClose={onClose}
      title={editing ? "Edit expense" : "Add expense"}
      footer={
        <div className="flex justify-end gap-2">
          {editing && (
            <button
              type="button"
              onClick={() => {
                deleteExpense(editing.id);
                onClose();
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
          >
            {editing ? "Save changes" : "Add expense"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Amount (K)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-muted">Category</label>
            <button
              type="button"
              onClick={() => setAddingCategory((v) => !v)}
              className="text-xs font-medium text-brand hover:text-ink"
            >
              {addingCategory ? "Cancel" : "+ New category"}
            </button>
          </div>

          {addingCategory ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Generator fuel"
                className="flex-1 rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={confirmNewCategory}
                className="rounded-lg bg-brand px-4 text-sm font-medium text-paper"
              >
                Add
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {activeCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    categoryId === c.id ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Receipt</label>
          {hasPhoto ? (
            <div className="space-y-2">
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-line bg-mist text-sm text-muted">
                Receipt photo
              </div>
              <button
                type="button"
                onClick={() => setHasPhoto(false)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove photo
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setHasPhoto(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line py-2.5 text-sm font-medium text-muted transition-colors hover:bg-mist"
            >
              <PaperclipIcon />
              Attach receipt photo (optional)
            </button>
          )}
        </div>
      </div>
    </SlideOver>
  );
}

// ---------- Manage categories ----------

function ManageCategoriesModal({ onClose }: { onClose: () => void }) {
  const { categories, addCategory, renameCategory, setCategoryActive } = useExpenses();
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <Modal
      onClose={onClose}
      title="Manage categories"
      description="Deactivating a category keeps its past expenses on record."
      footer={
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => {
              if (!newName.trim()) return;
              addCategory(newName.trim());
              setNewName("");
            }}
            className="rounded-lg bg-brand px-4 text-sm font-medium text-paper"
          >
            Add
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-line px-3.5 py-2.5">
            {renamingId === c.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim()) {
                    renameCategory(c.id, renameValue.trim());
                    setRenamingId(null);
                  }
                }}
                className="flex-1 rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand"
              />
            ) : (
              <span className={`text-sm ${c.active ? "text-ink" : "text-muted line-through"}`}>{c.name}</span>
            )}

            <div className="flex items-center gap-3 text-xs">
              {renamingId === c.id ? (
                <button
                  type="button"
                  onClick={() => {
                    if (renameValue.trim()) renameCategory(c.id, renameValue.trim());
                    setRenamingId(null);
                  }}
                  className="font-medium text-brand"
                >
                  Save
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(c.id);
                    setRenameValue(c.name);
                  }}
                  className="font-medium text-muted hover:text-ink"
                >
                  Rename
                </button>
              )}
              <button
                type="button"
                onClick={() => setCategoryActive(c.id, !c.active)}
                className={`font-medium ${c.active ? "text-red-600" : "text-emerald-600"}`}
              >
                {c.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function Expenses() {
  const { expenses, categories, categoryName } = useExpenses();
  const [month, setMonth] = useState(months[0]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showCategories, setShowCategories] = useState(false);

  const monthExpenses = useMemo(() => expenses.filter((e) => isInMonth(e.date, month)), [expenses, month]);

  const filtered = useMemo(() => {
    return monthExpenses
      .filter((e) => categoryFilter === "all" || e.categoryId === categoryFilter)
      .filter((e) => e.description.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [monthExpenses, categoryFilter, query]);

  const total = useMemo(() => monthExpenses.reduce((sum, e) => sum + e.amount, 0), [monthExpenses]);

  const byCategory = useMemo(() => {
    return categories
      .map((c) => ({
        category: c,
        total: monthExpenses.filter((e) => e.categoryId === c.id).reduce((sum, e) => sum + e.amount, 0),
      }))
      .filter((c) => c.category.active || c.total > 0);
  }, [categories, monthExpenses]);

  return (
    <>
      <PageHeader title="Expenses" />

      <div className="space-y-5 px-8 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Select value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: m }))} />
            <div>
              <p className="text-xs text-muted">Total spent</p>
              <p className="font-display text-lg font-semibold text-ink">{formatK(total)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => setShowCategories(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
            >
              <SettingsIcon />
              Categories
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
            >
              Add expense
            </button>
          </div>
        </div>

        {/* Category breakdown — grows with however many categories exist */}
        <div className="flex flex-wrap gap-4">
          {byCategory.map((c) => (
            <button
              key={c.category.id}
              type="button"
              onClick={() => setCategoryFilter(c.category.id)}
              className={`min-w-40 flex-1 rounded-xl border p-5 text-left transition-colors ${
                categoryFilter === c.category.id ? "border-brand bg-brand-soft" : "border-line bg-paper hover:bg-mist"
              }`}
            >
              <p className="text-xs text-muted">{c.category.name}</p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{formatK(c.total)}</p>
            </button>
          ))}
        </div>

        {/* Search + filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by description"
              className="w-56 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>

        {/* Expense table */}
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col />
              <col className="w-32" />
              <col className="w-16" />
              <col className="w-36" />
              <col className="w-24" />
              <col className="w-14" />
            </colgroup>
            <thead className="bg-mist text-xs text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium">Receipt</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-line transition-colors hover:bg-mist">
                  <td className="truncate px-3 py-2.5 text-ink">
                    {e.description}
                    {e.source === "payroll" && (
                      <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-violet-600">
                        Auto
                      </span>
                    )}
                  </td>
                  <td className="truncate px-3 py-2.5 text-muted">{categoryName(e.categoryId)}</td>
                  <td className="px-3 py-2.5">
                    {e.hasPhoto ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(e);
                          setShowForm(true);
                        }}
                        aria-label="View receipt"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-paper hover:text-ink"
                      >
                        <PaperclipIcon />
                      </button>
                    ) : (
                      <span className="text-xs text-muted/60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">{formatDate(e.date)}</td>
                  <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-ink">{formatK(e.amount)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(e);
                        setShowForm(true);
                      }}
                      className="text-xs font-medium text-brand hover:text-ink"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No expenses found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showForm && <ExpenseFormDrawer editing={editing} onClose={() => setShowForm(false)} />}
        {showCategories && <ManageCategoriesModal onClose={() => setShowCategories(false)} />}
      </AnimatePresence>
    </>
  );
}
