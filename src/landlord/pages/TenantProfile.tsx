import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  PencilSimple,
  Trash,
  Prohibit,
  CheckCircle,
  Wrench,
  Receipt,
  UsersThree,
  DoorOpen,
  CurrencyCircleDollar,
  CalendarBlank,
  Lock,
  Paperclip,
  FileText,
  Link as LinkIcon,
  BookmarkSimple,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import SectionLabel from "../components/SectionLabel";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import MoveOutModal from "../components/MoveOutModal";
import LogPaymentModal from "../components/LogPaymentModal";
import AdjustmentModal from "../components/AdjustmentModal";
import WaivePenaltyModal from "../components/WaivePenaltyModal";
import ConfirmDeleteTenantModal from "../components/ConfirmDeleteTenantModal";
import ReactivateTenantModal from "../components/ReactivateTenantModal";
import ReserveRoomModal from "../components/ReserveRoomModal";
import Modal from "../components/Modal";
import { useRooms, useRoomsView } from "../RoomsContext";
import {
  useTenants,
  formatCurrency,
  relationLabel,
  type PaymentStatus,
  type LedgerRow,
} from "../TenantsContext";
import { useMaintenance } from "../MaintenanceContext";
import { calcTotalOwed, calcPenalty } from "../invoiceUtils";
import { useSettings } from "../SettingsContext";
import Button from "../components/Button";
import Select from "../components/Select";
import {
  listTenantDocuments,
  uploadTenantDocument,
  deleteTenantDocument,
  type TenantDocument,
} from "../../lib/tenantDocuments";

const statusLabel: Record<PaymentStatus, string> = {
  paid: "Paid",
  overdue: "Overdue",
  unpaid: "Unpaid",
  partial: "Partial",
};
const paymentStatusStyle: Record<PaymentStatus, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};
// "unknown" covers rows logged before the method column existed — shown as "Manual" rather than
// guessed at, since there's no real way to know how those were actually paid.
const paymentMethodLabel: Record<string, string> = {
  cash: "Cash",
  "mobile-money": "Mobile money",
  "bank-transfer": "Bank transfer",
  other: "Other",
  unknown: "Manual",
};
const paymentMethodStyle: Record<string, string> = {
  cash: "bg-slate-100 text-slate-600",
  "mobile-money": "bg-brand-soft text-brand",
  "bank-transfer": "bg-blue-50 text-blue-600",
  other: "bg-slate-100 text-slate-600",
  unknown: "bg-slate-100 text-slate-500",
};
const maintenanceStatusStyle: Record<string, string> = {
  open: "bg-red-50 text-red-600",
  "in-progress": "bg-amber-50 text-amber-600",
  resolved: "bg-emerald-50 text-emerald-600",
};
const maintenanceStatusLabel: Record<string, string> = {
  open: "Open",
  "in-progress": "In progress",
  resolved: "Resolved",
};

const historyFilters = ["All", "Paid", "Overdue", "Partial"] as const;
const tabs = [
  "Financial ledger",
  "Information",
  "Maintenance",
  "Documents",
] as const;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
type Tab = (typeof tabs)[number];

const tabTransition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

/** The dueDay-th of the given month, clamped to that month's length (e.g. dueDay 30 in
 * February) — same helper TenantPaymentDrawer uses, so "next due date" means the same thing
 * everywhere it's shown. */
