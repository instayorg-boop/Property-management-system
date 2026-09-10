import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  DeviceMobile,
  Money,
  Bank,
  CaretDown,
  DoorOpen,
  CalendarBlank,
  X,
  Plus,
  Minus,
  Paperclip,
  FileText,
  Trash,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import AddRoomTypeDrawer from "../components/AddRoomTypeDrawer";
import Button from "../components/Button";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";
import FieldLabel, { FieldError } from "../components/FieldLabel";
import PhoneNumberInput, {
  validatePhone,
} from "../components/PhoneNumberInput";
import {
  useTenants,
  formatCurrency,
  RELATION_OPTIONS,
  type DepositMethod,
  type EmergencyContact,
  type RelationType,
} from "../TenantsContext";
import {
  useRooms,
  useVacantRoomsForAssignment,
  type VacantRoom,
} from "../RoomsContext";
import { useSettings } from "../SettingsContext";
import {
  uploadTenantDocument,
  listTenantDocuments,
  deleteTenantDocument,
  type TenantDocument,
} from "../../lib/tenantDocuments";

/** A working copy of an emergency contact while the form is open — `relationOther` is always a
 * string here (never undefined) so the "Other" text input can stay a controlled input. */
type ContactDraft = {
  id: string;
  name: string;
  relation: RelationType;
  relationOther: string;
  phones: string[];
};

