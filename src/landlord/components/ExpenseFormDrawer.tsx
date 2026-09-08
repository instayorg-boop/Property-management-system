import { useState } from "react";
import { Paperclip as PaperclipIcon } from "@phosphor-icons/react";
import SlideOver from "./SlideOver";
import Modal from "./Modal";
import Button from "./Button";
import { useExpenses, type Expense } from "../ExpensesContext";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ConfirmDeleteExpenseModal({ expense, onClose, onConfirm }: { expense: Expense; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Delete expense?"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        This will permanently remove <span className="font-medium text-ink">{expense.name}</span>. This can't be undone.
      </p>
    </Modal>
  );
}

export default function ExpenseFormDrawer({
  editing,
  prefill,
  onClose,
}: {
  editing: Expense | null;
  /** Seeds a new expense's fields — e.g. arriving from a maintenance report's "Log a repair cost". Ignored when editing. */
  prefill?: Partial<Pick<Expense, "name" | "description" | "categoryId">>;
  onClose: () => void;
}) {
  const { categories, addExpense, updateExpense, deleteExpense, addCategory } = useExpenses();
  const activeCategories = categories.filter((c) => c.active);

  const [name, setName] = useState(editing?.name ?? prefill?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? prefill?.description ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? prefill?.categoryId ?? activeCategories[0]?.id ?? "");
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [hasPhoto, setHasPhoto] = useState(editing?.hasPhoto ?? false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const confirmNewCategory = () => {
    if (!newCategoryName.trim()) return;
    const cat = addCategory(newCategoryName.trim());
    setCategoryId(cat.id);
    setNewCategoryName("");
    setAddingCategory(false);
  };

  const submit = () => {
    if (!name.trim() || !amount || !categoryId) return;
    const payload = {
      name,
      description: description.trim() || undefined,
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
    <>
    <SlideOver
      onClose={onClose}
      title={editing ? "Edit expense" : "Add expense"}
      footer={
        <div className="flex justify-end gap-2">
          {editing && (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)} className="border-0 hover:bg-red-50">
              Delete
            </Button>
          )}
          <Button variant="primary" onClick={submit} className="px-5">
            {editing ? "Save changes" : "Add expense"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Plumber — Room 08 leak"
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
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
              <Button variant="primary" onClick={confirmNewCategory} className="px-4">
                Add
              </Button>
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
              <PaperclipIcon size={14} weight="duotone" />
              Attach receipt photo (optional)
            </button>
          )}
        </div>
      </div>
    </SlideOver>
    {confirmingDelete && editing && (
      <ConfirmDeleteExpenseModal
        expense={editing}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          deleteExpense(editing.id);
          onClose();
        }}
      />
    )}
    </>
  );
}
