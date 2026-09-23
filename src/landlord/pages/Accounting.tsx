import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import ExpenseFormDrawer from "../components/ExpenseFormDrawer";
import Lightbox from "../components/Lightbox";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { useExpenses, type Expense, type Category } from "../ExpensesContext";
import { useTenants, formatCurrency } from "../TenantsContext";
import { calcTotalOwed } from "../invoiceUtils";
import {
  Paperclip,
  MagnifyingGlass,
  GearSix,
  DownloadSimple,
  Receipt,
  Plus,
  Tag,
  PencilSimple,
  Trash,
  ArrowCounterClockwise,
  Archive,
  Sparkle,
  Check,
  X as XIcon,
} from "@phosphor-icons/react";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import MetricCard from "../components/MetricCard";
import Button from "../components/Button";
import MonthSwitcher from "../components/MonthSwitcher";
import { useToast } from "../ToastContext";
import Expensephoto from "../../assets/Expenses Empty State Ui.png"

// Shown as clickable chips in the empty state — landlord-relevant expense categories that aren't
// already in the list. Clicking one adds it immediately; it's a starting point, not a limit.
const SUGGESTED_CATEGORIES = [
  "Utilities",
  "Repairs",
  "HOA Fees",
  "Insurance",
  "Property Taxes",
  "Management Fees",
  "Advertising",
  "Cleaning",
  "Landscaping",
  "Pest Control",
];

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

// Same order as CATEGORY_BADGE_COLORS, but a solid tone — for the small identity dot in the
// category manager grid, where the pale bg-*-50 badge fill would be nearly invisible at that size.
const CATEGORY_DOT_COLORS = [
  "bg-blue-500",
  "bg-orange-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-violet-500",
  "bg-red-500",
];

function categoryColorIndex(categories: Category[], categoryId: string): number {
  const index = categories.findIndex((c) => c.id === categoryId);
  return index >= 0 ? index % CATEGORY_BADGE_COLORS.length : 0;
}

function categoryBadgeStyle(categories: Category[], categoryId: string): string {
  return CATEGORY_BADGE_COLORS[categoryColorIndex(categories, categoryId)];
}

function categoryDotStyle(categories: Category[], categoryId: string): string {
  return CATEGORY_DOT_COLORS[categoryColorIndex(categories, categoryId)];
}

/** A value that briefly settles in (fade + tiny rise) whenever it changes, instead of jump-cutting
 * — for figures that visibly update from a user action (switching months, filtering) rather than
 * every render. Same easing family as the rest of the app's small transitions. */