function newContactId() {
  return `ec${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

function newContactDraft(): ContactDraft {
  return {
    id: newContactId(),
    name: "",
    relation: "Guardian",
    relationOther: "",
    phones: [""],
  };
}

function toContactDrafts(contacts: EmergencyContact[]): ContactDraft[] {
  return contacts.length
    ? contacts.map((c) => ({
        ...c,
        relationOther: c.relationOther ?? "",
        phones: c.phones.length ? c.phones : [""],
      }))
    : [newContactDraft()];
}

function cleanContacts(drafts: ContactDraft[]): EmergencyContact[] {
  return drafts
    .map((c) => ({
      id: c.id,
      name: c.name.trim(),
      relation: c.relation,
      relationOther:
        c.relation === "Other" ? c.relationOther.trim() : undefined,
      phones: c.phones.map((p) => p.trim()).filter(Boolean),
    }))
    .filter((c) => c.name || c.phones.length > 0);
}

// --- Shared visual primitives, matching the rest of the dashboard's corporate/enterprise
// system (rounded-lg bordered inputs, brand-blue focus rings and selected states, thin gray
// section dividers) rather than a softer/rounder alternate style. -------------------------------

/** Title-case, semibold, near-black — not the shared SectionLabel's uppercase brand-colored
 * treatment, which reads louder than this page's own section headers should. */
function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
    </div>
  );
}

/** Thin gray rule between major sections. */
function Divider() {
  return <hr className="my-8 border-t border-line" />;
}

const inputCls =
  "w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink placeholder-muted/70 outline-none focus:border-brand focus:ring-1 focus:ring-brand";

/** A radio-style choice card — full-width clickable block with the option's title/description on
 * the left and an explicit radio circle on the right (filled brand-blue when selected, empty gray
 * ring otherwise), matching the rest of the app's blue-accented selected states. */
function ChoiceCard({
  selected,
  disabled,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-start justify-between gap-3 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-2 border-brand bg-paper"
          : "border-line bg-paper hover:border-muted"
      }`}
    >
      <div>
        <p
          className={`text-sm font-semibold ${selected ? "text-brand" : "text-ink"}`}
        >
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          selected
            ? "border-4 border-brand bg-paper"
            : "border border-line bg-paper"
        }`}
      />
    </button>
  );
}

/** A small, size-to-content pill — gray at rest, brand-blue filled once selected — for a choice
 * that doesn't need a full-width button (Yes/No, a payment method). Sits inline in a wrapped row
 * instead of stretching to fill a grid column. */
function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        selected
          ? "bg-brand text-white"
          : "bg-mist text-muted hover:bg-line hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function YesNo({
  value,
  onChange,
}: {
  value: "yes" | "no" | null;
  onChange: (v: "yes" | "no") => void;
}) {
  return (
    <div className="flex gap-2">
      {(["yes", "no"] as const).map((v) => (
        <Chip key={v} selected={value === v} onClick={() => onChange(v)}>
          {v === "yes" ? "Yes" : "No"}
        </Chip>
      ))}
    </div>
  );
}

function PhoneListEditor({
  phones,
  onChange,
  showErrors,
}: {
  phones: string[];
  onChange: (phones: string[]) => void;
  /** Only surface per-row format errors once the form's actually been submitted — not while a
   * number is simply mid-typing. */
  showErrors?: boolean;
}) {
  return (
    <div className="space-y-2">
      {phones.map((p, i) => {
        const error = showErrors ? validatePhone(p) : null;
        return (
          <div key={i}>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <PhoneNumberInput
                  value={p}
                  onChange={(next) => {
                    const nextPhones = [...phones];
                    nextPhones[i] = next;
                    onChange(nextPhones);
                  }}
                  error={error}
                />
              </div>
              {phones.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(phones.filter((_, idx) => idx !== i))}
                  aria-label="Remove number"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-red-600"
                >
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>
            {error && <FieldError>{error}</FieldError>}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...phones, ""])}
        className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <Plus size={14} weight="bold" />
        Add another number
      </button>
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Parses a `<input type="date">` value ("YYYY-MM-DD") as a local calendar date — `new Date(string)`
 * parses that format as UTC midnight, which can land on the wrong day in negative-UTC timezones. */
function parseDateInputLocal(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Tenant.depositDate/moveInDate are stored as a formatted display string (e.g. "12 Jan 2025"),
 * not ISO — DatePicker needs ISO, so this converts back, falling back to today if unparseable. */
function toIsoSafe(display: string | undefined): string {
  if (!display) return todayISO();
  const parsed = new Date(display);
  return Number.isNaN(parsed.getTime())
    ? todayISO()
    : parsed.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** Pro-rata for a mid-cycle move-in: the agreed rent split across however many days are actually in
 * that calendar month, charged only for the days from move-in through month end (inclusive). */
function computeProrata(rentAmount: number, moveIn: Date) {
  const totalDays = daysInMonth(moveIn.getFullYear(), moveIn.getMonth());
  const dailyRate = rentAmount / totalDays;
  const remainingDays = totalDays - moveIn.getDate() + 1;
  return {
    totalDays,
    dailyRate,
    remainingDays,
    amount: dailyRate * remainingDays,
  };
}

const depositMethods: {
  id: DepositMethod;
  label: string;
  Icon: typeof Money;
}[] = [
  { id: "mobile", label: "Mobile money", Icon: DeviceMobile },
  { id: "cash", label: "Cash", Icon: Money },
  { id: "bank", label: "Bank transfer", Icon: Bank },
];

/** Searchable room picker — vacant rooms, plus (when editing) the tenant's own current room, since
 * that one isn't "vacant" but still has to be pickable/shown as the existing assignment. */
function RoomPicker({
  rooms,
  selected,
  onSelect,
}: {
  rooms: VacantRoom[];
  selected: VacantRoom | null;
  onSelect: (r: VacantRoom) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<number | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.room.toLowerCase().includes(q) ||
        r.roomType.toLowerCase().includes(q),
    );
  }, [rooms, query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between text-left ${inputCls}`}
      >
        <span className={selected ? "text-ink" : "text-muted"}>
          {selected
            ? `${selected.room} · ${selected.roomType} · K${selected.rent.toLocaleString()}`
            : "Select a room with a bed free"}
        </span>
        <CaretDown size={14} weight="bold" className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-paper shadow-card">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                blurTimeout.current = window.setTimeout(
                  () => setOpen(false),
                  120,
                );
              }}
              onFocus={() => {
                if (blurTimeout.current)
                  window.clearTimeout(blurTimeout.current);
              }}
              placeholder="Search room number or type"
              className="w-full rounded-md bg-mist px-2.5 py-1.5 text-sm outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.room}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(r);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-mist"
              >
                <span className="text-ink">
                  {r.room} · {r.roomType}
                  {r.openBeds > 1 && (
                    <span className="ml-1.5 text-xs text-muted">
                      ({r.openBeds} beds free)
                    </span>
                  )}
                </span>
                <span className="text-muted">K{r.rent.toLocaleString()}</span>
              </button>
            ))}
            {results.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted">
                No rooms with a free bed match.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A −/value/+ counter bound in a single outlined container, minus on the left, plus on the
 * right, the value centered between them. */
function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 31,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line px-2 py-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
      >
        <Minus size={12} weight="bold" />
      </button>
      <div className="flex-1 text-center">
        <p className="text-sm font-semibold text-ink">{value}</p>
        <p className="text-[10px] text-muted">{suffix}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
      >
        <Plus size={12} weight="bold" />
      </button>
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Picks files to attach — tenancy agreement, national ID, acceptance letter, anything relevant.
 * In "add" mode there's no tenant id to upload against yet, so files just sit here as plain File
 * objects and are uploaded once the tenant exists (see finalizeAndSave). In "edit" mode the tenant
 * id already exists, so onPickImmediate uploads straight away instead of staging. */
function DocumentPicker({
  staged,
  onStagedChange,
  onPickImmediate,
  uploading,
  existing,
  onDeleteExisting,
  existingLoading,
}: {
  staged: File[];
  onStagedChange: (files: File[]) => void;
  onPickImmediate?: (files: FileList) => void;
  uploading?: boolean;
  existing?: TenantDocument[];
  onDeleteExisting?: (doc: TenantDocument) => void;
  existingLoading?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (onPickImmediate) {
            if (e.target.files && e.target.files.length > 0)
              onPickImmediate(e.target.files);
          } else {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) onStagedChange([...staged, ...picked]);
          }
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-dashed border-line px-4 py-3 text-sm font-medium text-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Paperclip size={16} weight="bold" />
        {uploading ? "Uploading…" : "Attach a document"}
      </button>

      {existingLoading && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-mist" />
          ))}
        </div>
      )}

      {existing && existing.length > 0 && (
        <ul className="mt-3 space-y-2">
          {existing.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
            >
              <a
                href={doc.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-sm text-ink hover:underline"
              >
                <FileText
                  size={16}
                  weight="duotone"
                  className="shrink-0 text-muted"
                />
                <span className="truncate">{doc.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {formatBytes(doc.sizeBytes)}
                </span>
              </a>
              {onDeleteExisting && (
                <button
                  type="button"
                  onClick={() => onDeleteExisting(doc)}
                  aria-label={`Delete ${doc.name}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-red-600"
                >
                  <Trash size={14} weight="bold" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {staged.length > 0 && (
        <ul className="mt-3 space-y-2">
          {staged.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText
                  size={16}
                  weight="duotone"
                  className="shrink-0 text-muted"
                />
                <span className="truncate text-sm text-ink">{file.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {formatBytes(file.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onStagedChange(staged.filter((_, idx) => idx !== i))
                }
                aria-label={`Remove ${file.name}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-red-600"
              >
                <Trash size={14} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PREFIX_OPTIONS = ["—", "Mr", "Mrs", "Ms"];

/** Splits a stored "Mr Chanda Mwansa" full name back into prefix/first/last for editing — best
 * effort, since the split isn't reversible for every name (e.g. multi-word first names). */
function splitName(fullName: string): {
  prefix: string;
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/);
  let prefix = PREFIX_OPTIONS[0];
  if (parts.length > 1 && PREFIX_OPTIONS.includes(parts[0])) {
    prefix = parts.shift()!;
  }
  return {
    prefix,
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

// --- Draft autosave (add mode only) ---------------------------------------------------------
// Everything typed into a new-tenant form except attached documents (File objects can't go into
// localStorage) and the selected room (re-matched against the live vacant-room list on restore,
// since it could have been taken by someone else in the meantime) is saved as the landlord types,
// so navigating away mid-form and coming back — or a crashed tab — doesn't lose the work. Doesn't
// apply when editing an existing tenant — there's nothing to "recover", the record already exists.

const DRAFT_KEY = "instay:addTenantDraft";

type AddTenantDraft = {
  prefix: string;
  firstName: string;
  lastName: string;
  phones: string[];
  contacts: ContactDraft[];
  notes: string;
  moveInDate: string;
  selectedRoomNumber: string | null;
  tenantDueDay: number;
  tenantGracePeriodDays: number;
  wantsDeposit: "yes" | "no";
  depositAmount: number;
  depositCollectedToday: "yes" | "no" | null;
  depositCollectMethod: "mobile" | "cash";
  prorataChoice: "charge" | "waive";
  prorataCollectedToday: "yes" | "no" | null;
  rentCollectedToday: "yes" | "no" | null;
  rentAmountCollected: number;
  rentCollectMethod: "mobile" | "cash";
};

function readDraft(): AddTenantDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as AddTenantDraft) : null;
  } catch {
    return null;
  }
}

function draftHasContent(d: AddTenantDraft): boolean {
  return !!(
    d.firstName.trim() ||
    d.lastName.trim() ||
    d.phones.some((p) => p.trim()) ||
    d.notes.trim() ||
    d.selectedRoomNumber
  );
}

/** Add/edit tenant — one page, one continuous scroll (Personal → Property → Deposit → Lease terms
 * → Documents), used for both creating a new tenant (/tenants/new) and correcting an existing
 * one's details (/tenants/:id/edit) — same fields, same layout, prefilled and calling updateTenant
 * instead of addTenant when a tenant id is present in the route. The two payment-collection
 * questions ("was X collected today") are create-only — they log a real ledger entry, and firing
 * that again every time someone edits a typo would double-count real money, so those two blocks
 * are hidden (not just disabled) while editing. Everything else is identical. */
export default function AddTenant() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const {
    tenants,
    isReady: tenantsReady,
    addTenant,
    updateTenant,
    logPayment,
  } = useTenants();
  const editingTenant = isEditing
    ? (tenants.find((t) => t.id === id) ?? null)
    : null;

  const { propertyId, propertyName, billingPeriod, dueDay, gracePeriodDays } =
    useSettings();
  const { roomTypeConfigs, addRoomType } = useRooms();
  const vacantRoomsRaw = useVacantRoomsForAssignment();
  const [addingRoomType, setAddingRoomType] = useState(false);

  // The tenant's own current room isn't in the vacant list (they're occupying it) — add it back
  // in for editing so it still shows up as the selected/pickable option.
  const vacantRooms = useMemo(() => {
    if (!editingTenant || !editingTenant.room) return vacantRoomsRaw;
    if (vacantRoomsRaw.some((r) => r.room === editingTenant.room))
      return vacantRoomsRaw;
    const ownRoom: VacantRoom = {
      room: editingTenant.room,
      roomType: editingTenant.roomType,
      rent: editingTenant.rentAmount,
      depositAmount: editingTenant.depositAmount,
      depositRefundability: "Refundable",
      openBeds: 1,
    };
    return [ownRoom, ...vacantRoomsRaw];
  }, [vacantRoomsRaw, editingTenant]);

  const initialName = editingTenant
    ? splitName(editingTenant.name)
    : { prefix: PREFIX_OPTIONS[0], firstName: "", lastName: "" };
  const [prefix, setPrefix] = useState(initialName.prefix);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [phones, setPhones] = useState<string[]>(
    editingTenant?.phones.length ? editingTenant.phones : [""],
  );
  const [contacts, setContacts] = useState<ContactDraft[]>(
    toContactDrafts(editingTenant?.emergencyContacts ?? []),
  );
  const [notes, setNotes] = useState(editingTenant?.notes ?? "");
  const [documents, setDocuments] = useState<File[]>([]);
  const [draftRestored, setDraftRestored] = useState(false);
  // True once the landlord has tried to submit at least once — field errors only show up after
  // that, not while a required field is simply still empty on first render.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const restoringDraft = useRef(true);

  const [selectedRoom, setSelectedRoom] = useState<VacantRoom | null>(
    editingTenant
      ? (vacantRooms.find((r) => r.room === editingTenant.room) ?? null)
      : null,
  );
  const [moveInDate, setMoveInDate] = useState(todayISO());

  const [tenantDueDay, setTenantDueDay] = useState(
    editingTenant?.dueDay ?? dueDay,
  );
  const [tenantGracePeriodDays, setTenantGracePeriodDays] = useState(
    editingTenant?.gracePeriodDays ?? gracePeriodDays,
  );

  const [wantsDeposit, setWantsDeposit] = useState<"yes" | "no">(
    editingTenant && editingTenant.depositAmount > 0 ? "yes" : "no",
  );
  const [depositAmount, setDepositAmount] = useState(
    editingTenant?.depositAmount ?? 0,
  );
  const [depositDate, setDepositDate] = useState(
    toIsoSafe(editingTenant?.depositDate),
  );
  const [depositCollectedToday, setDepositCollectedToday] = useState<
    "yes" | "no" | null
  >(null);
  const [depositCollectMethod, setDepositCollectMethod] =
    useState<DepositMethod>(editingTenant?.depositMethod ?? "mobile");

  const [prorataChoice, setProrataChoice] = useState<"charge" | "waive">(
    "charge",
  );
  const [prorataCollectedToday, setProrataCollectedToday] = useState<
    "yes" | "no" | null
  >(null);
  const [rentCollectedToday, setRentCollectedToday] = useState<
    "yes" | "no" | null
  >(null);
  const [rentAmountCollected, setRentAmountCollected] = useState(0);
  const [rentCollectMethod, setRentCollectMethod] = useState<"mobile" | "cash">(
    "mobile",
  );

  // Existing documents — only relevant/fetched in edit mode, where the tenant id already exists.
  const [existingDocs, setExistingDocs] = useState<TenantDocument[]>([]);
  const [existingDocsLoading, setExistingDocsLoading] = useState(isEditing);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  const refreshExistingDocs = () => {
    if (!editingTenant) return;
    setExistingDocsLoading(true);
    listTenantDocuments(editingTenant.id)
      .then(setExistingDocs)
      .catch((e) => console.error("Failed to load documents", e))
      .finally(() => setExistingDocsLoading(false));
  };

  useEffect(() => {
    refreshExistingDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTenant?.id]);

  const uploadImmediately = async (files: FileList) => {
    if (!editingTenant || !propertyId) return;
    setUploadingDocs(true);
    try {
      await Promise.all(
        Array.from(files).map((file) =>
          uploadTenantDocument(propertyId, editingTenant.id, file),
        ),
      );
      refreshExistingDocs();
    } catch (e) {
      window.alert(
        e instanceof Error
          ? e.message
          : "Failed to upload one or more documents.",
      );
    } finally {
      setUploadingDocs(false);
    }
  };

  const deleteExisting = async (doc: TenantDocument) => {
    try {
      await deleteTenantDocument(doc);
      setExistingDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Failed to delete document.",
      );
    }
  };

  const moveInDateObj = useMemo(
    () => parseDateInputLocal(moveInDate),
    [moveInDate],
  );
  const isMidCycle = moveInDateObj.getDate() !== 1;
  const prorata = useMemo(
    () =>
      selectedRoom ? computeProrata(selectedRoom.rent, moveInDateObj) : null,
    [selectedRoom, moveInDateObj],
  );

  const selectRoom = (r: VacantRoom) => {
    setSelectedRoom(r);
    if (!isEditing) {
      setDepositAmount(r.depositAmount);
      setRentAmountCollected(r.rent);
      if (r.depositAmount > 0) setWantsDeposit("yes");
    }
  };

  const updateContact = (index: number, patch: Partial<ContactDraft>) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };
  const removeContact = (index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftRestored(false);
    setDraftSavedAt(null);
  };

  const discardDraft = () => {
    clearDraft();
    setPrefix(PREFIX_OPTIONS[0]);
    setFirstName("");
    setLastName("");
    setPhones([""]);
    setContacts([newContactDraft()]);
    setNotes("");
    setDocuments([]);
    setSelectedRoom(null);
    setMoveInDate(todayISO());
    setTenantDueDay(dueDay);
    setTenantGracePeriodDays(gracePeriodDays);
    setWantsDeposit("no");
    setDepositAmount(0);
    setDepositCollectedToday(null);
    setDepositCollectMethod("mobile");
    setProrataChoice("charge");
    setProrataCollectedToday(null);
    setRentCollectedToday(null);
    setRentAmountCollected(0);
    setRentCollectMethod("mobile");
  };

  // Restore once, on first mount, add mode only.
  useEffect(() => {
    if (isEditing || !restoringDraft.current || vacantRooms.length === 0)
      return;
    restoringDraft.current = false;
    const draft = readDraft();
    if (!draft || !draftHasContent(draft)) return;

    setPrefix(draft.prefix);
    setFirstName(draft.firstName);
    setLastName(draft.lastName);
    setPhones(draft.phones);
    setContacts(draft.contacts);
    setNotes(draft.notes);
    setMoveInDate(draft.moveInDate);
    setTenantDueDay(draft.tenantDueDay);
    setTenantGracePeriodDays(draft.tenantGracePeriodDays);
    setWantsDeposit(draft.wantsDeposit);
    setDepositAmount(draft.depositAmount);
    setDepositCollectedToday(draft.depositCollectedToday);
    setDepositCollectMethod(draft.depositCollectMethod);
    setProrataChoice(draft.prorataChoice);
    setProrataCollectedToday(draft.prorataCollectedToday);
    setRentCollectedToday(draft.rentCollectedToday);
    setRentAmountCollected(draft.rentAmountCollected);
    setRentCollectMethod(draft.rentCollectMethod);

    const room = draft.selectedRoomNumber
      ? vacantRooms.find((r) => r.room === draft.selectedRoomNumber)
      : undefined;
    if (room) setSelectedRoom(room);

    setDraftRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacantRooms, isEditing]);

  // Autosave, add mode only.
  useEffect(() => {
    if (isEditing || restoringDraft.current) return;
    const draft: AddTenantDraft = {
      prefix,
      firstName,
      lastName,
      phones,
      contacts,
      notes,
      moveInDate,
      selectedRoomNumber: selectedRoom?.room ?? null,
      tenantDueDay,
      tenantGracePeriodDays,
      wantsDeposit,
      depositAmount,
      depositCollectedToday,
      depositCollectMethod:
        depositCollectMethod === "bank" ? "mobile" : depositCollectMethod,
      prorataChoice,
      prorataCollectedToday,
      rentCollectedToday,
      rentAmountCollected,
      rentCollectMethod,
    };
    if (!draftHasContent(draft)) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setDraftSavedAt(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditing,
    prefix,
    firstName,
    lastName,
    phones,
    contacts,
    notes,
    moveInDate,
    selectedRoom,
    tenantDueDay,
    tenantGracePeriodDays,
    wantsDeposit,
    depositAmount,
    depositCollectedToday,
    depositCollectMethod,
    prorataChoice,
    prorataCollectedToday,
    rentCollectedToday,
    rentAmountCollected,
    rentCollectMethod,
  ]);

  const name = [
    prefix !== PREFIX_OPTIONS[0] ? prefix : null,
    firstName.trim(),
    lastName.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  // The room type's own daily rate — this is what the late penalty actually charges per day once
  // this tenant's grace period lapses (see invoiceUtils' calcPenalty), not a flat rate landlord-wide.
  const roomDailyRate = selectedRoom
    ? selectedRoom.rent /
      daysInMonth(new Date().getFullYear(), new Date().getMonth())
    : null;

  const hasValidPhone = phones.some(
    (p) => p.trim().length > 0 && !validatePhone(p),
  );
  const phonesAllValid = phones.every((p) => !validatePhone(p));
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    !!selectedRoom &&
    hasValidPhone &&
    phonesAllValid;

  const finalizeAndSave = () => {
    if (!canSubmit || !selectedRoom) {
      setSubmitAttempted(true);
      return;
    }

    if (isEditing && editingTenant) {
      updateTenant(editingTenant.id, {
        name,
        phones: phones.map((p) => p.trim()).filter(Boolean),
        emergencyContacts: cleanContacts(contacts),
        room: selectedRoom.room,
        roomType: selectedRoom.roomType,
        rentAmount: selectedRoom.rent,
        depositAmount: wantsDeposit === "yes" ? depositAmount : 0,
        depositDate: new Date(depositDate).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        depositMethod: depositCollectMethod,
        notes,
        dueDay: tenantDueDay !== dueDay ? tenantDueDay : null,
        gracePeriodDays:
          tenantGracePeriodDays !== gracePeriodDays
            ? tenantGracePeriodDays
            : null,
      });
      navigate(`/tenants/${editingTenant.id}`);
      return;
    }

    const rentDue = isMidCycle
      ? prorataChoice === "charge"
        ? Math.round(prorata!.amount)
        : 0
      : selectedRoom.rent;
    const rentPaidNow = isMidCycle
      ? prorataChoice === "charge" && prorataCollectedToday === "yes"
      : rentCollectedToday === "yes";
    const rentAmountToLog = isMidCycle
      ? Math.round(prorata!.amount)
      : Math.round(rentAmountCollected);
    const rentLedgerLabel = isMidCycle
      ? `${moveInDateObj.toLocaleDateString("en-US", { month: "long" })} pro-rata`
      : `${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} rent`;

    const depositWasCollected =
      wantsDeposit === "yes" &&
      depositCollectedToday === "yes" &&
      depositAmount > 0;

    const created = addTenant({
      name,
      phones: phones.map((p) => p.trim()).filter(Boolean),
      emergencyContacts: cleanContacts(contacts),
      property: propertyName,
      room: selectedRoom.room,
      roomType: selectedRoom.roomType,
      moveInDate: moveInDateObj.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      rentAmount: selectedRoom.rent,
      status: "unpaid",
      owedAmount: rentDue,
      depositAmount: wantsDeposit === "yes" ? depositAmount : 0,
      depositDate: new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      depositMethod: depositCollectMethod,
      depositStatus: depositWasCollected ? "Held" : "Not collected",
      notes,
      dueDay: tenantDueDay !== dueDay ? tenantDueDay : null,
      gracePeriodDays:
        tenantGracePeriodDays !== gracePeriodDays
          ? tenantGracePeriodDays
          : null,
      onTimeCount: 0,
      totalMonthsCount: 0,
      active: true,
      ledger: [],
    });

    if (depositWasCollected) {
      updateTenant(created.id, {
        ledger: [
          {
            id: crypto.randomUUID(),
            label: "Security deposit",
            amount: depositAmount,
            status: "paid",
            createdAt: new Date().toISOString(),
            source: "manual",
          },
          ...created.ledger,
        ],
      });
    }

    if (rentPaidNow && rentAmountToLog > 0) {
      logPayment(created.id, rentAmountToLog, rentLedgerLabel);
    }

    if (documents.length > 0 && propertyId) {
      const pid = propertyId;
      void Promise.all(
        documents.map((file) => uploadTenantDocument(pid, created.id, file)),
      ).catch((e) => {
        console.error("Failed to upload one or more documents", e);
        window.alert(
          `${name || "This tenant"} was saved, but one or more attached documents failed to upload. You can try attaching them again from the tenant's profile.`,
        );
      });
    }

    clearDraft();
    navigate(`/tenants/${created.id}`);
  };

  // A single continuous scroll with no discrete steps has no natural sense of "how much is
  // left" — this tracks scroll position on the dashboard shell's own scroll container (this
  // page has no scroll container of its own) and renders as a thin fill bar up top, so the form
  // doesn't read as potentially endless.
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    const scrollEl = document.querySelector("main");
    if (!scrollEl) return;
    const onScroll = () => {
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      setScrollProgress(max > 0 ? Math.min(1, scrollEl.scrollTop / max) : 1);
    };
    onScroll();
    scrollEl.addEventListener("scroll", onScroll);
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, []);

  if (isEditing && !tenantsReady) return null;

  if (isEditing && !editingTenant) {
    return (
      <>
        <PageHeader title="Tenant not found" />
        <div className="px-4 sm:px-8">
          <p className="text-sm text-muted">
            They may have been deleted, or the link is out of date.
          </p>
          <Link
            to="/tenants"
            className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
          >
            Back to tenants
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 h-1 bg-line/60 lg:left-64">
        <div
          className="h-full bg-brand transition-[width] duration-150 ease-out"
          style={{ width: `${Math.round(scrollProgress * 100)}%` }}
        />
      </div>

      <PageHeader
        align="center"
        title={isEditing ? "Edit tenant" : "Add tenant"}
        description={
          isEditing
            ? `${editingTenant!.name} · ${editingTenant!.room || "Unassigned"}`
            : "Completed at the property office in under 4 minutes."
        }
      />

      {/* pb-24 clears the fixed footer below. */}
      <div className="mx-auto max-w-2xl px-4 pb-24 sm:px-8">
        {submitAttempted && !canSubmit && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
            A few required fields still need attention — they're marked below.
          </div>
        )}
        {!isEditing && (draftRestored || draftSavedAt) && (
          <div className="mb-6 flex items-center justify-between rounded-lg bg-mist px-4 py-2.5 text-xs text-muted">
            <span>
              {draftRestored
                ? "Picked up where you left off — this draft was saved automatically."
                : "Saving as you type."}
            </span>
            <button
              type="button"
              onClick={discardDraft}
              className="font-medium text-brand hover:underline"
            >
              Discard draft
            </button>
          </div>
        )}

        {/* Personal */}
        <section>
          <SectionTitle
            title="Personal information"
            subtitle="The tenant's legal name as it appears on their ID/Passport."
          />
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-[100px_1fr_1fr] gap-3">
              <div>
                <FieldLabel>Prefix</FieldLabel>
                <Select
                  value={prefix}
                  onChange={setPrefix}
                  options={PREFIX_OPTIONS.map((p) => ({ value: p, label: p }))}
                  className="w-full"
                />
              </div>
              <div>
                <FieldLabel required>First name</FieldLabel>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Chanda"
                  className={`${inputCls} ${submitAttempted && !firstName.trim() ? "border-red-400" : ""}`}
                />
                {submitAttempted && !firstName.trim() && (
                  <FieldError>First name is required.</FieldError>
                )}
              </div>
              <div>
                <FieldLabel required>Last name</FieldLabel>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Mwansa"
                  className={`${inputCls} ${submitAttempted && !lastName.trim() ? "border-red-400" : ""}`}
                />
                {submitAttempted && !lastName.trim() && (
                  <FieldError>Last name is required.</FieldError>
                )}
              </div>
            </div>
            <div>
              <FieldLabel required>Phone number(s)</FieldLabel>
              <PhoneListEditor
                phones={phones}
                onChange={setPhones}
                showErrors={submitAttempted}
              />
              {submitAttempted && !hasValidPhone && (
                <FieldError>
                  At least one valid phone number is required.
                </FieldError>
              )}
            </div>
          </div>
        </section>

        <Divider />

        <section>
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">
              Emergency contact information
            </h3>
            <span className="text-xs text-muted">— optional</span>
          </div>
          {contacts.length === 0 ? (
            <button
              type="button"
              onClick={() => setContacts([newContactDraft()])}
              className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <Plus size={14} weight="bold" />
              Add emergency contact
            </button>
          ) : (
            <>
              <div className="divide-y divide-line">
                {contacts.map((contact, i) => (
                  <div
                    key={contact.id}
                    className={`space-y-3 py-4 ${i === 0 ? "pt-0" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted">
                        {i === 0 ? "Primary contact" : `Contact ${i + 1}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeContact(i)}
                        aria-label="Remove contact"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-red-600"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Name</FieldLabel>
                        <input
                          value={contact.name}
                          onChange={(e) =>
                            updateContact(i, { name: e.target.value })
                          }
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <FieldLabel>Relation to tenant</FieldLabel>
                        <Select
                          value={contact.relation}
                          onChange={(v) =>
                            updateContact(i, { relation: v as RelationType })
                          }
                          options={RELATION_OPTIONS.map((r) => ({
                            value: r,
                            label: r,
                          }))}
                          className="w-full"
                        />
                        <AnimatePresence initial={false}>
                          {contact.relation === "Other" && (
                            <motion.div
                              key="other-relation"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{
                                duration: 0.18,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              className="overflow-hidden"
                            >
                              <input
                                value={contact.relationOther}
                                onChange={(e) =>
                                  updateContact(i, {
                                    relationOther: e.target.value,
                                  })
                                }
                                placeholder="Specify relation"
                                className={`mt-2 ${inputCls}`}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Phone number(s)</FieldLabel>
                      <PhoneListEditor
                        phones={contact.phones}
                        onChange={(next) => updateContact(i, { phones: next })}
                        showErrors={submitAttempted}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setContacts((prev) => [...prev, newContactDraft()])
                }
                className="mt-3 flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                <Plus size={14} weight="bold" />
                Add another emergency contact
              </button>
            </>
          )}
        </section>

        <Divider />

        {/* Property */}
        <section>
          <SectionTitle
            title="Property placement"
            subtitle={
              isEditing
                ? "Which room is this tenant assigned to?"
                : `Which room will ${name.trim() || "this tenant"} occupy, and from when?`
            }
          />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!isEditing && (
              <div>
                <FieldLabel required>Move-in date</FieldLabel>
                <DatePicker value={moveInDate} onChange={setMoveInDate} />
              </div>
            )}
            <div className={isEditing ? "sm:col-span-2" : ""}>
              <FieldLabel required>Room</FieldLabel>
              {roomTypeConfigs.length === 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                      <DoorOpen size={16} weight="duotone" />
                    </span>
                    <p className="text-xs text-muted">No room types set up.</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAddingRoomType(true)}
                    className="shrink-0"
                  >
                    Add room type
                  </Button>
                </div>
              ) : (
                <RoomPicker
                  rooms={vacantRooms}
                  selected={selectedRoom}
                  onSelect={selectRoom}
                />
              )}
              {submitAttempted && !selectedRoom && (
                <FieldError>A room is required.</FieldError>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg bg-mist px-3.5 py-3">
            <span className="text-sm text-muted">
              Agreed rent, set by the room selected above
            </span>
            <span className="text-sm font-semibold text-ink">
              {selectedRoom ? `${formatCurrency(selectedRoom.rent)}/mo` : "—"}
            </span>
          </div>
        </section>

        <Divider />

        {/* Deposit */}
        <section>
          <SectionTitle
            title="Security deposit"
            subtitle={
              selectedRoom
                ? `Does this tenant need to pay ${selectedRoom.roomType}'s security deposit upfront?`
                : "Does this tenant need to pay a security deposit upfront? Select a room above first — the amount is set by that room type."
            }
          />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChoiceCard
              selected={wantsDeposit === "no"}
              onClick={() => setWantsDeposit("no")}
              title="Proceed without deposit"
              description="No deposit — proceed directly with the lease."
            />
            <ChoiceCard
              selected={wantsDeposit === "yes"}
              disabled={!selectedRoom}
              onClick={() => setWantsDeposit("yes")}
              title="Charge security deposit"
              description="Collected as a separate upfront payment."
            />
          </div>

          {wantsDeposit === "yes" && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel required>Security deposit amount (K)</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    value={depositAmount}
                    onChange={(e) =>
                      setDepositAmount(Number(e.target.value) || 0)
                    }
                    className={inputCls}
                  />
                  {!isEditing && (
                    <p className="mt-1.5 text-xs text-muted">
                      Defaults to {selectedRoom?.roomType}'s configured deposit
                      — edit if this tenant's terms differ.
                    </p>
                  )}
                </div>
                {isEditing && (
                  <div>
                    <FieldLabel required>Security deposit date</FieldLabel>
                    <DatePicker value={depositDate} onChange={setDepositDate} />
                  </div>
                )}
              </div>

              {isEditing ? (
                <div>
                  <FieldLabel required>Security deposit method</FieldLabel>
                  <div className="flex gap-2">
                    {depositMethods.map(({ id, label, Icon }) => (
                      <Chip
                        key={id}
                        selected={depositCollectMethod === id}
                        onClick={() => setDepositCollectMethod(id)}
                      >
                        <Icon size={14} weight="duotone" />
                        {label}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium text-ink">
                      Was the deposit collected today?
                    </p>
                    <div className="mt-2.5">
                      <YesNo
                        value={depositCollectedToday}
                        onChange={setDepositCollectedToday}
                      />
                    </div>
                  </div>
                  {depositCollectedToday === "yes" && (
                    <div>
                      <FieldLabel required>Payment method</FieldLabel>
                      <div className="flex gap-2">
                        {depositMethods
                          .filter((m) => m.id !== "bank")
                          .map(({ id, label, Icon }) => (
                            <Chip
                              key={id}
                              selected={depositCollectMethod === id}
                              onClick={() => setDepositCollectMethod(id)}
                            >
                              <Icon size={14} weight="duotone" />
                              {label}
                            </Chip>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        <Divider />

        {/* Lease terms */}
        <section>
          <SectionTitle
            title="Lease & billing terms"
            subtitle="Pre-filled from your property's billing settings — adjust for this tenant if their terms are different."
          />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Billing cycle</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">
                {billingPeriod}
              </p>
            </div>
            <div>
              <FieldLabel required>Rent due day</FieldLabel>
              <NumberStepper
                value={tenantDueDay}
                onChange={setTenantDueDay}
                min={1}
                max={31}
                suffix="Day of month"
              />
            </div>
            <div>
              <FieldLabel required>Grace period</FieldLabel>
              <NumberStepper
                value={tenantGracePeriodDays}
                onChange={setTenantGracePeriodDays}
                min={0}
                max={30}
                suffix="Days"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {roomDailyRate !== null
              ? `Late fee once the grace period lapses: ${formatCurrency(roomDailyRate)}/day, this room type's rent ÷ days in the month.`
              : "Select a room above to see this room type's daily late-fee rate."}
          </p>

          {!isEditing && (
            <div className="mt-6">
              {isMidCycle && prorata ? (
                <div className="rounded-lg border border-line p-4">
                  <div className="flex items-center gap-2">
                    <CalendarBlank
                      size={16}
                      weight="duotone"
                      className="text-muted"
                    />
                    <p className="text-sm font-medium text-ink">
                      Mid-cycle move-in
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    Partial month: {prorata.remainingDays} of{" "}
                    {prorata.totalDays} days at{" "}
                    {formatCurrency(prorata.dailyRate)}/day.
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <ChoiceCard
                      selected={prorataChoice === "charge"}
                      onClick={() => setProrataChoice("charge")}
                      title="Charge pro-rata"
                      description={`${formatCurrency(prorata.amount)} for the partial month`}
                    />
                    <ChoiceCard
                      selected={prorataChoice === "waive"}
                      onClick={() => setProrataChoice("waive")}
                      title="Waive partial month"
                      description="First payment starts next month"
                    />
                  </div>

                  {prorataChoice === "charge" && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted">
                        Has the tenant already paid this?
                      </p>
                      <div className="mt-1.5">
                        <YesNo
                          value={prorataCollectedToday}
                          onChange={setProrataCollectedToday}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-ink">Rent</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Was any rent collected today?
                  </p>
                  <div className="mt-2.5">
                    <YesNo
                      value={rentCollectedToday}
                      onChange={setRentCollectedToday}
                    />
                  </div>
                  {rentCollectedToday === "yes" && (
                    <div className="mt-2.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <FieldLabel required>Amount (K)</FieldLabel>
                        <input
                          type="number"
                          min={0}
                          value={rentAmountCollected}
                          onChange={(e) =>
                            setRentAmountCollected(Number(e.target.value) || 0)
                          }
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <FieldLabel required>Payment method</FieldLabel>
                        <div className="flex gap-2">
                          {(["mobile", "cash"] as const).map((m) => (
                            <Chip
                              key={m}
                              selected={rentCollectMethod === m}
                              onClick={() => setRentCollectMethod(m)}
                            >
                              {m === "mobile" ? "Mobile money" : "Cash"}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <Divider />

        <section>
          <h3 className="mb-3 text-base font-semibold text-ink">Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Payment arrangements, special circumstances, anything worth remembering about this tenant. Landlord-only."
            className={`resize-none ${inputCls}`}
          />
        </section>

        <Divider />

        <section>
          <SectionTitle
            title="Documents"
            subtitle="Tenancy agreement, national ID, acceptance letter — anything worth keeping on file for this tenant. Optional."
          />
          <div className="mt-4">
            {isEditing ? (
              <DocumentPicker
                staged={[]}
                onStagedChange={() => {}}
                onPickImmediate={(files) => void uploadImmediately(files)}
                uploading={uploadingDocs}
                existing={existingDocs}
                existingLoading={existingDocsLoading}
                onDeleteExisting={(doc) => void deleteExisting(doc)}
              />
            ) : (
              <DocumentPicker
                staged={documents}
                onStagedChange={setDocuments}
              />
            )}
          </div>
        </section>
      </div>

      {/* `fixed`, not `sticky` — a sidebar-aware left offset (matching the sidebar's own lg:w-64)
          keeps it off the sidebar without depending on being nested inside the scroll container,
          which is what let it drift during scroll before. Compact buttons, right-aligned within
          the same max-w-2xl column the form itself sits in — not stretched, not centered. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-2xl justify-end gap-3 sm:px-4">
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          {/* Not `disabled` — a disabled button can't be clicked, which means it can never fire
              the validation feedback above. Always clickable; finalizeAndSave itself decides
              whether to actually submit or just switch on the inline errors. */}
          <Button variant="primary" size="sm" onClick={finalizeAndSave}>
            {isEditing ? "Save changes" : "Add tenant"}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {addingRoomType && (
          <AddRoomTypeDrawer
            onClose={() => setAddingRoomType(false)}
            onSave={(config, roomCount) => {
              addRoomType(config, roomCount);
              setAddingRoomType(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
