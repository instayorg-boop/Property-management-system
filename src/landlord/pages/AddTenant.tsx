import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  DeviceMobile,
  Money,
  CaretDown,
  DoorOpen,
  CalendarBlank,
  X,
  Plus,
  Minus,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import AddRoomTypeDrawer from "../components/AddRoomTypeDrawer";
import Button from "../components/Button";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";
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

// --- Shared visual primitives for this page's warmer, softer take on the design system --------
// (SectionLabel/the standard bordered-box inputs elsewhere in the app read as "administrative" —
// this page intentionally trades that for more whitespace, monochrome selected states instead of
// brand blue, and pill/rounded-2xl shapes, since a landlord fills this out once per tenant and it
// deserves to feel calmer than a settings form.)

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-[22px] font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          {subtitle}
        </p>
      )}
    </div>
  );
}

const softInputCls =
  "w-full rounded-xl border border-line bg-paper px-4 py-3.5 text-[15px] text-ink outline-none transition-shadow placeholder:text-muted/70 focus:border-ink focus:ring-1 focus:ring-ink";
const softLabelCls = "mb-1.5 block text-[13px] text-muted";

/** A large, elevated click-card for a binary/small-set choice — thin border at rest, solid dark
 * border + soft neutral fill + a gentle lift once selected, instead of a filled brand-color box. */
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
      className={`rounded-2xl border p-5 text-left transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "border-ink bg-mist shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
          : "border-line hover:border-ink/40 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
      }`}
    >
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </button>
  );
}

/** A rounded pill, not a rectangle — monochrome selected state (solid ink fill) instead of a
 * brand-blue tint. Used for Yes/No and small option groups. */
function Pill({
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
      className={`rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-150 ${
        selected
          ? "border-ink bg-ink text-white"
          : "border-line text-ink hover:border-ink/50"
      }`}
    >
      {children}
    </button>
  );
}

function PhoneListEditor({
  phones,
  onChange,
}: {
  phones: string[];
  onChange: (phones: string[]) => void;
}) {
  return (
    <div className="space-y-2.5">
      {phones.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={p}
            onChange={(e) => {
              const next = [...phones];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder="e.g. 0977 123 456"
            className={`flex-1 ${softInputCls}`}
          />
          {phones.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(phones.filter((_, idx) => idx !== i))}
              aria-label="Remove number"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-red-600"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...phones, ""])}
        className="text-sm font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
      >
        + Add another number
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
];

/** Searchable, vacant-only room picker — a plain grid gets unwieldy once there are more than a handful of rooms. */
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
        className={`flex items-center justify-between text-left ${softInputCls}`}
      >
        <span className={selected ? "text-ink" : "text-muted"}>
          {selected
            ? `${selected.room} · ${selected.roomType} · K${selected.rent.toLocaleString()}`
            : "Select a room with a bed free"}
        </span>
        <CaretDown size={14} weight="bold" className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
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
              className="w-full rounded-lg bg-mist px-3 py-2 text-sm outline-none"
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
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-mist"
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
              <p className="px-4 py-3 text-sm text-muted">
                No rooms with a free bed match.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
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
        <Pill key={v} selected={value === v} onClick={() => onChange(v)}>
          {v === "yes" ? "Yes" : "No"}
        </Pill>
      ))}
    </div>
  );
}

/** A circular −/+ stepper for a small bounded integer (rent due day, grace period days) — minimal
 * round icon buttons either side of a bold number, rather than a boxed counter widget. */
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
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-ink hover:bg-mist"
      >
        <Minus size={13} weight="bold" />
      </button>
      <div className="w-20 text-center">
        <p className="text-lg font-semibold text-ink">{value}</p>
        <p className="text-[11px] text-muted">{suffix}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-ink hover:bg-mist"
      >
        <Plus size={13} weight="bold" />
      </button>
    </div>
  );
}

