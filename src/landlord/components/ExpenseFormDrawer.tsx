import { useState } from "react";
import { Paperclip as PaperclipIcon, X as XIcon } from "@phosphor-icons/react";
import Modal from "./Modal";
import Button from "./Button";
import DatePicker from "./DatePicker";
import FieldLabel, { FieldError } from "./FieldLabel";
import { useExpenses, type Expense } from "../ExpensesContext";
import { uploadPhoto } from "../../lib/storage";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ConfirmDeleteExpenseModal({
  expense,
  onClose,
  onConfirm,
}: {
  expense: Expense;
  onClose: () => void;
  onConfirm: () => void;
}) {
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
        This will permanently remove{" "}
        <span className="font-medium text-ink">{expense.name}</span>. This can't
        be undone.
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
  const { categories, addExpense, updateExpense, deleteExpense, addCategory } =
    useExpenses();
  const activeCategories = categories.filter((c) => c.active);

  const [name, setName] = useState(editing?.name ?? prefill?.name ?? "");
  const [description, setDescription] = useState(
    editing?.description ?? prefill?.description ?? "",
  );
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [categoryId, setCategoryId] = useState(
    editing?.categoryId ?? prefill?.categoryId ?? activeCategories[0]?.id ?? "",
  );
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [photoUrl, setPhotoUrl] = useState(editing?.photoUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const amountValue = parseInt(amount.replace(/[^\d]/g, ""), 10) || 0;
  const canSubmit = name.trim().length > 0 && amountValue > 0 && !!categoryId;

  const addReceipt = (file: File) => {
    setPhotoError(null);
    setUploadingPhoto(true);
    uploadPhoto("expense-photos", file)
      .then((url) => setPhotoUrl(url))
      .catch((err) => {
        console.error("Failed to upload receipt", err);
        setPhotoError(
          err instanceof Error
            ? err.message
            : "Couldn't upload that receipt — please try again.",
        );
      })
      .finally(() => setUploadingPhoto(false));
  };

  const confirmNewCategory = () => {
    if (!newCategoryName.trim()) return;
    const cat = addCategory(newCategoryName.trim());
    setCategoryId(cat.id);
    setNewCategoryName("");
    setAddingCategory(false);
  };

  const submit = () => {
    if (!canSubmit) {
      setSubmitAttempted(true);
      return;
    }
    const payload = {
      name,
      description: description.trim() || undefined,
      categoryId,
      amount: amountValue,
      date,
      hasPhoto: !!photoUrl,
      photoUrl,
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
      <Modal
        onClose={onClose}
        title={editing ? "Edit expense" : "Add expense"}
        footer={
          <div className="flex justify-end gap-2">
            {editing && (
              <Button
                variant="danger"
                onClick={() => setConfirmingDelete(true)}
                className="border-0 hover:bg-red-50"
              >
                Delete
              </Button>
            )}
            <Button
              variant="primary"
              onClick={submit}
              disabled={uploadingPhoto}
              className="px-5"
            >
              {editing ? "Save changes" : "Add expense"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {submitAttempted && !canSubmit && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              A few required fields still need attention — they're marked below.
            </div>
          )}

          <div>
            <FieldLabel required>Name</FieldLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Plumber — Room 08 leak"
              className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-brand ${
                submitAttempted && !name.trim()
                  ? "border-red-400"
                  : "border-line"
              }`}
            />
            {submitAttempted && !name.trim() && (
              <FieldError>Name is required.</FieldError>
            )}
          </div>

          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </div>

          <div>
            <FieldLabel required>Amount (K)</FieldLabel>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-brand ${
                submitAttempted && amountValue <= 0
                  ? "border-red-400"
                  : "border-line"
              }`}
            />
            {submitAttempted && amountValue <= 0 && (
              <FieldError>Enter an amount greater than zero.</FieldError>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <FieldLabel required className="mb-0">
                Category
              </FieldLabel>
              <button
                type="button"
                onClick={() => setAddingCategory((v) => !v)}
                className="text-xs font-medium text-brand transition active:scale-95 hover:text-ink"
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
                <Button
                  variant="primary"
                  onClick={confirmNewCategory}
                  className="px-4"
                >
                  Add
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition active:scale-[0.97] ${
                      categoryId === c.id
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-line text-muted hover:bg-mist"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Receipt</FieldLabel>
            {photoUrl ? (
              <div className="space-y-2">
                <div className="relative h-40 overflow-hidden rounded-lg border border-line bg-mist">
                  <img
                    src={photoUrl}
                    alt="Receipt"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl(undefined)}
                    aria-label="Remove receipt"
                    className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-paper transition-opacity hover:bg-ink"
                  >
                    <XIcon size={12} weight="bold" />
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line py-2.5 text-sm font-medium text-muted transition active:scale-[0.98] hover:bg-mist">
                <PaperclipIcon size={14} weight="duotone" />
                {uploadingPhoto
                  ? "Uploading…"
                  : "Attach receipt photo (optional)"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingPhoto}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) addReceipt(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {photoError && (
              <p className="mt-1.5 text-xs text-red-500">{photoError}</p>
            )}
          </div>

          <div>
            <FieldLabel required>Date</FieldLabel>
            <DatePicker value={date} onChange={setDate} />
          </div>
        </div>
      </Modal>
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
