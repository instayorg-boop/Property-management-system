import { useState } from "react";
import { Phone, NotePencil, Plus, CaretDown, CheckCircle, WarningCircle, PencilSimple } from "@phosphor-icons/react";
import SlideOver from "./SlideOver";
import { useTenants, formatCurrency, type Tenant } from "../TenantsContext";
import { useSettings } from "../SettingsContext";

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The dueDay-th of the given month, clamped to that month's length (e.g. dueDay 30 in February). */
function dueDateIn(year: number, monthIndex0: number, dueDay: number) {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  return new Date(year, monthIndex0, Math.min(dueDay, lastDay));
}

const historyFilters = ["All", "Paid", "Overdue", "Partial"] as const;
const HISTORY_PAGE_SIZE = 5;

const ledgerStatusStyle: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};

const ledgerStatusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };

export default function TenantPaymentDrawer({
  tenant,
  onClose,
  onLogPayment,
  onEdit,
  onMoveOut,
}: {
  tenant: Tenant;
  onClose: () => void;
  onLogPayment: () => void;
  onEdit: () => void;
  onMoveOut: () => void;
}) {
  const { updateTenant } = useTenants();
  const { dueDay } = useSettings();
  const [historyFilter, setHistoryFilter] = useState<(typeof historyFilters)[number]>("All");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(!!tenant.notes);
  const [note, setNote] = useState(tenant.notes);

  const filteredLedger = tenant.ledger.filter((row) => historyFilter === "All" || ledgerStatusLabel[row.status ?? "paid"] === historyFilter);
  const visibleLedger = historyExpanded ? filteredLedger : filteredLedger.slice(0, HISTORY_PAGE_SIZE);

  const today = new Date();
  const paidUp = tenant.status === "paid";
  const nextDue = dueDateIn(today.getFullYear(), today.getMonth() + 1, dueDay);
  const currentDue = dueDateIn(today.getFullYear(), today.getMonth(), dueDay);
  const overdueSince = tenant.daysOverdue ? new Date(today.getTime() - tenant.daysOverdue * 86400000) : null;

  return (
    <SlideOver
      onClose={onClose}
      title={tenant.name}
      description={`${tenant.room} · ${tenant.roomType}`}
      headerActions={
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit tenant"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <PencilSimple size={14} weight="duotone" />
        </button>
      }
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onMoveOut}
            className="rounded-lg border border-red-200 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Move out
          </button>
          <button
            type="button"
            onClick={onLogPayment}
            className="rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
          >
            Log payment
          </button>
        </div>
      }
    >
      {/* Status — the first and most prominent thing on the page */}
      <div className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3.5 ${paidUp ? "bg-emerald-50" : "bg-amber-50"}`}>
        <div>
          <p className={`text-sm font-semibold ${paidUp ? "text-emerald-700" : "text-amber-700"}`}>
            {paidUp
              ? `Paid up for ${monthLabel(today)}`
              : overdueSince
                ? `${formatCurrency(tenant.owedAmount)} overdue since ${formatDate(overdueSince)}`
                : `${formatCurrency(tenant.owedAmount)} due`}
          </p>
          <p className={`mt-0.5 text-xs ${paidUp ? "text-emerald-700/70" : "text-amber-700/70"}`}>
            {paidUp ? `Next due ${formatDate(nextDue)}` : overdueSince ? `${tenant.daysOverdue} days overdue` : `Due ${formatDate(currentDue)}`}
          </p>
        </div>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${paidUp ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
          {paidUp ? <CheckCircle size={16} weight="duotone" /> : <WarningCircle size={16} weight="duotone" />}
        </span>
      </div>

      {/* Quick actions — one tap, no leaving this screen */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <a
          href={`tel:${tenant.phones[0] ?? ""}`}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-paper py-2.5 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-mist"
        >
          <Phone size={15} weight="duotone" />
          Call
        </a>
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-paper py-2.5 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-mist"
        >
          <NotePencil size={15} weight="duotone" />
          Add note
        </button>
        <button
          type="button"
          onClick={onLogPayment}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand py-2.5 text-sm font-medium text-paper shadow-sm transition-transform hover:scale-[1.02]"
        >
          <Plus size={15} weight="duotone" />
          Log payment
        </button>
      </div>

      {/* Note to self — free text, tucked away until "Add note" is tapped */}
      {noteOpen && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted">Note to self</p>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== tenant.notes) updateTenant(tenant.id, { notes: note });
            }}
            rows={3}
            placeholder="e.g. usually pays on the 3rd, prefers mobile money"
            className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
          />
        </div>
      )}

      {/* Facts — the numbers a landlord glances at */}
      <div className="mt-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Monthly rent</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(tenant.rentAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Lease started</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{tenant.moveInDate}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">On-time record</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">
            {tenant.onTimeCount} of {tenant.totalMonthsCount || tenant.onTimeCount} months
          </p>
        </div>
      </div>

      {/* Payment history — hairlines only */}
      <div className="mt-6 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Payment history</p>
        <div className="relative">
          <select
            value={historyFilter}
            onChange={(e) => {
              setHistoryFilter(e.target.value as (typeof historyFilters)[number]);
              setHistoryExpanded(false);
            }}
            className="appearance-none rounded-md py-1 pr-5 pl-1 text-xs font-medium text-muted outline-none hover:text-ink"
          >
            {historyFilters.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <CaretDown size={10} weight="duotone" className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-muted" />
        </div>
      </div>
      <div className="mt-1 divide-y divide-line">
        {filteredLedger.length === 0 && <p className="py-4 text-sm text-muted">No payments recorded yet.</p>}
        {visibleLedger.map((row, i) => (
          <div key={`${row.label}-${i}`} className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-ink">{row.label}</span>
              {row.label.toLowerCase().includes("pro-rata") && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">Pro-rata</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">
                {row.paidAmount !== undefined ? `${formatCurrency(row.paidAmount)} of ${formatCurrency(row.amount)}` : formatCurrency(row.amount)}
              </span>
              {row.status && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ledgerStatusStyle[row.status]}`}>
                  {ledgerStatusLabel[row.status]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {filteredLedger.length > HISTORY_PAGE_SIZE && (
        <button type="button" onClick={() => setHistoryExpanded((v) => !v)} className="mt-2 text-xs font-medium text-brand hover:underline">
          {historyExpanded ? "Show fewer" : "Show earlier months"}
        </button>
      )}
    </SlideOver>
  );
}