const PREFIX_OPTIONS = ["—", "Mr", "Mrs", "Ms"];

/** Full-page "Add tenant" form — one continuous scroll (Personal → Property → Deposit → Lease
 * terms, in that reading order) rather than a gated multi-step wizard, since there isn't enough
 * on any one section to justify making the landlord click through screens for it. Editing an
 * existing tenant still uses TenantFormDrawer, which covers a much smaller field set and doesn't
 * need the room-and-payments choreography this flow has. */
export default function AddTenant() {
  const navigate = useNavigate();
  const { addTenant, updateTenant, logPayment } = useTenants();
  const { propertyName, billingPeriod, dueDay, gracePeriodDays } =
    useSettings();
  const { roomTypeConfigs, addRoomType } = useRooms();
  const vacantRooms = useVacantRoomsForAssignment();
  const [addingRoomType, setAddingRoomType] = useState(false);

  const [prefix, setPrefix] = useState(PREFIX_OPTIONS[0]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phones, setPhones] = useState<string[]>([""]);
  const [contacts, setContacts] = useState<ContactDraft[]>([newContactDraft()]);
  const [notes, setNotes] = useState("");

  const [selectedRoom, setSelectedRoom] = useState<VacantRoom | null>(null);
  const [moveInDate, setMoveInDate] = useState(todayISO());

  const [tenantDueDay, setTenantDueDay] = useState(dueDay);
  const [tenantGracePeriodDays, setTenantGracePeriodDays] =
    useState(gracePeriodDays);

  const [wantsDeposit, setWantsDeposit] = useState<"yes" | "no">("no");
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositCollectedToday, setDepositCollectedToday] = useState<
    "yes" | "no" | null
  >(null);
  const [depositCollectMethod, setDepositCollectMethod] = useState<
    "mobile" | "cash"
  >("mobile");

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
    setDepositAmount(r.depositAmount);
    setRentAmountCollected(r.rent);
    if (r.depositAmount > 0) setWantsDeposit("yes");
  };

  const updateContact = (index: number, patch: Partial<ContactDraft>) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };
  const removeContact = (index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  };

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

  const canSubmit =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !!selectedRoom;

  const finalizeAndCreate = () => {
    if (!canSubmit || !selectedRoom) return;

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
      // Stored only when they differ from the property default — most tenants take the default,
      // and this keeps a bulk change in Settings applying to them automatically going forward.
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

    navigate(`/tenants/${created.id}`);
  };

  return (
    <>
      <PageHeader
        title="Add tenant"
        description="Completed at the property office in under 4 minutes."
      />

      <div className="mx-auto max-w-2xl space-y-16 px-4 pb-32 sm:px-8">
        {/* Personal */}
        <div className="space-y-8">
          <Heading
            title="Personal information"
            subtitle="The tenant's name as it should appear on invoices and receipts."
          />
          <div className="space-y-5">
            {/* One rounded card, split into three cells rather than three separate boxed
                inputs — the "guest search" grouping pattern. */}
            <div className="grid grid-cols-[100px_1fr_1fr] divide-x divide-line overflow-hidden rounded-2xl border border-line">
              <div className="px-3.5 py-2.5">
                <label className="mb-0.5 block text-[11px] text-muted">
                  Prefix
                </label>
                <Select
                  value={prefix}
                  onChange={setPrefix}
                  options={PREFIX_OPTIONS.map((p) => ({ value: p, label: p }))}
                  className="w-full border-none! bg-transparent! px-0! py-0! text-[15px]"
                />
              </div>
              <div className="px-3.5 py-2.5">
                <label className="mb-0.5 block text-[11px] text-muted">
                  First name
                </label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Chanda"
                  className="w-full border-none bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/70"
                />
              </div>
              <div className="px-3.5 py-2.5">
                <label className="mb-0.5 block text-[11px] text-muted">
                  Last name
                </label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Mwansa"
                  className="w-full border-none bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/70"
                />
              </div>
            </div>
            <div>
              <label className={softLabelCls}>Phone number(s)</label>
              <PhoneListEditor phones={phones} onChange={setPhones} />
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-baseline gap-2">
              <h3 className="text-[15px] font-semibold text-ink">
                Emergency contact information
              </h3>
              <span className="text-[13px] text-muted">Optional</span>
            </div>
            {contacts.length === 0 ? (
              <button
                type="button"
                onClick={() => setContacts([newContactDraft()])}
                className="text-sm font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                + Add emergency contact
              </button>
            ) : (
              <>
                <div className="space-y-6">
                  {contacts.map((contact, i) => (
                    <div
                      key={contact.id}
                      className="rounded-2xl border border-line p-5"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-[13px] font-medium text-muted">
                          {i === 0 ? "Primary contact" : `Contact ${i + 1}`}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeContact(i)}
                          aria-label="Remove contact"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-red-600"
                        >
                          <X size={14} weight="bold" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={softLabelCls}>Name</label>
                          <input
                            value={contact.name}
                            onChange={(e) =>
                              updateContact(i, { name: e.target.value })
                            }
                            className={softInputCls}
                          />
                        </div>
                        <div>
                          <label className={softLabelCls}>
                            Relation to tenant
                          </label>
                          <Select
                            value={contact.relation}
                            onChange={(v) =>
                              updateContact(i, { relation: v as RelationType })
                            }
                            options={RELATION_OPTIONS.map((r) => ({
                              value: r,
                              label: r,
                            }))}
                            className="w-full rounded-xl! border-line! py-3.5!"
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
                                  className={`mt-2 ${softInputCls}`}
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className={softLabelCls}>Phone number(s)</label>
                        <PhoneListEditor
                          phones={contact.phones}
                          onChange={(next) =>
                            updateContact(i, { phones: next })
                          }
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
                  className="mt-4 text-sm font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
                >
                  + Add another emergency contact
                </button>
              </>
            )}
          </div>
        </div>

        {/* Property */}
        <div className="space-y-8">
          <Heading
            title="Property placement"
            subtitle={`Which room will ${name.trim() || "this tenant"} occupy, and from when?`}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={softLabelCls}>Move-in date</label>
              <DatePicker value={moveInDate} onChange={setMoveInDate} />
            </div>
            <div>
              <label className={softLabelCls}>Room (vacant only)</label>
              {roomTypeConfigs.length === 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3">
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
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-mist px-5 py-4">
            <span className="text-sm text-muted">
              Agreed rent, set by the room selected above
            </span>
            <span className="text-[15px] font-semibold text-ink">
              {selectedRoom ? `${formatCurrency(selectedRoom.rent)}/mo` : "—"}
            </span>
          </div>
        </div>

        {/* Deposit */}
        <div className="space-y-8">
          <Heading
            title="Security deposit"
            subtitle={
              selectedRoom
                ? `Does this tenant need to pay ${selectedRoom.roomType}'s security deposit upfront?`
                : "Does this tenant need to pay a security deposit upfront? Select a room above first — the amount is set by that room type."
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div className="space-y-5">
              <div>
                <label className={softLabelCls}>Deposit amount (K)</label>
                <input
                  type="number"
                  min={0}
                  value={depositAmount}
                  onChange={(e) =>
                    setDepositAmount(Number(e.target.value) || 0)
                  }
                  className={softInputCls}
                />
                <p className="mt-1.5 text-[13px] text-muted">
                  Defaults to {selectedRoom?.roomType}'s configured deposit —
                  edit if this tenant's terms differ.
                </p>
              </div>

              <div>
                <p className="text-[15px] font-medium text-ink">
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
                  <label className={softLabelCls}>Payment method</label>
                  <div className="flex gap-2">
                    {depositMethods.map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          setDepositCollectMethod(id as "mobile" | "cash")
                        }
                        className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all ${
                          depositCollectMethod === id
                            ? "border-ink bg-ink text-white"
                            : "border-line text-ink hover:border-ink/50"
                        }`}
                      >
                        <Icon size={16} weight="duotone" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lease terms */}
        <div className="space-y-8">
          <Heading
            title="Lease & billing terms"
            subtitle="Pre-filled from your property's billing settings — adjust for this tenant if their terms are different."
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-2xl bg-mist px-4 py-3.5">
              <p className="text-[11px] text-muted">Billing cycle</p>
              <p className="mt-0.5 text-[15px] font-semibold text-ink">
                {billingPeriod}
              </p>
            </div>
            <div>
              <label className={softLabelCls}>Rent due day</label>
              <NumberStepper
                value={tenantDueDay}
                onChange={setTenantDueDay}
                min={1}
                max={31}
                suffix="Day of month"
              />
            </div>
            <div>
              <label className={softLabelCls}>Grace period</label>
              <NumberStepper
                value={tenantGracePeriodDays}
                onChange={setTenantGracePeriodDays}
                min={0}
                max={30}
                suffix="Days"
              />
            </div>
          </div>
          <p className="text-[13px] text-muted">
            {roomDailyRate !== null
              ? `Late fee once the grace period lapses: ${formatCurrency(roomDailyRate)}/day, this room type's rent ÷ days in the month.`
              : "Select a room above to see this room type's daily late-fee rate."}
          </p>

          {isMidCycle && prorata ? (
            <div className="rounded-2xl border border-line p-5">
              <div className="flex items-center gap-2">
                <CalendarBlank
                  size={16}
                  weight="duotone"
                  className="text-muted"
                />
                <p className="text-[15px] font-semibold text-ink">
                  Mid-cycle move-in
                </p>
              </div>
              <p className="mt-1.5 text-sm text-muted">
                Partial month: {prorata.remainingDays} of {prorata.totalDays}{" "}
                days at {formatCurrency(prorata.dailyRate)}/day.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <div className="mt-4">
                  <p className="text-[13px] font-medium text-muted">
                    Has the tenant already paid this?
                  </p>
                  <div className="mt-2">
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
              <p className="text-[15px] font-medium text-ink">Rent</p>
              <p className="mt-0.5 text-sm text-muted">
                Was any rent collected today?
              </p>
              <div className="mt-2.5">
                <YesNo
                  value={rentCollectedToday}
                  onChange={setRentCollectedToday}
                />
              </div>
              {rentCollectedToday === "yes" && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={softLabelCls}>Amount (K)</label>
                    <input
                      type="number"
                      min={0}
                      value={rentAmountCollected}
                      onChange={(e) =>
                        setRentAmountCollected(Number(e.target.value) || 0)
                      }
                      className={softInputCls}
                    />
                  </div>
                  <div>
                    <label className={softLabelCls}>Payment method</label>
                    <div className="flex gap-2">
                      {(["mobile", "cash"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setRentCollectMethod(m)}
                          className={`rounded-full border px-4 py-2.5 text-sm font-medium transition-all ${
                            rentCollectMethod === m
                              ? "border-ink bg-ink text-white"
                              : "border-line text-ink hover:border-ink/50"
                          }`}
                        >
                          {m === "mobile" ? "Mobile money" : "Cash"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-3 text-[15px] font-semibold text-ink">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Payment arrangements, special circumstances, anything worth remembering about this tenant. Landlord-only."
              className={`resize-none ${softInputCls}`}
            />
          </div>
        </div>
      </div>

      {/* Sticky footer — a full page has no natural bottom edge to anchor the submit action to
          otherwise, and it stays reachable while the form above scrolls under it. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate(-1)}
            className="flex-1 py-3 sm:flex-none sm:px-8"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={finalizeAndCreate}
            disabled={!canSubmit}
            className="flex-1 py-3"
          >
            Add tenant
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
