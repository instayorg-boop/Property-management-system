import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import ExpenseFormDrawer from "../components/ExpenseFormDrawer";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { useExpenses, type Expense, type Category } from "../ExpensesContext";
import { useTenants, formatCurrency } from "../TenantsContext";
import { Paperclip, MagnifyingGlass, GearSix, CaretLeft, CaretRight, DownloadSimple, Receipt } from "@phosphor-icons/react";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import MetricCard from "../components/MetricCard";
import Button from "../components/Button";

// Badge colors for expense categories — same bg-50/text-600 pairing every status pill in the app
// already uses (see Rent.tsx's statusStyle, Maintenance.tsx's statusStyle, etc.), just cycled
// across an open-ended, landlord-defined list instead of a fixed enum. Assigned by each category's
// stable position in the categories list, so a given category always gets the same color.
const CATEGORY_BADGE_COLORS = [
  "bg-blue-50 text-blue-600",
  "bg-orange-50 text-orange-600",
  "bg-emerald-50 text-emerald-600",
  "bg-amber-50 text-amber-600",
  "bg-pink-50 text-pink-600",
  "bg-teal-50 text-teal-600",
  "bg-violet-50 text-violet-600",
  "bg-red-50 text-red-600",
];

function categoryBadgeStyle(categories: Category[], categoryId: string): string {
  const index = categories.findIndex((c) => c.id === categoryId);
  return CATEGORY_BADGE_COLORS[index >= 0 ? index % CATEGORY_BADGE_COLORS.length : 0];
}

function PaperclipIcon() {
  return <Paperclip size={14} weight="duotone" />;
}

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

function SettingsIcon() {
  return <GearSix size={16} weight="duotone" />;
}

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
          <Button
            variant="primary"
            onClick={() => {
              if (!newName.trim()) return;
              addCategory(newName.trim());
              setNewName("");
            }}
          >
            Add
          </Button>
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

