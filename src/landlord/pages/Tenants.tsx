import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import Modal from "../components/Modal";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantFormDrawer from "../components/TenantFormDrawer";
import { useTenants, formatCurrency, type DepositStatus, type PaymentStatus, type Tenant } from "../TenantsContext";
import { MagnifyingGlass, PencilSimple, Trash, WhatsappLogo, UsersThree } from "@phosphor-icons/react";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

function EditIcon() {
  return <PencilSimple size={14} weight="duotone" />;
}

function TrashIcon() {
  return <Trash size={14} weight="duotone" />;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Zambian mobile numbers stored as "0977 123 456" -> wa.me needs "260977123456". */
function whatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "");
  return `https://wa.me/260${digits}`;
}

const statusStyle: Record<PaymentStatus, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};

const statusLabel: Record<PaymentStatus, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };

const historyFilters = ["All", "Paid", "Overdue", "Partial"] as const;
const HISTORY_PAGE_SIZE = 5;

function TenantDrawer({
  tenant,
  onClose,
  onLogPayment,
  onMoveOut,
  onReactivate,
  onEdit,
}: {
  tenant: Tenant;
  onClose: () => void;
  onLogPayment: () => void;
  onMoveOut: () => void;
  onReactivate: () => void;
  onEdit: () => void;
}) {
  const [historyFilter, setHistoryFilter] = useState<(typeof historyFilters)[number]>("All");
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const filteredLedger = tenant.ledger.filter((row) => historyFilter === "All" || statusLabel[row.status ?? "paid"] === historyFilter);
  const visibleLedger = historyExpanded ? filteredLedger : filteredLedger.slice(0, HISTORY_PAGE_SIZE);

  return (
    <SlideOver
      onClose={onClose}
      title={tenant.name}
      description={`${tenant.room} · ${tenant.property}`}
      headerActions={
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit tenant"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <EditIcon />
        </button>
      }
      footer={
        tenant.active ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onLogPayment}
              className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
            >
              Log payment
            </button>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={whatsAppLink(tenant.phone)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-line py-2.5 text-sm font-medium text-ink hover:bg-mist"
              >
                <WhatsappLogo size={16} weight="fill" />
                Remind
              </a>
              <button
                type="button"
                onClick={onMoveOut}
                className="rounded-lg border border-line py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Move out
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onReactivate}
            className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
          >
            Reactivate tenant
          </button>
        )
      }
    >
      <div className="space-y-1 text-sm text-muted">
        <p>{tenant.phone}</p>
        <p>
          Parent/guardian: {tenant.guardianName} · {tenant.guardianPhone}
        </p>
        {!tenant.active && tenant.moveOutDate && <p>Moved out: {tenant.moveOutDate}</p>}
      </div>

      {tenant.notes && (
        <div className="mt-4 rounded-lg bg-mist px-3.5 py-2.5 text-sm text-ink">
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Landlord note</p>
          {tenant.notes}
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line bg-mist p-3">
          <p className="text-[11px] text-muted">Outstanding</p>
          <p className="mt-1 text-sm font-semibold text-ink">{formatCurrency(tenant.owedAmount)}</p>
        </div>
        <div className="rounded-lg border border-line bg-mist p-3">
          <p className="text-[11px] text-muted">Deposit</p>
          <p className="mt-1 text-sm font-semibold text-ink">{tenant.depositStatus}</p>
        </div>
        <div className="rounded-lg border border-line bg-mist p-3">
          <p className="text-[11px] text-muted">Paid on time</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {tenant.onTimeCount} of {tenant.totalMonthsCount || tenant.onTimeCount} months
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-mist p-3">
        <p className="text-[11px] text-muted">Deposit detail</p>
        <p className="mt-1 text-sm text-ink">
          {formatCurrency(tenant.depositAmount)} · paid {tenant.depositDate} · {tenant.depositMethod === "mobile" ? "Mobile money" : "Cash"}
        </p>
        {tenant.depositResolutionNote && <p className="mt-1 text-xs text-muted">{tenant.depositResolutionNote}</p>}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Payment history</p>
        <select
          value={historyFilter}
          onChange={(e) => {
            setHistoryFilter(e.target.value as (typeof historyFilters)[number]);
            setHistoryExpanded(false);
          }}
          className="rounded-lg border border-line bg-paper px-2 py-1 text-xs font-medium text-ink outline-none"
        >
          {historyFilters.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </div>
      <div className="mt-2 divide-y divide-line rounded-lg border border-line">
        {filteredLedger.length === 0 && <p className="px-3.5 py-4 text-sm text-muted">No payments recorded yet.</p>}
        {visibleLedger.map((row, i) => (
          <div key={`${row.label}-${i}`} className="flex items-center justify-between px-3.5 py-2.5">
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
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusStyle[row.status]}`}>
                  {statusLabel[row.status]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {filteredLedger.length > HISTORY_PAGE_SIZE && (
        <button
          type="button"
          onClick={() => setHistoryExpanded((v) => !v)}
          className="mt-2 w-full rounded-lg py-2 text-xs font-medium text-brand hover:bg-mist"
        >
          {historyExpanded ? "Show fewer" : `Show all ${filteredLedger.length} payments`}
        </button>
      )}
    </SlideOver>
  );
}

function ConfirmDeleteModal({
  tenant,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Delete tenant?"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
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
        This will permanently remove <span className="font-medium text-ink">{tenant.name}</span> and their payment history. This
        can't be undone.
      </p>
    </Modal>
  );
}

function MoveOutModal({
  tenant,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: (details: { moveOutDate: string; depositStatus: DepositStatus; depositResolutionNote: string }) => void;
}) {
  const [moveOutDate, setMoveOutDate] = useState(todayISO());
  const [depositStatus, setDepositStatus] = useState<DepositStatus>("Refunded");
  const [note, setNote] = useState("");

  const options: DepositStatus[] = ["Refunded", "Partially refunded", "Forfeited"];

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-md"
      title="Move out tenant"
      description={`${tenant.name} · ${tenant.room}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const resolutionNote =
                note.trim() ||
                (depositStatus === "Refunded"
                  ? "Refunded in full."
                  : depositStatus === "Forfeited"
                    ? "Forfeited — no reason given."
                    : "Partially refunded — no reason given.");
              onConfirm({ moveOutDate: new Date(moveOutDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), depositStatus, depositResolutionNote: resolutionNote });
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper"
          >
            Confirm move out
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Move-out date</label>
          <input
            type="date"
            value={moveOutDate}
            onChange={(e) => setMoveOutDate(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Deposit outcome</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setDepositStatus(o)}
                className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                  depositStatus === o ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Reason / notes</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={depositStatus === "Refunded" ? "Optional — e.g. no damage, full deposit returned." : "e.g. K200 deducted for cleaning."}
            className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
      </div>
    </Modal>
  );
}

function ReactivateModal({
  tenant,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: (newMoveInDate: string) => void;
}) {
  const [moveInDate, setMoveInDate] = useState(todayISO());

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Reactivate tenant"
      description={`${tenant.name} · ${tenant.room}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(new Date(moveInDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper"
          >
            Reactivate
          </button>
        </div>
      }
    >
      <label className="mb-1.5 block text-xs font-medium text-muted">New move-in date</label>
      <input
        type="date"
        value={moveInDate}
        onChange={(e) => setMoveInDate(e.target.value)}
        className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
      />
    </Modal>
  );
}

export default function Tenants() {
  const { tenants, deleteTenant, moveOutTenant, reactivateTenant, logPayment } = useTenants();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "moved-out">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showLogPayment, setShowLogPayment] = useState(false);
  const [showMoveOut, setShowMoveOut] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);

  const selected = tenants.find((t) => t.id === selectedId) ?? null;
  const editing = tenants.find((t) => t.id === editingId) ?? null;
  const deleting = tenants.find((t) => t.id === deletingId) ?? null;

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const matchesQuery = t.name.toLowerCase().includes(query.toLowerCase()) || t.room.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "active" ? t.active : !t.active;
      return matchesQuery && matchesStatus;
    });
  }, [tenants, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Arriving from elsewhere in the app — open a specific tenant's drawer, or the Add tenant
  // drawer, then drop the state so navigating back here later doesn't reopen it.
  useEffect(() => {
    const state = location.state as { openTenantId?: string; openAddTenant?: boolean } | null;
    if (state?.openTenantId) {
      setSelectedId(state.openTenantId);
      navigate(location.pathname, { replace: true, state: null });
    } else if (state?.openAddTenant) {
      setShowAdd(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  return (
    <>
      <PageHeader title="Tenants" />

      <div className="space-y-4 px-4 sm:px-8 pb-10">
        {/* Top actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted opacity-50"
          >
            Export all data
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
          >
            + Add tenant
          </button>
        </div>

        <div className="rounded-lg border border-line bg-paper">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name or room"
                className="w-52 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>

            <div className="ml-auto flex rounded-lg border border-line p-0.5">
              {(["active", "moved-out"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatusFilter(s);
                    setPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === s ? "bg-ink text-paper" : "text-muted hover:bg-mist"
                  }`}
                >
                  {s === "active" ? "Active" : "Moved out"}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile: cards — an HTML table doesn't have room to breathe on a phone screen */}
          <div className="divide-y divide-line md:hidden">
            {pageRows.map((t) => (
              <div key={t.id} onClick={() => setSelectedId(t.id)} className="p-4 transition-colors active:bg-mist">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {t.room} · {t.property}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                    {statusLabel[t.status]}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{formatCurrency(t.rentAmount)}</p>
                    <p className="mt-0.5 text-[11px] text-muted">Moved in {t.moveInDate}</p>
                  </div>
                  <div className="flex items-center gap-2 text-muted">
                    <button
                      type="button"
                      aria-label="Edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(t.id);
                      }}
                      className="rounded-lg border-2 border-gray-200 p-2 transition-colors hover:text-ink"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(t.id);
                      }}
                      className="rounded-lg border-2 border-gray-200 p-2 transition-colors hover:text-red-600"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {pageRows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <UsersThree size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">
                    {tenants.length === 0 ? "No tenants yet" : statusFilter === "active" ? "No active tenants" : "No moved-out tenants"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {tenants.length === 0 ? "Add your first tenant to get started." : "Try a different search or tab."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Desktop / tablet: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-mist text-[11px] text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Property</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Room</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Move-in date</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Rent</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">This month</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="cursor-pointer border-t border-line transition-colors hover:bg-mist"
                  >
                    <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                    <td className="px-4 py-3 text-muted">{t.property}</td>
                    <td className="px-4 py-3 text-muted">{t.room}</td>
                    <td className="px-4 py-3 text-muted">{t.moveInDate}</td>
                    <td className="px-4 py-3 text-muted">{formatCurrency(t.rentAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                        {statusLabel[t.status]}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-center gap-3 text-muted">
                        <button
                          type="button"
                          aria-label="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(t.id);
                          }}
                          className="transition-colors border-2 border-gray-200 p-2 rounded-lg hover:text-ink"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(t.id);
                          }}
                          className="transition-colors border-2 border-gray-200 p-2 rounded-lg hover:text-red-600"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                          <UsersThree size={22} weight="duotone" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            {tenants.length === 0
                              ? "No tenants yet"
                              : statusFilter === "active"
                                ? "No active tenants"
                                : "No moved-out tenants"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {tenants.length === 0
                              ? "Add your first tenant to get started."
                              : "Try a different search or tab."}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
        </div>
      </div>

      <AnimatePresence>
        {selected && !editingId && (
          <TenantDrawer
            key={selected.id}
            tenant={selected}
            onClose={() => setSelectedId(null)}
            onLogPayment={() => setShowLogPayment(true)}
            onEdit={() => setEditingId(selected.id)}
            onMoveOut={() => setShowMoveOut(true)}
            onReactivate={() => setShowReactivate(true)}
          />
        )}
        {showAdd && <TenantFormDrawer editing={null} onClose={() => setShowAdd(false)} />}
        {editing && <TenantFormDrawer editing={editing} onClose={() => setEditingId(null)} />}
        {deleting && (
          <ConfirmDeleteModal
            tenant={deleting}
            onClose={() => setDeletingId(null)}
            onConfirm={() => {
              deleteTenant(deleting.id);
              setDeletingId(null);
              setSelectedId((prev) => (prev === deleting.id ? null : prev));
            }}
          />
        )}
        {showMoveOut && selected && (
          <MoveOutModal
            tenant={selected}
            onClose={() => setShowMoveOut(false)}
            onConfirm={(details) => {
              moveOutTenant(selected.id, details);
              setShowMoveOut(false);
              setSelectedId(null);
            }}
          />
        )}
        {showReactivate && selected && (
          <ReactivateModal
            tenant={selected}
            onClose={() => setShowReactivate(false)}
            onConfirm={(newMoveInDate) => {
              reactivateTenant(selected.id, newMoveInDate);
              setShowReactivate(false);
              setSelectedId(null);
            }}
          />
        )}
        {showLogPayment && selected && (
          <LogPaymentModal
            tenantName={selected.name}
            room={selected.room}
            outstanding={selected.owedAmount || selected.rentAmount}
            onClose={() => setShowLogPayment(false)}
            onConfirm={() => {
              logPayment(selected.id, selected.owedAmount || selected.rentAmount);
              setShowLogPayment(false);
              setSelectedId(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