function AnimatedValue({ value }: { value: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={value}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="inline-block"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
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

/** Clickable suggestion chip — the empty state's "instantly add it" affordance. Disabled once its
 * name already exists (case-insensitively) so re-clicking a just-added suggestion is a no-op
 * instead of creating a duplicate category. */
function SuggestionChip({ name, onAdd, disabled }: { name: string; onAdd: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-95 ${disabled
        ? "cursor-default border-line bg-mist text-muted"
        : "border-line bg-paper text-ink hover:border-brand hover:bg-brand-soft hover:text-brand"
        }`}
    >
      {disabled ? <Check size={14} weight="bold" /> : <Plus size={14} weight="bold" />}
      {name}
    </button>
  );
}

/** No categories at all — a brand-new property, or every category's been archived. The smart
 * suggestions turn a blank, slightly intimidating list into a one-click start. */
function CategoriesEmptyState({ existingNames, onAdd }: { existingNames: string[]; onAdd: (name: string) => void }) {
  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Tag size={26} weight="duotone" />
      </span>
      <div className="max-w-xs">
        <p className="font-display text-lg font-semibold tracking-tight text-ink">Organize your property expenses</p>
        <p className="mt-1.5 text-sm text-muted">
          Labels help you track cash flow and simplify tax season — group repairs, bills, and fees so you always know where the money's going.
        </p>
      </div>

      <div className="w-full">
        <p className="mb-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted">
          <Sparkle size={13} weight="fill" className="text-brand" />
          Smart suggestions
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTED_CATEGORIES.map((name) => (
            <SuggestionChip key={name} name={name} disabled={existing.has(name.toLowerCase())} onAdd={() => onAdd(name)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One category row — a colored identity dot, the name (or an inline rename field), and its
 * actions. A category still in use on some expense can only be archived (hidden from new
 * expenses, kept on old ones); an unused one can be deleted outright, which is the "simple to use
 * remove" a landlord actually wants for a category they added by mistake or never ended up using.
 * Actions are always visible rather than hover-only — a hover reveal doesn't exist on touch, and
 * this list is short enough that showing them plainly costs nothing. */
function CategoryRow({
  category,
  dotClassName,
  inUse,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onToggleActive,
  onRequestDelete,
}: {
  category: Category;
  dotClassName: string;
  inUse: boolean;
  isRenaming: boolean;
  renameValue: string;
  onRenameValueChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleActive: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3.5 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${category.active ? dotClassName : "bg-muted"}`} />
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && renameValue.trim()) onCommitRename();
            if (e.key === "Escape") onCancelRename();
          }}
          onBlur={() => (renameValue.trim() ? onCommitRename() : onCancelRename())}
          className="min-w-0 flex-1 rounded border border-line bg-paper px-1.5 py-0.5 text-sm outline-none focus:border-brand"
        />
      ) : (
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${category.active ? "text-ink" : "text-muted"}`}>{category.name}</span>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onStartRename}
          aria-label={`Rename ${category.name}`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition active:scale-90 hover:bg-mist hover:text-ink"
        >
          <PencilSimple size={13} />
        </button>
        {category.active && (
          <button
            type="button"
            onClick={onToggleActive}
            aria-label={`Archive ${category.name}`}
            title="Archive — hides it from new expenses, keeps past ones"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition active:scale-90 hover:bg-mist hover:text-ink"
          >
            <Archive size={13} />
          </button>
        )}
        {!category.active && (
          <button
            type="button"
            onClick={onToggleActive}
            aria-label={`Restore ${category.name}`}
            title="Restore to active categories"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition active:scale-90 hover:bg-mist hover:text-ink"
          >
            <ArrowCounterClockwise size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={onRequestDelete}
          disabled={inUse}
          aria-label={`Delete ${category.name}`}
          title={inUse ? "Used on existing expenses — archive it instead" : "Delete permanently"}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition active:scale-90 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
        >
          <Trash size={13} />
        </button>
      </div>
    </div>
  );
}

function ManageCategoriesModal({ onClose }: { onClose: () => void }) {
  const { categories, expenses, addCategory, renameCategory, setCategoryActive, deleteCategory } = useExpenses();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  // How many expenses currently point at each category — the single fact that decides whether a
  // category can be deleted outright or only archived.
  const usageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of expenses) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
    return counts;
  }, [expenses]);

  const addAndAnnounce = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`${trimmed} is already a category`, "info");
      return;
    }
    addCategory(trimmed);
    showToast(`${trimmed} added`, "success");
  };

  const submitNew = () => {
    if (!newName.trim()) return;
    addAndAnnounce(newName);
    setNewName("");
    setAdding(false);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) renameCategory(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const activeCategories = filtered.filter((c) => c.active);
  const archivedCategories = filtered.filter((c) => !c.active);

  const rowProps = (c: Category) => ({
    category: c,
    dotClassName: categoryDotStyle(categories, c.id),
    inUse: (usageCount.get(c.id) ?? 0) > 0,
    isRenaming: renamingId === c.id,
    renameValue,
    onRenameValueChange: setRenameValue,
    onStartRename: () => {
      setRenamingId(c.id);
      setRenameValue(c.name);
    },
    onCommitRename: commitRename,
    onCancelRename: () => setRenamingId(null),
    onToggleActive: () => setCategoryActive(c.id, !c.active),
    onRequestDelete: () => setDeletingCategory(c),
  });

  return (
    <Modal onClose={onClose} title="Categories" description="Delete a category you don't use, or archive one with expense history to keep it out of new ones." maxWidth="max-w-xl">
      {categories.length === 0 ? (
        <CategoriesEmptyState existingNames={[]} onAdd={addAndAnnounce} />
      ) : (
        <>
          {/* Search + the obvious "add" action */}
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-mist px-3 py-2">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search categories"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
            <Button variant="primary" className="shrink-0 gap-1.5" onClick={() => setAdding(true)}>
              <Plus size={14} weight="bold" />
              Add category
            </Button>
          </div>

          {adding && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft/40 p-2.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNew();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewName("");
                  }
                }}
                placeholder="e.g. Landscaping"
                className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <Button variant="primary" className="shrink-0" disabled={!newName.trim()} onClick={submitNew}>
                Add
              </Button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                }}
                aria-label="Cancel"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition active:scale-90 hover:bg-mist hover:text-ink"
              >
                <XIcon size={16} />
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="mt-6 py-6 text-center text-sm text-muted">No categories match "{query}".</p>
          ) : (
            <div className="mt-4 max-h-[26rem] space-y-5 overflow-y-auto pr-0.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {activeCategories.map((c) => (
                  <CategoryRow key={c.id} {...rowProps(c)} />
                ))}
              </div>

              {/* Archived — its own labeled section instead of interleaved strike-through rows,
                  so the list you actually use day to day (active) isn't cluttered by ones you
                  already put away. */}
              {archivedCategories.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                    Archived ({archivedCategories.length})
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {archivedCategories.map((c) => (
                      <CategoryRow key={c.id} {...rowProps(c)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {deletingCategory && (
        <Modal
          onClose={() => setDeletingCategory(null)}
          maxWidth="max-w-sm"
          title="Delete category?"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeletingCategory(null)}>
                Cancel
              </Button>
              <button
                type="button"
                onClick={() => {
                  deleteCategory(deletingCategory.id);
                  showToast(`${deletingCategory.name} deleted`, "success");
                  setDeletingCategory(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          }
        >
          <p className="text-sm text-muted">
            This will permanently remove <span className="font-medium text-ink">{deletingCategory.name}</span>. This can't be undone.
          </p>
        </Modal>
      )}
    </Modal>
  );
}

/** "+ Add filter" trigger that opens a searchable dropdown of expense categories — same
 * button-trigger + absolute-panel + blur-timeout-search + mousedown-select-row pattern as
 * BankSelect, rather than a segmented control that keeps stretching as categories are added.
 * Each row carries the category's own color (the same dot used on its badge everywhere else) so
 * it reads as a color-coded filter list rather than a plain text menu. */
function CategoryFilterMenu({
  categories,
  byCategory,
  total,
  categoryFilter,
  onSelect,
}: {
  categories: Category[];
  byCategory: { category: Category; total: number }[];
  total: number;
  categoryFilter: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("left");
  const [query, setQuery] = useState("");
  const blurTimeout = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = byCategory.find((c) => c.category.id === categoryFilter) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return byCategory.filter((c) => !q || c.category.name.toLowerCase().includes(q));
  }, [byCategory, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  // Opens on whichever side actually has room — checked against the viewport at the moment of
  // opening, rather than always anchoring left and letting the panel run off the edge.
  const toggle = () => {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const panelWidth = 256; // w-64
      setAlign(rect.left + panelWidth > window.innerWidth - 16 ? "right" : "left");
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={containerRef} className="relative">
      {selected ? (
        <div className="flex items-center gap-1 rounded-md border border-brand/30 bg-brand-soft/60 py-1 pr-1.5 pl-3 text-sm">
          <button type="button" onClick={toggle} className="flex items-center gap-1.5 font-medium text-ink">
            <span className={`h-2 w-2 rounded-sm ${categoryDotStyle(categories, selected.category.id)}`} />
            {selected.category.name}
            <span className="text-muted">{formatK(selected.total)}</span>
          </button>
          <button
            type="button"
            onClick={() => onSelect("all")}
            aria-label="Clear category filter"
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink active:scale-90"
          >
            <XIcon size={11} weight="bold" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-line px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-brand/40 hover:text-ink active:scale-95"
        >
          <Plus size={13} weight="bold" />
          Filter by category
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            {/* Click-outside catcher */}
            <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={close} tabIndex={-1} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className={`absolute top-full z-20 mt-1.5 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-paper shadow-card ${align === "left" ? "left-0" : "right-0"
                }`}
            >
              <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                <SearchIcon />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => {
                    blurTimeout.current = window.setTimeout(close, 120);
                  }}
                  onFocus={() => {
                    if (blurTimeout.current) window.clearTimeout(blurTimeout.current);
                  }}
                  placeholder="Filter by category…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                />
              </div>

              <div className="max-h-64 overflow-y-auto py-1">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect("all");
                    close();
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-mist ${categoryFilter === "all" ? "font-medium text-brand" : "text-ink"
                    }`}
                >
                  All categories
                  <span className="text-xs text-muted">{formatK(total)}</span>
                </button>
                {results.map((c) => (
                  <button
                    key={c.category.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(c.category.id);
                      close();
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-mist ${categoryFilter === c.category.id ? "font-medium text-brand" : "text-ink"
                      }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${categoryDotStyle(categories, c.category.id)}`} />
                      <span className="truncate">{c.category.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{formatK(c.total)}</span>
                  </button>
                ))}
                {results.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted">No categories match.</p>}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Accounting() {
  const { expenses, categories, categoryName, isReady, deleteExpense } = useExpenses();
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
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

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
  const hasExpenses = monthExpenses.length > 0;

  const total = useMemo(() => monthExpenses.reduce((sum, e) => sum + e.amount, 0), [monthExpenses]);

  const byCategory = useMemo(() => {
    return categories
      .map((c) => ({
        category: c,
        total: monthExpenses.filter((e) => e.categoryId === c.id).reduce((sum, e) => sum + e.amount, 0),
      }))
      .filter((c) => c.category.active || c.total > 0)
      .sort((a, b) => b.total - a.total);
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
    return { total: behind.reduce((sum, t) => sum + calcTotalOwed(t), 0), count: behind.length };
  }, [tenants]);

  const netProfit = rentCollected === null ? null : rentCollected - total;

  return (
    <>
      <PageHeader
        title="Expense Tracker"
        description="Track expenses, income and your property's cash flow."
      />

      <div className="space-y-5 px-4 sm:px-8 pb-10">
        {/* Month switcher + primary actions */}
        <div className="flex flex-wrap items-center gap-3">
          {(!isReady || hasExpenses) && (
            <MonthSwitcher
              month={month}
              monthOffset={monthOffset}
              onPrev={() => setMonthOffset((o) => o - 1)}
              onNext={() => setMonthOffset((o) => Math.min(0, o + 1))}
              onJumpToNow={() => setMonthOffset(0)}
            />
          )}

          <div className="flex items-center gap-2 ml-auto">
            {hasExpenses && (
              <Button
                variant="secondary"
                className="gap-1.5"
                onClick={() => downloadCsv(`expenses-${month.replace(" ", "-")}.csv`, filtered, categoryName)}
              >
                <DownloadSimple size={14} weight="bold" />
                Export
              </Button>
            )}
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

        {!isReady || hasExpenses ? (
          <>
            {/* At-a-glance summary */}
            <div key={`stats-${month}`} className="pay-step grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    value={<AnimatedValue value={rentCollected === null ? "—" : formatCurrency(rentCollected)} />}
                    caption={monthOffset === 0 ? "Collected so far this month" : "Only tracked for the current month"}
                  />
                  <MetricCard
                    label="Total expenses"
                    value={<AnimatedValue value={formatK(total)} />}
                    caption={`${monthExpenses.length} expense${monthExpenses.length === 1 ? "" : "s"} in ${month}`}
                  />
                  <MetricCard
                    label="Net profit"
                    value={<AnimatedValue value={netProfit === null ? "—" : formatCurrency(netProfit)} />}
                    tone={netProfit === null ? "default" : netProfit >= 0 ? "success" : "danger"}
                    caption="Income minus expenses"
                  />
                  <MetricCard
                    label="Pending payments"
                    value={<AnimatedValue value={formatCurrency(pending.total)} />}
                    tone={pending.count > 0 ? "warning" : "default"}
                    caption={pending.count > 0 ? `${pending.count} tenant${pending.count === 1 ? "" : "s"} behind` : "Nothing outstanding"}
                  />
                </>
              )}
            </div>

            {/* Transactions table */}
            <div key={`table-${month}`} className="pay-step rounded-lg border border-line bg-paper">
              <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
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

                <CategoryFilterMenu
                  categories={categories}
                  byCategory={byCategory}
                  total={total}
                  categoryFilter={categoryFilter}
                  onSelect={(id) => {
                    setCategoryFilter(id);
                    setPage(1);
                  }}
                />
              </div>

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
                          <p className="truncate text-sm font-medium text-ink">{e.name}</p>
                          {e.description && <p className="mt-0.5 truncate text-xs text-muted">{e.description}</p>}
                        </div>
                        <p className="font-display shrink-0 text-sm font-medium text-ink">{formatK(e.amount)}</p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryBadgeStyle(categories, e.categoryId)}`}>
                          {categoryName(e.categoryId)}
                        </span>
                        {e.source === "payroll" && (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">Auto</span>
                        )}
                        <span className="text-xs text-muted">{formatDate(e.date)}</span>
                        {e.photoUrl && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setViewingReceipt(e.photoUrl!);
                            }}
                            className="ml-auto flex items-center gap-1 text-muted transition-colors hover:text-brand"
                            aria-label="View receipt"
                          >
                            <PaperclipIcon />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-paper text-[11px] text-muted uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium tracking-wide">Name</th>
                      <th className="px-4 py-3 font-medium tracking-wide">Category</th>
                      <th className="px-4 py-3 font-medium tracking-wide">Date</th>
                      <th className="px-4 py-3 font-medium tracking-wide">Receipt</th>
                      <th className="px-4 py-3 text-right font-medium tracking-wide">Amount</th>
                      <th className="px-4 py-3 font-medium tracking-wide"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {!isReady && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
                    {isReady &&
                      pageRows.map((e) => (
                        <tr
                          key={e.id}
                          onClick={() => {
                            setEditing(e);
                            setShowForm(true);
                          }}
                          className="cursor-pointer transition-colors duration-200 ease-in-out hover:bg-mist active:bg-mist/70"
                        >
                          <td className="px-4 py-3">
                            <p className="flex items-center gap-1.5 font-medium text-ink">
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
                          <td className="px-4 py-3">
                            {e.photoUrl ? (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setViewingReceipt(e.photoUrl!);
                                }}
                                className="flex w-fit items-center gap-1 whitespace-nowrap rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 transition-colors hover:bg-blue-100"
                              >
                                <PaperclipIcon />
                                View receipt
                              </button>
                            ) : (
                              <span className="flex w-fit items-center whitespace-nowrap rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-medium text-muted/60">
                                None
                              </span>
                            )}
                          </td>
                          <td className="font-display px-4 py-3 text-right font-medium whitespace-nowrap text-ink">{formatK(e.amount)}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setEditing(e);
                                  setShowForm(true);
                                }}
                                aria-label="Edit expense"
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
                              >
                                <PencilSimple size={14} weight="duotone" />
                              </button>
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setDeletingExpense(e);
                                }}
                                aria-label="Delete expense"
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash size={14} weight="duotone" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {isReady && pageRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10">
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
              {viewingReceipt && <Lightbox photos={[viewingReceipt]} startIndex={0} onClose={() => setViewingReceipt(null)} />}
              {deletingExpense && (
                <Modal
                  onClose={() => setDeletingExpense(null)}
                  maxWidth="max-w-sm"
                  title="Delete expense?"
                  footer={
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setDeletingExpense(null)}>
                        Cancel
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteExpense(deletingExpense.id);
                          setDeletingExpense(null);
                        }}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  }
                >
                  <p className="text-sm text-muted">
                    This will permanently remove <span className="font-medium text-ink">{deletingExpense.name}</span>. This can't be
                    undone.
                  </p>
                </Modal>
              )}

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
          </>
        ) : (
          /* True empty state — no expenses at all for this month, standalone, not nested in a table card */
          <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
            <span className="flex items-center justify-center w-md text-muted">
             
              <img src={Expensephoto}/>
            </span>
            <div>
              <p className="font-display text-xl font-bold tracking-tight text-brand">Start tracking every rental expense</p>
              <p className="mt-0.5 text-sm max-w-lg text-muted">Keep full control over your property finances by monitoring every outgoing cost across your rentals in one simple, organized view.</p>
            </div> 

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
        )}
      </div>

      <AnimatePresence>
        {showForm && <ExpenseFormDrawer editing={editing} prefill={prefill} onClose={() => setShowForm(false)} />}
        {showCategories && <ManageCategoriesModal onClose={() => setShowCategories(false)} />}
      </AnimatePresence>
    </>
  );
}