export default function Accounting() {
  const { expenses, categories, categoryName, isReady } = useExpenses();
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
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

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

  // Rent owed right now by active tenants who are behind — "Pending payments" on the stat row.
  const pending = useMemo(() => {
    const behind = tenants.filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid" || t.status === "partial"));
    return { total: behind.reduce((sum, t) => sum + t.owedAmount, 0), count: behind.length };
  }, [tenants]);

  const netProfit = rentCollected === null ? null : rentCollected - total;

  return (
    <>
      <PageHeader title="Accounting" />

      <div className="space-y-5 px-4 sm:px-8 pb-10">
        {/* Month switcher + primary actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
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
            {monthOffset !== 0 && (
              <button
                type="button"
                onClick={() => setMonthOffset(0)}
                className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft"
              >
                Back to this month
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="gap-1.5"
              onClick={() => downloadCsv(`expenses-${month.replace(" ", "-")}.csv`, filtered, categoryName)}
            >
              <DownloadSimple size={14} weight="bold" />
              Export
            </Button>
            <Button variant="secondary" className="gap-1.5" onClick={() => setShowCategories(true)}>
              <SettingsIcon />
              Categories
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setPrefill(undefined);
                setShowForm(true);
              }}
            >
              + Add expense
            </Button>
          </div>
        </div>

        {/* At-a-glance summary — the numbers an owner checks first, for the selected month */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!isReady ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-line bg-paper p-3.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-6 w-24" />
              </div>
            ))
          ) : (
            <>
              <MetricCard
                label="Total income"
                value={rentCollected === null ? "—" : formatCurrency(rentCollected)}
                caption={monthOffset === 0 ? "Collected so far this month" : "Only tracked for the current month"}
              />
              <MetricCard
                label="Total expenses"
                value={formatK(total)}
                caption={`${monthExpenses.length} expense${monthExpenses.length === 1 ? "" : "s"} in ${month}`}
              />
              <MetricCard
                label="Net profit"
                value={netProfit === null ? "—" : formatCurrency(netProfit)}
                tone={netProfit === null ? "default" : netProfit >= 0 ? "success" : "danger"}
                caption="Income minus expenses"
              />
              <MetricCard
                label="Pending payments"
                value={formatCurrency(pending.total)}
                tone={pending.count > 0 ? "warning" : "default"}
                caption={pending.count > 0 ? `${pending.count} tenant${pending.count === 1 ? "" : "s"} behind` : "Nothing outstanding"}
              />
            </>
          )}
        </div>

        {/* Transactions — search/filter toolbar attached to the table, same card-with-toolbar
            pattern as Rent's and Tenants' tables. Click any row for the full detail (category,
            receipt, description) in the same drawer "Add expense" uses, rather than cramming
            every field into the row — the list only needs to be scannable, not exhaustive. */}
        <div className="rounded-lg border border-line bg-paper">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5 rounded-md bg-mist px-3.5 py-2.5 transition-colors focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand/25 sm:w-64">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name or description"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>

            {/* Category filter — doubles as a breakdown, scrolls horizontally if the list grows */}
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("all");
                    setPage(1);
                  }}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-left transition-colors ${
                    categoryFilter === "all" ? "border-brand bg-brand-soft" : "border-line bg-paper hover:bg-mist"
                  }`}
                >
                  <span className="text-xs font-medium text-ink">All</span>
                  <span className="text-xs text-muted">{formatK(total)}</span>
                </button>
                {byCategory.map((c) => (
                  <button
                    key={c.category.id}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(c.category.id);
                      setPage(1);
                    }}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-left transition-colors ${
                      categoryFilter === c.category.id ? "border-brand bg-brand-soft" : "border-line bg-paper hover:bg-mist"
                    }`}
                  >
                    <span className="text-xs font-medium text-ink">{c.category.name}</span>
                    <span className="text-xs text-muted">{formatK(c.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile: cards — an HTML table doesn't have room to breathe on a phone screen */}
          <div className="divide-y divide-line md:hidden">
            {!isReady &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            {isReady &&
              pageRows.map((e) => (
                <div
                  key={e.id}
                  onClick={() => {
                    setEditing(e);
                    setShowForm(true);
                  }}
                  className="p-4 transition-colors active:bg-mist"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {e.hasPhoto && (
                          <span className="mr-1 inline-flex text-muted">
                            <PaperclipIcon />
                          </span>
                        )}
                        {e.name}
                      </p>
                      {e.description && <p className="mt-0.5 truncate text-xs text-muted">{e.description}</p>}
                    </div>
                    <p className="shrink-0 text-sm font-medium text-ink">{formatK(e.amount)}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryBadgeStyle(categories, e.categoryId)}`}>
                      {categoryName(e.categoryId)}
                    </span>
                    {e.source === "payroll" && (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">Auto</span>
                    )}
                    <span className="text-xs text-muted">{formatDate(e.date)}</span>
                  </div>
                </div>
              ))}
            {isReady && pageRows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <Receipt size={22} weight="duotone" />
                </span>
                <p className="text-xs font-semibold text-ink">No expenses found</p>
              </div>
            )}
          </div>

          {/* Desktop / tablet: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-mist text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {!isReady && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={4} />)}
                {isReady &&
                  pageRows.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => {
                        setEditing(e);
                        setShowForm(true);
                      }}
                      className="cursor-pointer border-t border-line transition-colors hover:bg-mist"
                    >
                      <td className="px-4 py-3">
                        <p className="flex items-center gap-1.5 font-medium text-ink">
                          {e.hasPhoto && <span className="text-muted"><PaperclipIcon /></span>}
                          {e.name}
                          {e.source === "payroll" && (
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-violet-600">
                              Auto
                            </span>
                          )}
                        </p>
                        {e.description && <p className="mt-0.5 text-xs text-muted">{e.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${categoryBadgeStyle(categories, e.categoryId)}`}>
                          {categoryName(e.categoryId)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(e.date)}</td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-ink">{formatK(e.amount)}</td>
                    </tr>
                  ))}
                {isReady && pageRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                          <Receipt size={22} weight="duotone" />
                        </span>
                        <p className="text-xs font-semibold text-ink">No expenses found</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              pageSize={rowsPerPage}
              totalItems={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setRowsPerPage(size);
                setPage(1);
              }}
            />
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
