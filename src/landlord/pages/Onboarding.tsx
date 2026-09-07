import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Papa from "papaparse";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  DoorOpen,
  Plus,
  UploadSimple,
  UsersThree,
  HouseSimple,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { useSettings } from "../SettingsContext";
import { useRooms } from "../RoomsContext";
import { useTenants, formatCurrency, type Tenant, type DepositRefundability } from "../TenantsContext";
import Select from "../components/Select";

// --- Shared bits -------------------------------------------------------------------

const STEP_LABELS = ["Welcome", "Property", "Room types", "Tenants", "Settings", "Done"];
const TOTAL_STEPS = STEP_LABELS.length;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Parses a `<input type="date">` value as a local calendar date (avoids UTC off-by-one). */
function parseDateInputLocal(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDateGB(iso: string): string {
  if (!iso) return "";
  return parseDateInputLocal(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const fieldCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-medium text-muted";
const cardCls = "rounded-lg border border-line bg-paper p-4";

function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100 ${className}`}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-mist ${className}`}
    >
      {children}
    </button>
  );
}

/** Slim numbered-dot progress indicator shown on steps 2–6 (step 1 is a pure landing screen). */
function StepIndicator({ step }: { step: number }) {
  // Dots represent the 5 "real" steps (Property..Done); step 1 (Welcome) isn't shown as a dot.
  const dotCount = TOTAL_STEPS - 1;
  const current = step - 1; // 1..5
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {Array.from({ length: dotCount }, (_, i) => i + 1).map((i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === current ? "w-6 bg-brand" : i < current ? "w-1.5 bg-brand/50" : "w-1.5 bg-line"
          }`}
        />
      ))}
    </div>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex w-fit items-center gap-1.5">
      <div className="flex h-5 w-5 items-center justify-center rounded bg-ink">
        <span className="font-display text-[10px] font-bold text-paper">I</span>
      </div>
      <span className="font-display text-[13px] font-semibold tracking-tight">Instay</span>
    </Link>
  );
}

/** Wraps each step's content with the shared fade/slide transition used elsewhere in the app. */
function StepFrame({ stepKey, children }: { stepKey: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function WizardShell({
  step,
  onBack,
  children,
}: {
  step: number;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-mist">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo />
        {step > 1 && step < TOTAL_STEPS && (
          <p className="text-[11px] font-medium text-muted">
            Step {step - 1} of {TOTAL_STEPS - 2}
          </p>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-col px-6 pb-24 pt-4 sm:px-0">
        {step > 1 && step < TOTAL_STEPS && <StepIndicator step={step} />}
        {children}
      </main>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="fixed bottom-6 left-6 flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3.5 py-2 text-[13px] font-medium text-ink shadow-card transition-colors hover:bg-mist sm:left-10"
        >
          <ArrowLeft size={14} weight="bold" />
          Back
        </button>
      )}
    </div>
  );
}

// --- Step 1: Welcome -------------------------------------------------------------------

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-[calc(100vh-88px)] flex-col items-center justify-center text-center">
      <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Sparkle size={26} weight="duotone" />
      </span>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Let's get your property set up.
      </h1>
      <p className="mt-2.5 max-w-sm text-[13px] text-muted">
        A few quick steps — add your property, your rooms, and your tenants. You can skip anything
        and finish it later from the dashboard.
      </p>
      <PrimaryButton onClick={onNext} className="mt-8 px-8 py-3 text-sm">
        Get started
        <ArrowRight size={15} weight="bold" />
      </PrimaryButton>
    </div>
  );
}

// --- Step 2: Property basics (mandatory) -------------------------------------------------------------------

function PropertyBasicsStep({ onCreated }: { onCreated: () => void }) {
  const { createFirstProperty } = useSettings();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError("Give your property a name to continue.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await createFirstProperty(name.trim(), address.trim(), propertyType.trim());
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your property. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        Tell us about your property.
      </h1>
      <p className="mt-1.5 text-[13px] text-muted">This is the only step you can't skip — everything else needs a property to belong to.</p>

      <div className="mt-7 space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">{error}</p>}
        <div>
          <label className={labelCls}>Property name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kabulonga House"
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>Address (optional)</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Plot 14, Kabulonga, Lusaka"
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>Property type (optional)</label>
          <input
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            placeholder="e.g. Student accommodation"
            className={fieldCls}
          />
        </div>
      </div>

      <PrimaryButton onClick={submit} loading={loading} className="mt-7 w-full py-3 text-sm">
        {!loading && (
          <>
            Continue
            <ArrowRight size={15} weight="bold" />
          </>
        )}
      </PrimaryButton>
    </div>
  );
}

// --- Step 3: Room types (skippable) -------------------------------------------------------------------

const refundabilityOptions: DepositRefundability[] = ["Refundable", "Partially refundable", "Non-refundable"];

function RoomTypesStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { roomTypeConfigs, rooms, addRoomType } = useRooms();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(1);
  const [rent, setRent] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositRefundability, setDepositRefundability] = useState<DepositRefundability>("Refundable");
  const [roomCount, setRoomCount] = useState(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomCountByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rooms) map.set(r.typeId, (map.get(r.typeId) ?? 0) + 1);
    return map;
  }, [rooms]);

  const canAdd = name.trim().length > 0 && capacity > 0 && rent > 0 && roomCount > 0;

  const addOne = async () => {
    if (!canAdd) return;
    setError(null);
    setAdding(true);
    try {
      await addRoomType({ name: name.trim(), capacity, rent, depositAmount, depositRefundability }, roomCount);
      setName("");
      setCapacity(1);
      setRent(0);
      setDepositAmount(0);
      setDepositRefundability("Refundable");
      setRoomCount(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that room type. Try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">Add your room types.</h1>
      <p className="mt-1.5 text-[13px] text-muted">
        Set the rent and deposit terms once — every room of this type uses them. You can always add more later.
      </p>

      {roomTypeConfigs.length > 0 && (
        <div className="mt-6 space-y-2.5">
          {roomTypeConfigs.map((t) => (
            <div key={t.id} className={`${cardCls} flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <DoorOpen size={16} weight="duotone" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{t.name}</p>
                  <p className="text-xs text-muted">
                    {roomCountByType.get(t.id) ?? 0} room{(roomCountByType.get(t.id) ?? 0) === 1 ? "" : "s"} · {t.capacity} bed
                    {t.capacity === 1 ? "" : "s"} · {formatCurrency(t.rent)}/mo
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-dashed border-line p-4">
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Studio, Ensuite" className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Beds per room</label>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 1))}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Rooms to add</label>
            <input
              type="number"
              min={1}
              value={roomCount}
              onChange={(e) => setRoomCount(Math.max(1, Number(e.target.value) || 1))}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Rent (K/month)</label>
            <input type="number" min={0} value={rent} onChange={(e) => setRent(Number(e.target.value) || 0)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Deposit (K)</label>
            <input
              type="number"
              min={0}
              value={depositAmount}
              onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
              className={fieldCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Deposit terms</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {refundabilityOptions.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setDepositRefundability(o)}
                  className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${
                    depositRefundability === o ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        </div>
        <SecondaryButton onClick={addOne} className="mt-4 w-full">
          {adding ? (
            "Adding…"
          ) : (
            <>
              <Plus size={14} weight="bold" />
              Add room type
            </>
          )}
        </SecondaryButton>
      </div>

      <div className="mt-7 flex items-center gap-2">
        <SecondaryButton onClick={onSkip} className="flex-1">
          Skip for now
        </SecondaryButton>
        <PrimaryButton onClick={onNext} className="flex-1 py-3 text-sm">
          Continue
          <ArrowRight size={15} weight="bold" />
        </PrimaryButton>
      </div>
    </div>
  );
}

// --- Step 4: Tenants (skippable) -------------------------------------------------------------------

type CsvRow = {
  name: string;
  phone: string;
  room: string;
  roomType: string;
  rentAmount: string;
  moveInDate: string;
};

const CSV_ALIASES: Record<keyof CsvRow, string[]> = {
  name: ["name", "full name", "tenant name"],
  phone: ["phone", "phone number", "mobile", "phone no", "contact"],
  room: ["room", "room number", "room no"],
  roomType: ["room type", "roomtype", "type"],
  rentAmount: ["rent", "rent amount", "monthly rent"],
  moveInDate: ["move in date", "move-in date", "moveindate", "move in", "start date"],
};

function mapCsvHeaders(row: Record<string, string>): CsvRow {
  const normalized = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) normalized.set(k.trim().toLowerCase(), v);

  const pick = (field: keyof CsvRow): string => {
    for (const alias of CSV_ALIASES[field]) {
      const val = normalized.get(alias);
      if (val !== undefined) return val;
    }
    return "";
  };

  return {
    name: pick("name"),
    phone: pick("phone"),
    room: pick("room"),
    roomType: pick("roomType"),
    rentAmount: pick("rentAmount"),
    moveInDate: pick("moveInDate"),
  };
}

function buildNewTenant(input: {
  name: string;
  phone: string;
  roomType: string;
  rentAmount: number;
  moveInDateDisplay: string;
  depositAmount: number;
  propertyName: string;
}): Omit<Tenant, "id"> {
  return {
    name: input.name,
    phones: input.phone ? [input.phone] : [],
    emergencyContacts: [],
    property: input.propertyName,
    room: "",
    roomType: input.roomType,
    moveInDate: input.moveInDateDisplay,
    rentAmount: input.rentAmount,
    status: "unpaid",
    owedAmount: input.rentAmount,
    depositAmount: input.depositAmount,
    depositDate: input.moveInDateDisplay,
    depositMethod: "cash",
    depositStatus: "Not collected",
    notes: "",
    onTimeCount: 0,
    totalMonthsCount: 0,
    active: true,
    ledger: [],
  };
}

type ManualTenantDraft = { id: string; name: string; phone: string; roomType: string; rentAmount: number; moveInDate: string };

function TenantsStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { roomTypeConfigs } = useRooms();
  const { tenants, addTenant } = useTenants();
  const { propertyName } = useSettings();
  const hasRoomTypes = roomTypeConfigs.length > 0;

  const [added, setAdded] = useState<ManualTenantDraft[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roomType, setRoomType] = useState(roomTypeConfigs[0]?.name ?? "");
  const [rentAmount, setRentAmount] = useState(roomTypeConfigs[0]?.rent ?? 0);
  const [moveInDate, setMoveInDate] = useState(todayISO());

  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const onSelectRoomType = (v: string) => {
    setRoomType(v);
    const cfg = roomTypeConfigs.find((t) => t.name === v);
    if (cfg) setRentAmount(cfg.rent);
  };

  const addManual = () => {
    if (!name.trim() || !roomType) return;
    const cfg = roomTypeConfigs.find((t) => t.name === roomType);
    const tenant = buildNewTenant({
      name: name.trim(),
      phone: phone.trim(),
      roomType,
      rentAmount,
      moveInDateDisplay: formatDateGB(moveInDate),
      depositAmount: cfg?.depositAmount ?? 0,
      propertyName,
    });
    addTenant(tenant);
    setAdded((prev) => [...prev, { id: crypto.randomUUID(), name: name.trim(), phone: phone.trim(), roomType, rentAmount, moveInDate }]);
    setName("");
    setPhone("");
    setMoveInDate(todayISO());
  };

  const onCsvFile = (file: File) => {
    setCsvError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data.map(mapCsvHeaders).filter((r) => r.name.trim().length > 0);
        if (rows.length === 0) {
          setCsvError("Couldn't find any rows with a name column. Check the file's headers.");
          return;
        }
        setCsvRows(rows);
      },
      error: (err) => setCsvError(err.message || "Couldn't read that file."),
    });
  };

  const removeCsvRow = (index: number) => {
    setCsvRows((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  const confirmCsvImport = () => {
    if (!csvRows || csvRows.length === 0) return;
    setImporting(true);
    for (const row of csvRows) {
      const rent = Number(row.rentAmount.replace(/[^0-9.]/g, "")) || 0;
      const tenant = buildNewTenant({
        name: row.name.trim(),
        phone: row.phone.trim(),
        roomType: row.roomType.trim(),
        rentAmount: rent,
        moveInDateDisplay: row.moveInDate.trim() || formatDateGB(todayISO()),
        depositAmount: 0,
        propertyName,
      });
      addTenant(tenant);
    }
    setImporting(false);
    setCsvRows(null);
  };

  const totalAddedThisSession = added.length + tenants.length > 0 ? tenants.length : 0;

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">Add your tenants.</h1>
      <p className="mt-1.5 text-[13px] text-muted">Add a few by hand, import a CSV, or skip this and add tenants later.</p>

      {totalAddedThisSession > 0 && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700">
          {totalAddedThisSession} tenant{totalAddedThisSession === 1 ? "" : "s"} added so far.
        </p>
      )}

      {!hasRoomTypes ? (
        <div className={`mt-6 flex items-center gap-3 ${cardCls} border-dashed`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
            <UsersThree size={16} weight="duotone" />
          </span>
          <p className="text-xs text-muted">
            Add a room type first (previous step) to quick-add tenants by hand here — or skip ahead and add them from the Tenants page later.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-line p-4">
          <p className="mb-3 text-xs font-medium text-muted">Quick add</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} placeholder="e.g. Grace Banda" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldCls} placeholder="e.g. 0977 123 456" />
            </div>
            <div>
              <label className={labelCls}>Room type</label>
              <Select
                value={roomType}
                onChange={onSelectRoomType}
                options={roomTypeConfigs.map((t) => ({ value: t.name, label: t.name }))}
                className="w-full"
              />
            </div>
            <div>
              <label className={labelCls}>Monthly rent (K)</label>
              <input
                type="number"
                min={0}
                value={rentAmount}
                onChange={(e) => setRentAmount(Number(e.target.value) || 0)}
                className={fieldCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Move-in date</label>
              <input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} className={fieldCls} />
            </div>
          </div>
          <SecondaryButton onClick={addManual} className="mt-4 w-full">
            <Plus size={14} weight="bold" />
            Add tenant
          </SecondaryButton>

          {added.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-line pt-4">
              {added.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-ink">
                    {t.name} <span className="text-muted">· {t.roomType} · {formatCurrency(t.rentAmount)}/mo</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <p className="mb-3 text-xs font-medium text-muted">Or bulk import from CSV</p>
        {csvError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">{csvError}</p>}

        {!csvRows ? (
          <label className={`${cardCls} flex cursor-pointer flex-col items-center gap-2 border-dashed py-8 text-center`}>
            <UploadSimple size={22} weight="duotone" className="text-muted" />
            <span className="text-xs font-medium text-ink">Choose a .csv file</span>
            <span className="text-[11px] text-muted">Columns like name, phone, room type, rent, move-in date</span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onCsvFile(file);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <div className={cardCls}>
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="pb-2 pr-2 font-medium">Name</th>
                    <th className="pb-2 pr-2 font-medium">Phone</th>
                    <th className="pb-2 pr-2 font-medium">Room type</th>
                    <th className="pb-2 pr-2 font-medium">Rent</th>
                    <th className="pb-2 pr-2 font-medium">Move-in</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {csvRows.map((row, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-2 text-ink">{row.name || "—"}</td>
                      <td className="py-1.5 pr-2 text-ink">{row.phone || "—"}</td>
                      <td className="py-1.5 pr-2 text-ink">{row.roomType || "—"}</td>
                      <td className="py-1.5 pr-2 text-ink">{row.rentAmount || "—"}</td>
                      <td className="py-1.5 pr-2 text-ink">{row.moveInDate || "—"}</td>
                      <td className="py-1.5">
                        <button type="button" onClick={() => removeCsvRow(i)} aria-label="Remove row" className="text-muted hover:text-red-600">
                          <X size={13} weight="bold" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <SecondaryButton onClick={() => setCsvRows(null)} className="flex-1">
                Cancel
              </SecondaryButton>
              <PrimaryButton onClick={confirmCsvImport} loading={importing} className="flex-1">
                Import {csvRows.length} tenant{csvRows.length === 1 ? "" : "s"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>

      <div className="mt-7 flex items-center gap-2">
        <SecondaryButton onClick={onSkip} className="flex-1">
          Skip for now
        </SecondaryButton>
        <PrimaryButton onClick={onNext} className="flex-1 py-3 text-sm">
          Continue
          <ArrowRight size={15} weight="bold" />
        </PrimaryButton>
      </div>
    </div>
  );
}

// --- Step 5: Key settings (skippable) -------------------------------------------------------------------

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function KeySettingsStep({ onNext }: { onNext: () => void }) {
  const {
    dailyPenaltyRate,
    setDailyPenaltyRate,
    collectionTargetPct,
    setCollectionTargetPct,
    payoutDay,
    setPayoutDay,
    invoicesOn,
    setInvoicesOn,
  } = useSettings();

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">A few key settings.</h1>
      <p className="mt-1.5 text-[13px] text-muted">Sensible defaults are already set — tweak anything now, or change it later in Settings.</p>

      <div className="mt-7 space-y-5">
        <div className={cardCls}>
          <label className={labelCls}>Late-payment daily penalty rate (K/day)</label>
          <input
            type="number"
            min={0}
            value={dailyPenaltyRate}
            onChange={(e) => setDailyPenaltyRate(Number(e.target.value) || 0)}
            className={fieldCls}
          />
        </div>
        <div className={cardCls}>
          <label className={labelCls}>Collection-rate goal (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={collectionTargetPct}
            onChange={(e) => setCollectionTargetPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className={fieldCls}
          />
        </div>
        <div className={cardCls}>
          <label className={labelCls}>Payout day</label>
          <Select value={payoutDay} onChange={setPayoutDay} options={WEEKDAYS.map((d) => ({ value: d, label: d }))} className="w-full" />
        </div>
        <div className={`${cardCls} flex items-center justify-between`}>
          <div>
            <p className="text-sm font-medium text-ink">Turn on invoicing</p>
            <p className="mt-0.5 text-xs text-muted">Generate and send tenant invoices from the Invoices page.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={invoicesOn}
            onClick={() => setInvoicesOn(!invoicesOn)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${invoicesOn ? "bg-brand" : "bg-line"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper shadow transition-transform ${
                invoicesOn ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-7 flex items-center gap-2">
        <SecondaryButton onClick={onNext} className="flex-1">
          Skip for now
        </SecondaryButton>
        <PrimaryButton onClick={onNext} className="flex-1 py-3 text-sm">
          Continue
          <ArrowRight size={15} weight="bold" />
        </PrimaryButton>
      </div>
    </div>
  );
}

// --- Step 6: Done -------------------------------------------------------------------

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex min-h-[calc(100vh-88px)] flex-col items-center justify-center text-center">
      <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check size={26} weight="bold" />
      </span>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">You're all set.</h1>
      <p className="mt-2.5 max-w-sm text-[13px] text-muted">
        Your property is ready. You can always add more rooms, tenants, or tweak settings from the dashboard.
      </p>
      <PrimaryButton onClick={onFinish} className="mt-8 px-8 py-3 text-sm">
        <HouseSimple size={16} weight="bold" />
        Go to dashboard
      </PrimaryButton>
    </div>
  );
}

// --- Wizard -------------------------------------------------------------------

export default function Onboarding() {
  const navigate = useNavigate();
  const { propertyId, isReady, completeOnboarding } = useSettings();
  const [step, setStep] = useState(1);
  const [skippedAhead, setSkippedAhead] = useState(false);

  // A refresh mid-wizard after step 2 already created the property — jump straight past it.
  useEffect(() => {
    if (isReady && propertyId && step === 1 && !skippedAhead) {
      setStep(3);
      setSkippedAhead(true);
    }
  }, [isReady, propertyId, step, skippedAhead]);

  const goTo = (s: number) => setStep(s);

  const finish = () => {
    completeOnboarding();
    navigate("/dashboard", { replace: true });
  };

  const backTargets: Record<number, number | undefined> = {
    3: propertyId && skippedAhead ? undefined : 2,
    4: 3,
    5: 4,
  };

  return (
    <WizardShell step={step} onBack={backTargets[step] ? () => goTo(backTargets[step]!) : undefined}>
      <StepFrame stepKey={String(step)}>
        {step === 1 && <WelcomeStep onNext={() => goTo(2)} />}
        {step === 2 && <PropertyBasicsStep onCreated={() => goTo(3)} />}
        {step === 3 && <RoomTypesStep onNext={() => goTo(4)} onSkip={() => goTo(4)} />}
        {step === 4 && <TenantsStep onNext={() => goTo(5)} onSkip={() => goTo(5)} />}
        {step === 5 && <KeySettingsStep onNext={() => goTo(6)} />}
        {step === 6 && <DoneStep onFinish={finish} />}
      </StepFrame>
    </WizardShell>
  );
}
