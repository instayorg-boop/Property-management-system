import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import Select from "../components/Select";
import ExpenseFormDrawer from "../components/ExpenseFormDrawer";
import { useExpenses, type Expense } from "../ExpensesContext";
import { useTenants, formatCurrency } from "../TenantsContext";
import { Paperclip, MagnifyingGlass, GearSix, CaretLeft, CaretRight, DownloadSimple } from "@phosphor-icons/react";

function PaperclipIcon() {
  return <Paperclip size={14} weight="duotone" />;
}

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

function SettingsIcon() {
  return <GearSix size={16} weight="duotone" />;
}

const ROWS_PER_PAGE = 8;

function formatK(n: number) {
  return `K${n.toLocaleString()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function isInMonth(iso: string, label: string) {
  return monthLabel(new Date(iso)) === label;
}

function downloadCsv(filename: string, rows: Expense[], categoryName: (id: string) => string) {
  const header = ["Name", "Description", "Category", "Date", "Amount"];
  const lines = rows.map((e) =>
    [e.name, e.description ?? "", categoryName(e.categoryId), e.date, e.amount]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  const { tenants } = useTenants();
  const location = useLocation();
  const navigate = useNavigate();

  const [monthOffset, setMonthOffset] = useState(0);
  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const month = monthLabel(monthDate);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [prefill, setPrefill] = useState<Partial<Pick<Expense, "name" | "description" | "categoryId">> | undefined>(undefined);
  const [showCategories, setShowCategories] = useState(false);

  // Arriving from a maintenance report's "Log a repair cost" — open Add expense pre-filled.
  useEffect(() => {
    const state = location.state as { expensePrefill?: typeof prefill } | null;
    if (state?.expensePrefill) {
      setEditing(null);
      setPrefill(state.expensePrefill);
      setShowForm(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const monthExpenses = useMemo(() => expenses.filter((e) => isInMonth(e.date, month)), [expenses, month]);

  const filtered = useMemo(() => {
    return monthExpenses
      .filter((e) => categoryFilter === "all" || e.categoryId === categoryFilter)
      .filter(
        (e) =>
          e.name.toLowerCase().includes(query.toLowerCase()) ||
          (e.description ?? "").toLowerCase().includes(query.toLowerCase())
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [monthExpenses, categoryFilter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const total = useMemo(() => monthExpenses.reduce((sum, e) => sum + e.amount, 0), [monthExpenses]);

  const byCategory = useMemo(() => {
    return categories
      .map((c) => ({
        category: c,
        total: monthExpenses.filter((e) => e.categoryId === c.id).reduce((sum, e) => sum + e.amount, 0),
      }))
      .filter((c) => c.category.active || c.total > 0);
  }, [categories, monthExpenses]);

  // Only trustworthy for the current month — tenant status/ledger reflect live state, not a clean
  // per-month history, so a past month here can't be reconstructed accurately.
  const rentCollected = useMemo(() => {
    if (monthOffset !== 0) return null;
    return tenants
      .filter((t) => t.active)
      .reduce((sum, t) => {
        if (t.status === "paid") return sum + t.rentAmount;
        if (t.status === "partial") return sum + (t.ledger[0]?.paidAmount ?? 0);
        return sum;
      }, 0);
  }, [tenants, monthOffset]);

  return (
    <>
      <PageHeader title="Expenses" />

      <div className="space-y-5 px-4 sm:px-8 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-line bg-paper px-1.5 py-1">
              <button
                type="button"
                onClick={() => setMonthOffset((o) => o - 1)}
                aria-label="Previous month"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
              >
                <CaretLeft size={14} weight="bold" />
              </button>
              <span className="w-36 text-center text-sm font-medium text-ink">{month}</span>
              <button
                type="button"
                onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
                disabled={monthOffset === 0}
                aria-label="Next month"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <CaretRight size={14} weight="bold" />
              </button>
            </div>
            <div>
              <p className="text-xs text-muted">Total spent</p>
              <p className="font-display text-lg font-semibold text-ink">{formatK(total)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadCsv(`expenses-${month.replace(" ", "-")}.csv`, filtered, categoryName)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
            >
              <DownloadSimple size={14} weight="bold" />
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
                setPrefill(undefined);
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
              onClick={() => {
                setCategoryFilter(c.category.id);
                setPage(1);
              }}
              className={`min-w-40 flex-1 rounded-lg border p-5 text-left transition-colors ${
                categoryFilter === c.category.id ? "border-brand bg-brand-soft" : "border-line bg-paper hover:bg-mist"
              }`}
            >
              <p className="text-xs text-muted">{c.category.name}</p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{formatK(c.total)}</p>
            </button>
          ))}
        </div>

        {rentCollected !== null && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-line bg-paper px-5 py-3 text-sm">
            <span className="text-muted">
              Rent collected: <span className="font-medium text-ink">{formatCurrency(rentCollected)}</span>
            </span>
            <span className="text-muted">
              Expenses: <span className="font-medium text-ink">{formatK(total)}</span>
            </span>
            <span className={`font-medium ${rentCollected - total >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              Net to owner: {formatCurrency(rentCollected - total)}
            </span>
          </div>
        )}

        {/* Search + filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or description"
              className="w-56 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <Select
            value={categoryFilter}
            onChange={(v) => {
              setCategoryFilter(v);
              setPage(1);
            }}
            options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>

        {/* Expense table */}
        <div className="overflow-x-auto rounded-lg border border-line">
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
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium">Receipt</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((e) => (
                <tr key={e.id} className="border-t border-line transition-colors hover:bg-mist">
                  <td className="truncate px-3 py-2.5 text-ink">
                    {e.name}
                    {e.description && <span className="ml-1.5 text-xs text-muted">— {e.description}</span>}
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
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No expenses found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-1.5 border-t border-line p-4">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                    currentPage === p ? "bg-ink text-paper" : "text-muted hover:bg-mist"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showForm && <ExpenseFormDrawer editing={editing} prefill={prefill} onClose={() => setShowForm(false)} />}
        {showCategories && <ManageCategoriesModal onClose={() => setShowCategories(false)} />}
      </AnimatePresence>
    </>
  );
}