function dueDateIn(year: number, monthIndex0: number, dueDay: number) {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  return new Date(year, monthIndex0, Math.min(dueDay, lastDay));
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The furthest-out month this tenant has a paid ledger entry for — lets "next due" reflect a
 * payment logged in advance for a future month, instead of always assuming only the current month
 * was covered. Ledger labels aren't one fixed format: LogPaymentModal writes "October Rent 2026",
 * while AddTenant's first-month-at-move-in payment and logPayments' own default fallback both write
 * "October 2026 rent" instead. Matching only the first format meant a tenant whose first payment
 * was logged at move-in (and never had a second one through the Log Payment modal) got stuck with
 * a phantom "Due" row for an already-paid month forever — so this looks for a month name and a
 * 4-digit year anywhere in the label, in either order, rather than one exact template. */
function furthestPaidMonth(
  ledger: LedgerRow[],
): { year: number; month: number } | null {
  let furthest: { year: number; month: number } | null = null;
  for (const row of ledger) {
    if (row.status !== "paid") continue;
    const yearMatch = row.label.match(/\d{4}/);
    if (!yearMatch) continue;
    const month = MONTH_NAMES.findIndex((name) => row.label.includes(name));
    if (month === -1) continue;
    const year = Number(yearMatch[0]);
    if (
      !furthest ||
      year > furthest.year ||
      (year === furthest.year && month > furthest.month)
    ) {
      furthest = { year, month };
    }
  }
  return furthest;
}

/** A stacked label/value pair for the Information tab's grid — small uppercase gray label above a
 * bold value, rather than InfoRow's inline label-left/value-right layout. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-[15px] font-semibold text-ink">{value}</p>
    </div>
  );
}

/** One column of the top stat row — icon + small-caps label, then a big value underneath, with an
 * optional caption line for context (e.g. what period an amount actually covers). */
function StatCard({
  icon,
  label,
  value,
  valueClassName = "",
  caption,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  caption?: string;
}) {
  return (
    <div className="flex-1 px-5 py-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {icon}
        {label}
      </p>
      <p
        className={`font-display mt-2 text-2xl font-bold tracking-tight sm:text-[28px] ${valueClassName || "text-ink"}`}
      >
        {value}
      </p>
      {caption && <p className="mt-0.5 text-xs text-muted">{caption}</p>}
    </div>
  );
}

/** "Outstanding balance" is a running total, not itself labeled by period — this spells out what
 * it actually represents (this month's rent vs several months piled up) so it's never ambiguous
 * whether K3,600 owed means "3 months behind" or "rent just went up". */
/** move_in_date/move_out_date are stored as free-text (whatever was typed, or an ISO date from a
 * seed/import) rather than one fixed format — reformats to "1 Aug 2026" for display wherever it's
 * parseable, falling back to the raw stored string rather than hiding it when it isn't. */
function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function outstandingCaption(
  owedAmount: number,
  rentAmount: number,
  daysOverdue?: number,
): string | undefined {
  if (owedAmount <= 0) return undefined;
  if (rentAmount <= 0)
    return daysOverdue ? `${daysOverdue} days overdue` : undefined;
  const monthsOwed = Math.max(1, Math.round(owedAmount / rentAmount));
  const period =
    monthsOwed <= 1 ? "This month's rent" : `${monthsOwed} months' rent`;
  return daysOverdue ? `${period} · ${daysOverdue}d overdue` : period;
}

/** Title varies by what's actually being voided — "Void payment"/"Void charge"/etc — rather than
 * one generic "Delete this entry?" the old modal used, since voiding a charge (removes an
 * obligation) reads very differently from voiding a payment (undoes a receipt) even though both
 * go through the same action. Falls back to the legacy source convention (source: "adjustment")
 * for rows with no event_type, and to a generic title only when neither tells us anything. */
function voidModalTitle(entry: LedgerRow): string {
  switch (entry.eventType) {
    case "charge":
      return "Void charge";
    case "payment":
      return "Void payment";
    case "penalty":
      return "Void penalty";
    case "adjustment":
    case "credit":
      return "Void adjustment";
    default:
      return entry.source === "adjustment" ? "Void adjustment" : "Void entry";
  }
}

function ConfirmVoidLedgerEntryModal({
  entry,
  onClose,
  onConfirm,
}: {
  entry: LedgerRow;
  onClose: () => void;
  /** Rejects on failure — the modal stays open and shows the error rather than closing, per the
   * "don't optimistically remove, leave the row intact on failure" requirement. Resolves once the
   * void has actually been confirmed by the server. */
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canConfirm = reason.trim().length > 0 && !isSubmitting;

  async function handleConfirm() {
    if (!canConfirm) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      // No setIsSubmitting(false)/onClose here — onConfirm's own success path closes the modal;
      // reaching this line always means it resolved, so there's nothing left to reset before unmount.
    } catch (e) {
      // A refused void (e.g. the charge-void guard) carries a specific explanation — show that
      // instead of a generic failure message so the landlord knows why, not just that it failed.
      setError(e instanceof Error ? e.message : "Couldn't void this entry — please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title={voidModalTitle(entry)}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="dangerSolid" onClick={handleConfirm} disabled={!canConfirm}>
            {isSubmitting ? "Voiding…" : "Void"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        "{entry.label}" ({formatCurrency(Math.abs(entry.amount))}) will be voided, not deleted — it
        stays visible in this tenant's history.
      </p>
      <div className="mt-3">
        <label className="mb-1.5 block text-xs font-medium text-muted">Reason (required)</label>
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Logged in error, duplicate entry"
          className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </Modal>
  );
}

function EmptyState({
  icon,
  title,
  caption,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
        {icon}
      </span>
      <div>
        <p className="text-xs font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{caption}</p>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <PageHeader
        title="Tenant Details"
        description="Full payment history and details for this tenant."
      />
      <div className="space-y-5 px-4 pb-10 sm:px-8">
        <Skeleton className="h-4 w-40" />
        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-2 h-3.5 w-40" />
        </div>
        <div className="flex divide-x divide-line rounded-lg border border-line bg-paper">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-1 px-5 py-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2.5 h-7 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-line bg-paper">
          <div className="flex items-center gap-4 border-b border-line px-4 py-3.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={4} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function TenantProfile() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const {
    tenants,
    isReady,
    deleteTenant,
    moveOutTenant,
    reactivateTenant,
    logPayments,
    voidLedgerEntry,
    addAdjustment,
    waivePenalty,
    updateTenant,
  } = useTenants();
  const { reports } = useMaintenance();
  const { dueDay, propertyId } = useSettings();
  const { reserveRoom, markReady } = useRooms();
  const roomsView = useRoomsView();

  const [tab, setTab] = useState<Tab>("Financial ledger");
  const [historyFilter, setHistoryFilter] =
    useState<(typeof historyFilters)[number]>("All");
  const [showLogPayment, setShowLogPayment] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showWaivePenalty, setShowWaivePenalty] = useState(false);
  const [showMoveOut, setShowMoveOut] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [showReserve, setShowReserve] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [voidingEntry, setVoidingEntry] = useState<LedgerRow | null>(null);
  const [viewingEntry, setViewingEntry] = useState<LedgerRow | null>(null);

  const [documents, setDocuments] = useState<TenantDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const tenant = tenants.find((t) => t.portalToken === code) ?? null;
  const reservedRoom = tenant ? (roomsView.find((r) => r.reservedFor?.id === tenant.id) ?? null) : null;

  const refreshDocuments = () => {
    if (!tenant) return;
    setDocumentsLoading(true);
    listTenantDocuments(tenant.id)
      .then(setDocuments)
      .catch((e) =>
        setDocumentsError(
          e instanceof Error ? e.message : "Failed to load documents",
        ),
      )
      .finally(() => setDocumentsLoading(false));
  };

  useEffect(() => {
    refreshDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  const handleUploadDocuments = async (files: FileList | null) => {
    if (!files || files.length === 0 || !tenant || !propertyId) return;
    setUploadingDocs(true);
    setDocumentsError(null);
    try {
      await Promise.all(
        Array.from(files).map((file) =>
          uploadTenantDocument(propertyId, tenant.id, file),
        ),
      );
      refreshDocuments();
    } catch (e) {
      setDocumentsError(
        e instanceof Error
          ? e.message
          : "Failed to upload one or more documents",
      );
    } finally {
      setUploadingDocs(false);
    }
  };

  const handleDeleteDocument = async (doc: TenantDocument) => {
    try {
      await deleteTenantDocument(doc);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      setDocumentsError(
        e instanceof Error ? e.message : "Failed to delete document",
      );
    }
  };

  if (!isReady) return <ProfileSkeleton />;

  if (!tenant) {
    return (
      <>
        <PageHeader title="Tenants" />
        <div className="px-4 sm:px-8">
          <EmptyState
            icon={<UsersThree size={22} weight="duotone" />}
            title="Tenant not found"
            caption="They may have been deleted, or the link is out of date."
          />
          <div className="flex justify-center">
            <Link
              to="/tenants"
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
            >
              Back to tenants
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Legacy rows (from before tenant_id existed) fall back to a name match; anything filed since
  // the fix carries the real tenant_id, so same-named tenants no longer bleed into each other.
  const tenantReports = reports.filter((r) => (r.tenantId ? r.tenantId === tenant.id : r.tenant === tenant.name));
  // Includes any accrued late penalty (see calcTotalOwed) — the raw tenant.owedAmount field alone
  // undercounts once a tenant is overdue.
  const totalOwed = calcTotalOwed(tenant);

  // Property-wide due day (Settings), same source TenantPaymentDrawer uses — not invented per
  // tenant, since this app doesn't track a per-tenant due day.
  const today = new Date();
  const paidThrough = furthestPaidMonth(tenant.ledger);

  // A charge row's own period comes from billingPeriodId (falling back to parsing its label) —
  // shared by the current-period-row gate below and the grouping logic further down, so both agree
  // on which real charge covers which month.
  function parsePeriod(label: string): { year: number; month: number } | null {
    const yearMatch = label.match(/\d{4}/);
    if (!yearMatch) return null;
    const month = MONTH_NAMES.findIndex((name) => label.includes(name));
    if (month === -1) return null;
    return { year: Number(yearMatch[0]), month };
  }

  // The ledger used to only ever get a row once a payment was actually logged — an active tenant
  // who simply hadn't paid this month yet had no row at all, which read as "nothing due" rather
  // than "due and unpaid". This synthesizes that one row from the tenant's live status, so the
  // current period always shows up even before anything's been collected for it.
  //
  // But generate-rent-charges (Phase 3B) now proactively writes a real 'charge' ledger row before
  // any payment happens, so an unpaid tenant commonly already HAS a real row for the current
  // month — synthesizing another one on top produced two rows for the same month ("September 2026
  // rent" and a second "September 2026 + late penalty" row), reading as a duplicate charge rather
  // than one debt with its penalty attached. So this only synthesizes when there's neither a paid
  // row NOR an already-logged real charge for the current period.
  const currentPeriodCovered =
    !!paidThrough &&
    (paidThrough.year > today.getFullYear() ||
      (paidThrough.year === today.getFullYear() &&
        paidThrough.month >= today.getMonth()));
  const currentPeriodChargeRow = tenant.ledger.find((row) => {
    if (row.eventType !== "charge" || row.voidedAt) return false;
    const fromBillingPeriod = row.billingPeriodId?.match(/^(\d{4})-(\d{2})$/);
    const period = fromBillingPeriod
      ? { year: Number(fromBillingPeriod[1]), month: Number(fromBillingPeriod[2]) - 1 }
      : parsePeriod(row.label);
    return period?.year === today.getFullYear() && period?.month === today.getMonth();
  });
  const hasRealChargeThisPeriod = !!currentPeriodChargeRow;
  const penaltyAmount = calcPenalty(tenant);
  const currentPeriodRow: (LedgerRow & { synthetic: true }) | null =
    tenant.active && !currentPeriodCovered && !hasRealChargeThisPeriod
      ? {
          id: "current-period",
          label: `${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`,
          amount: tenant.rentAmount,
          paidAmount:
            tenant.status === "partial"
              ? tenant.ledger[0]?.paidAmount
              : undefined,
          status: tenant.status === "paid" ? "unpaid" : tenant.status, // paid-up-but-uncovered can't happen, but guards the type
          source: "manual",
          synthetic: true,
        }
      : null;

  // Any late penalty accrued right now (see calcPenalty) gets its own row — not text tucked under
  // the charge's label — with its own Amount/Status/Balance columns like everything else on this
  // ledger, so it's never something you have to notice was mentioned in passing rather than a real
  // line item. chargeId links it into the current period's charge/due row purely for grouping.
  const penaltyRow: (LedgerRow & { synthetic: true }) | null =
    penaltyAmount > 0
      ? {
          id: "accrued-penalty",
          label: `Late penalty (${tenant.daysOverdue}d overdue)`,
          amount: penaltyAmount,
          status: "unpaid",
          source: "manual",
          synthetic: true,
          chargeId: currentPeriodChargeRow?.id ?? currentPeriodRow?.id ?? null,
        }
      : null;

  // Same idea as currentPeriodRow, but for the deposit: it never gets a ledger row of its own
  // until it's actually collected (see AddTenant.tsx — a "Security deposit" row only gets written
  // when depositWasCollected), so an uncollected one was otherwise invisible in Transactions,
  // with nothing to look back at besides the tag up top. amount is the deposit itself, not
  // tenant.owedAmount — it's tracked entirely separately from rent (see depositStatus/depositAmount).
  const depositDueRow: (LedgerRow & { synthetic: true }) | null =
    tenant.depositAmount > 0 && tenant.depositStatus === "Not collected"
      ? {
          id: "deposit-due",
          label: "Security deposit",
          amount: tenant.depositAmount,
          status: "unpaid",
          source: "manual",
          synthetic: true,
        }
      : null;

  // Every settling payment/adjustment linked to a charge gets its own visible row (not just voided
  // ones) — a charge paid off by two separate mobile-money payments on two different days must show
  // both, with their own dates, not one merged "K1,800 of K1,800 · Paid" line that erases exactly
  // the thing a landlord looks at the ledger to answer: "when did they pay what". The charge row
  // itself still shows its own total/outstanding as a summary; these are the history underneath it.
  //
  // Each payment row also carries `remainingAfter` — the charge's real running balance right after
  // THAT payment landed, computed by walking this charge's non-voided payments oldest-first and
  // deducting as we go. Without this, a K900-of-K1,800 partial payment displayed as its own row
  // reads as "K900 of K900 · Paid" (trivially true of any payment on its own) with nothing to show
  // it only covered half the charge — this is what actually answers "what was still owed after
  // this particular payment".
  const linkedRows: (LedgerRow & { remainingAfter?: number; parentChargeLabel?: string })[] = tenant.ledger.flatMap((chargeRow) => {
    const events = chargeRow.linkedEvents ?? [];
    let running = chargeRow.amount;
    const oldestFirst = [...events].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    const remainingById = new Map<string, number>();
    for (const ev of oldestFirst) {
      if (ev.voidedAt) continue; // a voided payment never actually reduced the balance
      if (ev.eventType === "payment") running = Math.max(0, running - ev.amount);
      remainingById.set(ev.id, running);
    }
    return events.map((ev) => ({ ...ev, remainingAfter: remainingById.get(ev.id), parentChargeLabel: chargeRow.label }));
  });
  type DisplayRow = LedgerRow & { synthetic?: boolean; remainingAfter?: number; parentChargeLabel?: string };
  const allRows: DisplayRow[] = [
    ...(currentPeriodRow ? [currentPeriodRow] : []),
    ...(penaltyRow ? [penaltyRow] : []),
    ...(depositDueRow ? [depositDueRow] : []),
    ...tenant.ledger,
    ...linkedRows,
  ];
  const filteredLedger = allRows.filter(
    (row) =>
      historyFilter === "All" ||
      statusLabel[row.status ?? "paid"] === historyFilter,
  );

  // Group by the rent period the row is actually FOR, not by when it happened to be logged — two
  // entries paid the same day (e.g. catching up on a missed month, or paying ahead) used to
  // interleave by timestamp alone, so an older month could land above a newer one just because it
  // was logged more recently. A charge row's own period comes from billingPeriodId (falling back
  // to parsing its label); anything that settles/adjusts a specific charge (a payment, a waived
  // penalty) inherits that charge's period via chargeId. Anything with neither an explicit link nor
  // a month name in its own label (a standalone credit/damage charge, an older-format penalty
  // waiver from before waivers linked to their charge, the security deposit) still belongs to
  // SOME month — the one it actually happened in — so it falls back to its own createdAt's
  // calendar month rather than a catch-all "Other" bucket, which is only ever a true last resort
  // (a row with no createdAt at all — shouldn't happen, but the type allows it).
  const chargePeriodById = new Map<string, { year: number; month: number }>();
  for (const row of filteredLedger) {
    if (row.eventType !== "charge" && !row.synthetic) continue;
    const fromBillingPeriod = row.billingPeriodId?.match(/^(\d{4})-(\d{2})$/);
    const period = fromBillingPeriod
      ? { year: Number(fromBillingPeriod[1]), month: Number(fromBillingPeriod[2]) - 1 }
      : parsePeriod(row.label);
    if (period) chargePeriodById.set(row.id, period);
  }
  function periodKeyOf(row: DisplayRow): string {
    if (row.id === "deposit-due") return "account"; // still-owed reminder, nothing dated to group it by yet
    const own =
      chargePeriodById.get(row.id) ??
      (row.chargeId ? chargePeriodById.get(row.chargeId) : undefined) ??
      parsePeriod(row.label);
    if (own) return `${own.year}-${String(own.month).padStart(2, "0")}`;
    if (row.createdAt) {
      const d = new Date(row.createdAt);
      return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    }
    return "other";
  }
  function periodLabelOf(key: string): string {
    if (key === "account") return "Account";
    if (key === "other") return "Other";
    const [year, month] = key.split("-").map(Number);
    return `${MONTH_NAMES[month]} ${year}`;
  }
  const groupedLedger: { key: string; label: string; rows: DisplayRow[] }[] = [];
  {
    const byKey = new Map<string, DisplayRow[]>();
    for (const row of filteredLedger) {
      const key = periodKeyOf(row);
      const list = byKey.get(key) ?? [];
      list.push(row);
      byKey.set(key, list);
    }
    // Real month keys sort newest-first ("2026-09" > "2026-08" as plain strings, since both are
    // fixed-width YYYY-MM); "other" and "account" have no real chronology, so they're pinned last.
    const keys = [...byKey.keys()].sort((a, b) => {
      if (a === "other" || a === "account") return b === "other" || b === "account" ? a.localeCompare(b) : 1;
      if (b === "other" || b === "account") return -1;
      return b.localeCompare(a);
    });
    for (const key of keys) {
      const rows = byKey.get(key)!;
      // Within a month, rows read top-to-bottom newest-first — the most recent event at the top,
      // the oldest at the bottom — matching the rest of the ledger's newest-first convention,
      // rather than grouping all charges first and payments after regardless of when each landed.
      rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      groupedLedger.push({ key, label: periodLabelOf(key), rows });
    }
  }

  /** What's still left on one row specifically — 0 for a fully paid row, the live tenant balance
   * for the synthesized current-period row (which can include carried-over arrears, not just this
   * month's rent), the full amount for the deposit-due/accrued-penalty rows (neither has ever been
   * paid against), and amount-minus-paid for a partial one. */
  function rowOutstanding(row: DisplayRow): number {
    if (row.voidedAt) return 0;
    if (row.id === "deposit-due" || row.id === "accrued-penalty") return row.amount;
    if (row.synthetic) return tenant!.owedAmount;
    // A payment linked to a charge shows what's still left on THAT charge right after it landed —
    // 0 once it's the payment that finished the charge off, not just "—" because the payment itself
    // was received in full.
    if (row.remainingAfter !== undefined) return row.remainingAfter;
    if (row.status === "partial")
      return Math.max(0, row.amount - (row.paidAmount ?? 0));
    if (row.status === "overdue" || row.status === "unpaid") return row.amount;
    return 0;
  }
  let nextDueDate = paidThrough
    ? dueDateIn(paidThrough.year, paidThrough.month + 1, dueDay)
    : tenant.status === "paid"
      ? dueDateIn(today.getFullYear(), today.getMonth() + 1, dueDay)
      : dueDateIn(today.getFullYear(), today.getMonth(), dueDay);

  // A paid-up tenant's next due date must be in the future — if it isn't (e.g. furthestPaidMonth
  // couldn't parse a month out of the ledger label, which happens for real mobile-money payments:
  // the webhook writes a plain "Rent payment" label, not LogPaymentModal's "September Rent 2026"
  // format), roll forward until it actually is. An unpaid/overdue tenant keeps the as-computed
  // date even if it's past — that's correct, it's how "overdue" is shown.
  if (tenant.status === "paid") {
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    while (nextDueDate < todayMidnight) {
      nextDueDate = dueDateIn(
        nextDueDate.getFullYear(),
        nextDueDate.getMonth() + 1,
        dueDay,
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Tenant Details"
        description="Full payment history and details for this tenant."
      />

      <div className="space-y-5 px-4 pb-10 sm:px-8">
        {/* Breadcrumb */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink hover:underline"
        >
          <ArrowLeft size={14} weight="bold" />
          Back
        </button>

        {/* Name + quick actions — the number that matters (outstanding balance) lives in the stat
            row below, not buried in a card; this row is identity only. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {tenant.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <DoorOpen size={14} weight="duotone" />
                {tenant.room ? `Unit ${tenant.room}` : "Unassigned"}
              </span>
              <span className="text-line">·</span>
              {tenant.active ? (
                <span className="flex items-center gap-1.5">
                  <CalendarBlank size={14} weight="duotone" />
                  Tenant since {formatDisplayDate(tenant.moveInDate)}
                </span>
              ) : (
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-600">
                  Moved out {formatDisplayDate(tenant.moveOutDate)}
                </span>
              )}
              {reservedRoom && (
                <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                  <BookmarkSimple size={11} weight="fill" />
                  Room {reservedRoom.number} reserved{tenant.reservationFeeCollected ? ` · ${formatCurrency(tenant.reservationFeeAmount ?? 0)} held` : ""}
                </span>
              )}
              {/* Its own tag, separate from "Outstanding balance" — a deposit that hasn't been
                  collected is never folded into that figure (it's rent-only, see owedAmount), so
                  without this a landlord had no way to see it was still owed at a glance. */}
              {tenant.depositAmount > 0 && tenant.depositStatus === "Not collected" && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  Deposit not collected · {formatCurrency(tenant.depositAmount)}
                </span>
              )}
            </div>
          </div>

          {/* Icon-only, but each carries a native tooltip (title) — hovering explains what it
              does instead of leaving a bare glyph to guess at. */}
          <div className="flex items-center gap-1.5">
            {tenant.portalToken && (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(`https://pay.instay.co/p/${tenant.portalToken}`);
                  setLinkCopied(true);
                  window.setTimeout(() => setLinkCopied(false), 1600);
                }}
                aria-label="Copy payment link"
                title={linkCopied ? "Copied!" : "Copy this tenant's payment link"}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
              >
                {linkCopied ? <CheckCircle size={16} weight="bold" className="text-emerald-600" /> : <LinkIcon size={16} weight="bold" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(`/tenants/${tenant.portalToken}/edit`)}
              aria-label="Edit details"
              title="Edit tenant details"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
            >
              <PencilSimple size={16} weight="bold" />
            </button>
            {tenant.active ? (
              <button
                type="button"
                onClick={() => setShowMoveOut(true)}
                aria-label="Move out"
                title="Move tenant out"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
              >
                <ArrowLeft size={16} weight="bold" className="rotate-180" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowReactivate(true)}
                  aria-label="Reactivate"
                  title="Reactivate tenant"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
                >
                  <CheckCircle size={16} weight="bold" />
                </button>
                {reservedRoom ? (
                  <button
                    type="button"
                    onClick={() => markReady(reservedRoom.number)}
                    aria-label="Cancel reservation"
                    title={`Cancel reservation for Room ${reservedRoom.number}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-brand transition-colors hover:bg-mist"
                  >
                    <BookmarkSimple size={16} weight="fill" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowReserve(true)}
                    aria-label="Reserve a room"
                    title="Reserve a room for this tenant"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
                  >
                    <BookmarkSimple size={16} weight="bold" />
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              aria-label="Delete tenant"
              title="Delete tenant"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Stat row — the first thing a landlord actually needs to know: do they owe money, what
            do they pay, and have they been reliable. Big numbers, no card-within-a-card. */}
        <div className="flex flex-wrap divide-x divide-line rounded-lg border border-line bg-paper max-sm:divide-x-0 max-sm:divide-y">
          <StatCard
            icon={<CurrencyCircleDollar size={13} weight="bold" />}
            label="Outstanding balance"
            value={formatCurrency(totalOwed)}
            valueClassName={
              totalOwed === 0
                ? "text-emerald-600"
                : tenant.active
                  ? "text-red-600"
                  : "text-ink"
            }
            caption={outstandingCaption(
              totalOwed,
              tenant.rentAmount,
              tenant.daysOverdue,
            )}
          />
          <StatCard
            icon={<Receipt size={13} weight="bold" />}
            label="Monthly rent"
            value={formatCurrency(tenant.rentAmount)}
          />
          <StatCard
            icon={<CalendarBlank size={13} weight="bold" />}
            label="Next due date"
            value={
              tenant.active
                ? nextDueDate.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"
            }
          />
        </div>

        <div className="min-w-0 rounded-lg border border-line bg-paper">
          <div className="flex items-center gap-1 border-b border-line px-4">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`relative px-3 py-3.5 text-sm font-medium transition-colors ${
                  tab === t ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t}
                {t === "Maintenance" && tenantReports.length > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {tenantReports.length}
                  </span>
                )}
                {tab === t && (
                  <motion.span
                    layoutId="tenant-profile-tab"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-brand"
                    transition={tabTransition}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="overflow-hidden p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={tabTransition}
              >
                {tab === "Information" && (
                  <div className="space-y-7">
                    <div>
                      <SectionLabel>Tenant information</SectionLabel>
                      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                        <Field label="Full name" value={tenant.name} />
                        <Field label="Property" value={tenant.property} />
                        <Field
                          label="Unit"
                          value={tenant.room || "Unassigned"}
                        />
                        <Field
                          label="Room type"
                          value={tenant.roomType || "—"}
                        />
                        <Field
                          label="Rent"
                          value={`${formatCurrency(tenant.rentAmount)}/mo`}
                        />
                        <Field
                          label={
                            tenant.active ? "Move-in date" : "Move-out date"
                          }
                          value={
                            (tenant.active
                              ? tenant.moveInDate
                              : tenant.moveOutDate) || "—"
                          }
                        />
                        <Field
                          label="Security deposit"
                          value={`${formatCurrency(tenant.depositAmount)} · ${tenant.depositStatus}`}
                        />
                        <Field
                          label="On-time payments"
                          value={`${tenant.onTimeCount}/${tenant.totalMonthsCount || tenant.onTimeCount} months`}
                        />
                        <Field
                          label="Phone number"
                          value={
                            tenant.phones.length === 0 ? "—" : tenant.phones[0]
                          }
                        />
                        {tenant.phones.slice(1).map((p, i) => (
                          <Field
                            key={i}
                            label={`Additional phone ${i + 2}`}
                            value={p}
                          />
                        ))}
                      </div>
                      {tenant.notes && (
                        <div className="mt-5">
                          <SectionLabel>Landlord note</SectionLabel>
                          <p className="mt-1 text-sm text-ink">
                            {tenant.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <SectionLabel>
                        Emergency contact
                        {tenant.emergencyContacts.length !== 1 ? "s" : ""}
                      </SectionLabel>
                      {tenant.emergencyContacts.length === 0 ? (
                        <p className="mt-2 text-sm text-muted">None on file.</p>
                      ) : (
                        <div className="mt-3 space-y-5">
                          {tenant.emergencyContacts.map((c, ci) => (
                            <div
                              key={c.id}
                              className={`grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 ${ci > 0 ? "border-t border-line pt-5" : ""}`}
                            >
                              <Field label="Name" value={c.name} />
                              <Field
                                label="Relationship"
                                value={relationLabel(c)}
                              />
                              <Field
                                label="Mobile"
                                value={
                                  c.phones.length === 0 ? "—" : c.phones[0]
                                }
                              />
                              {c.phones.slice(1).map((p, i) => (
                                <Field
                                  key={i}
                                  label={`Additional phone ${i + 2}`}
                                  value={p}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === "Financial ledger" && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <SectionLabel>Transactions</SectionLabel>
                      <div className="flex items-center gap-2">
                        <Select
                          value={historyFilter}
                          onChange={(v) =>
                            setHistoryFilter(v as (typeof historyFilters)[number])
                          }
                          options={historyFilters.map((f) => ({ value: f, label: f }))}
                        />
                        {/* Only shown here, on the tab it actually applies to — not in the page
                              header where it had nothing to do with the other identity actions. */}
                        {tenant.active && penaltyAmount > 0 && (
                          <Button
                            variant="warning"
                            size="sm"
                            onClick={() => setShowWaivePenalty(true)}
                          >
                            Waive penalty
                          </Button>
                        )}
                        {tenant.active && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowAdjustment(true)}
                          >
                            + Add charge/credit
                          </Button>
                        )}
                        {tenant.active && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowLogPayment(true)}
                          >
                            + Log a manual payment
                          </Button>
                        )}
                      </div>
                    </div>

                    {filteredLedger.length === 0 ? (
                      <EmptyState
                        icon={<Receipt size={22} weight="duotone" />}
                        title="No payments yet"
                        caption="Payments logged for this tenant will show up here."
                      />
                    ) : (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="text-[11px] text-muted">
                            <tr>
                              <th className="py-2 font-medium uppercase tracking-wide">
                                Item
                              </th>
                              <th className="py-2 font-medium uppercase tracking-wide">
                                Amount
                              </th>
                              <th className="py-2 font-medium uppercase tracking-wide">
                                Status
                              </th>
                              <th className="py-2 font-medium uppercase tracking-wide">
                                Paid on
                              </th>
                              <th className="py-2 font-medium uppercase tracking-wide">
                                Outstanding balance
                              </th>
                              <th className="py-2 text-right font-medium uppercase tracking-wide">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {groupedLedger.map((group) => (
                              <Fragment key={group.key}>
                                <tr className="bg-mist/60">
                                  <td colSpan={6} className="px-0.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                                    {group.label}
                                  </td>
                                </tr>
                                {group.rows.map((row) => {
                              const outstanding = rowOutstanding(row);
                              // An adjustment (addAdjustment/waivePenalty) isn't a payment being
                              // settled — it has no real paid/overdue/unpaid/partial status, so it
                              // gets its own "Charge"/"Credit" tag instead of misreading as "Paid"
                              // (the ?? "paid" fallback every real row relies on).
                              const isAdjustment = row.source === "adjustment";
                              // A payment that only partly settled its charge reads as "Partial" here, not
                              // "Paid" — it was received in full, but it didn't finish the charge, and the
                              // balance column right next to it is what actually shows how much is left.
                              const effectiveStatus: PaymentStatus =
                                row.remainingAfter !== undefined ? (row.remainingAfter > 0 ? "partial" : "paid") : (row.status ?? "paid");
                              const displayStatusLabel = row.voidedAt
                                ? "Voided"
                                : isAdjustment
                                  ? row.amount >= 0
                                    ? "Charge"
                                    : "Credit"
                                  : (row.synthetic || row.eventType === "charge") && row.status === "unpaid"
                                    ? "Due"
                                    : statusLabel[effectiveStatus];
                              const adjustmentStyle = row.amount >= 0 ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600";
                              return (
                                <tr
                                  key={row.id}
                                  className={`group transition-colors duration-200 ease-in-out hover:bg-mist ${row.voidedAt ? "opacity-50" : ""}`}
                                >
                                  <td className="py-3.5 font-medium text-ink">
                                    {/* A charge/credit's or a manual payment's reason gets folded onto the
                                        label (same convention LogPaymentModal uses for its note field), which
                                        can run long — truncate to one line instead of breaking the table's
                                        layout, and make it clickable to read the full text in a small modal. */}
                                    <button
                                      type="button"
                                      onClick={() => setViewingEntry(row)}
                                      className={`block max-w-[160px] truncate text-left align-middle decoration-dotted hover:underline sm:max-w-[280px] ${row.voidedAt ? "line-through" : ""}`}
                                      title={row.label}
                                    >
                                      {row.label}
                                    </button>
                                  </td>
                                  <td className="font-display py-3.5 text-ink">
                                    {isAdjustment
                                      ? `${row.amount >= 0 ? "+" : "−"}${formatCurrency(Math.abs(row.amount))}`
                                      : (row.eventType === "charge" || row.synthetic) && row.paidAmount !== undefined
                                        ? `${formatCurrency(row.paidAmount)} of ${formatCurrency(row.amount)}`
                                        : formatCurrency(row.amount)}
                                  </td>
                                  <td className="py-3.5">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${row.voidedAt ? "bg-gray-100 text-gray-500" : isAdjustment ? adjustmentStyle : paymentStatusStyle[effectiveStatus]}`}
                                    >
                                      {displayStatusLabel}
                                    </span>
                                  </td>
                                  <td className="py-3.5 text-muted">
                                    {row.createdAt
                                      ? new Date(
                                          row.createdAt,
                                        ).toLocaleDateString("en-GB", {
                                          day: "numeric",
                                          month: "short",
                                          year: "numeric",
                                        })
                                      : "—"}
                                  </td>
                                  <td
                                    className={`font-display py-3.5 font-medium ${outstanding > 0 ? "text-red-600" : "text-muted"}`}
                                  >
                                    {outstanding > 0
                                      ? formatCurrency(outstanding)
                                      : "—"}
                                  </td>
                                  <td className="py-3.5">
                                    {row.id === "deposit-due" ? (
                                      <div className="flex items-center justify-end">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            navigate(`/tenants/${tenant.portalToken}/edit`)
                                          }
                                          aria-label="Mark deposit collected"
                                          title="Mark deposit collected"
                                          className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-mist hover:text-ink"
                                        >
                                          <PencilSimple
                                            size={14}
                                            weight="bold"
                                          />
                                        </button>
                                      </div>
                                    ) : row.synthetic ? (
                                      <div className="flex items-center justify-end">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setShowLogPayment(true)
                                          }
                                          aria-label="Log payment for this period"
                                          title="Log payment"
                                          className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-mist hover:text-ink"
                                        >
                                          <PencilSimple
                                            size={14}
                                            weight="bold"
                                          />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${paymentMethodStyle[row.method ?? "unknown"]}`}
                                        >
                                          {
                                            paymentMethodLabel[
                                              row.method ?? "unknown"
                                            ]
                                          }
                                        </span>
                                        <span
                                          className="flex h-6 w-6 items-center justify-center text-muted"
                                          title="Confirmed"
                                        >
                                          <CheckCircle
                                            size={15}
                                            weight="fill"
                                            className="text-emerald-500"
                                          />
                                        </span>
                                        {/* Any landlord-originated entry (manual payments, adjustments,
                                            charges, penalties) can be voided — a real, gateway-verified
                                            Lenco payment can't be, from here or otherwise. Void, never
                                            delete: see voidLedgerEntry for why. */}
                                        {row.voidedAt ? null : row.source !== "lenco" ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setVoidingEntry(row)
                                            }
                                            aria-label="Void entry"
                                            title="Void this entry"
                                            className="flex h-6 w-6 items-center justify-center rounded text-muted opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100"
                                          >
                                            <Prohibit size={14} weight="bold" />
                                          </button>
                                        ) : (
                                          <span
                                            className="flex h-6 w-6 items-center justify-center text-muted"
                                            title="Verified online payment — can't be voided"
                                          >
                                            <Lock size={14} weight="bold" />
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                                  );
                                })}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {tab === "Maintenance" && (
                  <div>
                    {tenantReports.length === 0 ? (
                      <EmptyState
                        icon={<Wrench size={22} weight="duotone" />}
                        title="No maintenance reports"
                        caption="Reports this tenant files will show up here."
                      />
                    ) : (
                      <div className="divide-y divide-line">
                        {tenantReports.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => navigate("/maintenance")}
                            className="flex w-full items-start justify-between gap-3 py-3 text-left transition-colors hover:bg-mist"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink">
                                {r.location}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted">
                                {r.description}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted">
                                {new Date(r.submittedAt).toLocaleDateString(
                                  "en-GB",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${maintenanceStatusStyle[r.status]}`}
                            >
                              {maintenanceStatusLabel[r.status]}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "Documents" && (
                  <div>
                    <input
                      ref={documentInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void handleUploadDocuments(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <SectionLabel>Documents</SectionLabel>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => documentInputRef.current?.click()}
                        disabled={uploadingDocs}
                      >
                        <Paperclip size={14} weight="bold" />
                        {uploadingDocs ? "Uploading…" : "Attach a document"}
                      </Button>
                    </div>
                    {documentsError && (
                      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                        {documentsError}
                      </p>
                    )}
                    {documentsLoading ? (
                      <div className="mt-4 space-y-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : documents.length === 0 ? (
                      <EmptyState
                        icon={<FileText size={22} weight="duotone" />}
                        title="No documents yet"
                        caption="Tenancy agreement, national ID, acceptance letter — anything worth keeping on file."
                      />
                    ) : (
                      <ul className="mt-4 divide-y divide-line">
                        {documents.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex items-center justify-between gap-3 py-3"
                          >
                            <a
                              href={doc.url ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="flex min-w-0 items-center gap-2.5 text-sm text-ink hover:underline"
                            >
                              <FileText
                                size={18}
                                weight="duotone"
                                className="shrink-0 text-muted"
                              />
                              <span className="truncate font-medium">
                                {doc.name}
                              </span>
                              <span className="shrink-0 text-xs text-muted">
                                {formatBytes(doc.sizeBytes)} ·{" "}
                                {new Date(doc.createdAt).toLocaleDateString(
                                  "en-GB",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </span>
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleDeleteDocument(doc)}
                              aria-label={`Delete ${doc.name}`}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash size={14} weight="bold" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showDelete && (
          <ConfirmDeleteTenantModal
            tenant={tenant}
            onClose={() => setShowDelete(false)}
            onConfirm={() => {
              deleteTenant(tenant.id);
              navigate("/tenants");
            }}
          />
        )}
        {showMoveOut && (
          <MoveOutModal
            tenant={tenant}
            onClose={() => setShowMoveOut(false)}
            onConfirm={(details) => {
              moveOutTenant(tenant.id, details);
              setShowMoveOut(false);
            }}
          />
        )}
        {showReactivate && (
          <ReactivateTenantModal
            tenant={tenant}
            onClose={() => setShowReactivate(false)}
            onConfirm={(newMoveInDate) => {
              reactivateTenant(tenant.id, newMoveInDate);
              setShowReactivate(false);
            }}
          />
        )}
        {showReserve && (
          <ReserveRoomModal
            tenant={tenant}
            onClose={() => setShowReserve(false)}
            onConfirm={({ room, feeAmount, feeMethod, feeDate }) => {
              reserveRoom(room, tenant.id);
              updateTenant(tenant.id, {
                reservationFeeAmount: feeAmount,
                reservationFeeMethod: feeMethod,
                reservationFeeDate: feeDate,
                reservationFeeCollected: true,
              });
              setShowReserve(false);
            }}
          />
        )}
        {showLogPayment && (
          <LogPaymentModal
            tenantName={tenant.name}
            room={tenant.room}
            outstanding={totalOwed || tenant.rentAmount}
            rentAmount={tenant.rentAmount}
            ledger={tenant.ledger}
            onClose={() => setShowLogPayment(false)}
            onConfirm={(payments) => {
              logPayments(
                tenant.id,
                payments.map((payment) => ({
                  amount: payment.amount,
                  label: payment.label,
                  method: payment.method === "mobile" ? "mobile-money" : "cash",
                  paidAt: payment.date,
                })),
              );
              setShowLogPayment(false);
            }}
          />
        )}
        {showAdjustment && (
          <AdjustmentModal
            tenantName={tenant.name}
            room={tenant.room}
            onClose={() => setShowAdjustment(false)}
            onConfirm={(input) => {
              addAdjustment(tenant.id, input);
              setShowAdjustment(false);
            }}
          />
        )}
        {showWaivePenalty && (
          <WaivePenaltyModal
            tenantName={tenant.name}
            room={tenant.room}
            penaltyAmount={penaltyAmount}
            daysOverdue={tenant.daysOverdue ?? 0}
            onClose={() => setShowWaivePenalty(false)}
            onConfirm={(reason) => {
              waivePenalty(tenant.id, reason);
              setShowWaivePenalty(false);
            }}
          />
        )}
        {viewingEntry && (
          <Modal onClose={() => setViewingEntry(null)} title="Entry details" maxWidth="max-w-sm">
            <p className="text-sm text-ink">{viewingEntry.label}</p>
            <p className="mt-3 text-xs text-muted">
              {formatCurrency(Math.abs(viewingEntry.amount))}
              {viewingEntry.createdAt
                ? ` — ${new Date(viewingEntry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                : ""}
            </p>
          </Modal>
        )}
        {voidingEntry && (
          <ConfirmVoidLedgerEntryModal
            entry={voidingEntry}
            onClose={() => setVoidingEntry(null)}
            onConfirm={async (reason) => {
              await voidLedgerEntry(tenant.id, voidingEntry.id, reason);
              setVoidingEntry(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
