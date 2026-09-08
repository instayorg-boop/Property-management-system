import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  PencilSimple,
  DotsThreeVertical,
  Trash,
  CheckCircle,
  WarningCircle,
  CaretDown,
  Wallet,
  ShieldCheck,
  CalendarCheck,
  Wrench,
  Receipt,
  UsersThree,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Avatar from "../components/Avatar";
import SectionLabel from "../components/SectionLabel";
import MetricCard from "../components/MetricCard";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import TenantFormDrawer from "../components/TenantFormDrawer";
import MoveOutModal from "../components/MoveOutModal";
import LogPaymentModal from "../components/LogPaymentModal";
import ConfirmDeleteTenantModal from "../components/ConfirmDeleteTenantModal";
import ReactivateTenantModal from "../components/ReactivateTenantModal";
import { useTenants, formatCurrency, relationLabel, type PaymentStatus } from "../TenantsContext";
import { useMaintenance } from "../MaintenanceContext";

const statusLabel: Record<PaymentStatus, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };
const paymentStatusStyle: Record<PaymentStatus, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};
const maintenanceStatusStyle: Record<string, string> = {
  open: "bg-red-50 text-red-600",
  "in-progress": "bg-amber-50 text-amber-600",
  resolved: "bg-emerald-50 text-emerald-600",
};
const maintenanceStatusLabel: Record<string, string> = { open: "Open", "in-progress": "In progress", resolved: "Resolved" };

const historyFilters = ["All", "Paid", "Overdue", "Partial"] as const;
const tabs = ["Profile", "Payment history", "Maintenance"] as const;
type Tab = (typeof tabs)[number];

const tabTransition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function EmptyState({ icon, title, caption }: { icon: React.ReactNode; title: string; caption: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">{icon}</span>
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
      <PageHeader title="Tenants" />
      <div className="space-y-4 px-4 pb-10 sm:px-8">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-paper p-5">
              <div className="flex flex-col items-center">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="mt-3 h-4 w-32" />
                <Skeleton className="mt-1.5 h-3 w-24" />
              </div>
              <div className="mt-5 space-y-2.5 border-t border-line pt-4">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-line bg-paper p-3.5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-line bg-paper">
            <div className="flex items-center gap-4 border-b border-line px-4 py-3.5">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={4} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TenantProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenants, isReady, deleteTenant, moveOutTenant, reactivateTenant, logPayment } = useTenants();
  const { reports } = useMaintenance();

  const [tab, setTab] = useState<Tab>("Profile");
  const [historyFilter, setHistoryFilter] = useState<(typeof historyFilters)[number]>("All");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showLogPayment, setShowLogPayment] = useState(false);
  const [showMoveOut, setShowMoveOut] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const tenant = tenants.find((t) => t.id === id) ?? null;

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
            <Link to="/tenants" className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
              Back to tenants
            </Link>
          </div>
        </div>
      </>
    );
  }

  const tenantReports = reports.filter((r) => r.tenant === tenant.name);
  const filteredLedger = tenant.ledger.filter((row) => historyFilter === "All" || statusLabel[row.status ?? "paid"] === historyFilter);

  return (
    <>
      <PageHeader title="Tenants" />

      <div className="space-y-4 px-4 pb-10 sm:px-8">
        {/* Breadcrumb + primary action */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Link to="/tenants" className="flex items-center gap-1.5 text-muted transition-colors hover:text-ink">
              <ArrowLeft size={14} weight="bold" />
              Tenants
            </Link>
            <span className="text-line">/</span>
            <span className="font-medium text-ink">{tenant.name}</span>
          </div>
          {tenant.active && (
            <button
              type="button"
              onClick={() => setShowLogPayment(true)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
            >
              + Log payment
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_1fr]">
          {/* Left: identity card + stats — each sized to its own content, not stretched to match the tabs panel */}
          <div className="space-y-4">
            <div className="relative rounded-lg border border-line bg-paper p-5">
              <div className="absolute top-3 right-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="More actions"
                  aria-expanded={menuOpen}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
                >
                  <DotsThreeVertical size={16} weight="bold" />
                </button>
                {menuOpen && (
                  <div className="absolute top-full right-0 z-10 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-paper py-1 shadow-card">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowEdit(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-mist"
                    >
                      <PencilSimple size={13} weight="bold" />
                      Edit details
                    </button>
                    {tenant.active ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowMoveOut(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-mist"
                      >
                        <ArrowLeft size={13} weight="bold" className="rotate-180" />
                        Move out
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowReactivate(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-mist"
                      >
                        <CheckCircle size={13} weight="bold" />
                        Reactivate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowDelete(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash size={13} weight="bold" />
                      Delete tenant
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center text-center">
                <Avatar name={tenant.name} size={64} />
                <p className="mt-3 text-base font-semibold text-ink">{tenant.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {tenant.active ? `Tenant since ${tenant.moveInDate}` : `Moved out ${tenant.moveOutDate ?? ""}`}
                </p>
              </div>

              <div className="mt-5 space-y-1 border-t border-line pt-4">
                <InfoRow label="Room" value={tenant.room || "Unassigned"} />
                <InfoRow label="Room type" value={tenant.roomType || "—"} />
                <InfoRow
                  label={tenant.phones.length > 1 ? "Phones" : "Phone"}
                  value={
                    tenant.phones.length === 0 ? (
                      "—"
                    ) : (
                      <div className="space-y-0.5">
                        {tenant.phones.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    )
                  }
                />
              </div>
            </div>

            <MetricCard
              compact
              icon={<Wallet size={16} weight="duotone" />}
              label="Amount owed"
              value={formatCurrency(tenant.owedAmount)}
              caption={tenant.active ? statusLabel[tenant.status] : undefined}
              tone={tenant.owedAmount === 0 ? "success" : tenant.active ? "danger" : "default"}
            />
            <MetricCard
              compact
              icon={<ShieldCheck size={16} weight="duotone" />}
              label="Deposit"
              value={formatCurrency(tenant.depositAmount)}
              caption={`${tenant.depositStatus} · ${tenant.depositMethod === "mobile" ? "mobile money" : tenant.depositMethod}`}
            />
            <MetricCard
              compact
              icon={<CalendarCheck size={16} weight="duotone" />}
              label="On-time payments"
              value={`${tenant.onTimeCount}/${tenant.totalMonthsCount || tenant.onTimeCount}`}
              caption="months paid on time"
            />
          </div>

          {/* Right: tabs — sized purely to its own content (items-start above stops grid row-stretch) */}
          <div className="rounded-lg border border-line bg-paper">
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
                    <motion.span layoutId="tenant-profile-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-brand" transition={tabTransition} />
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
                  {tab === "Profile" && (
                    <div className="space-y-6">
                      <div>
                        <SectionLabel>Tenant information</SectionLabel>
                        <div className="mt-2 divide-y divide-line">
                          <InfoRow label="Property" value={tenant.property} />
                          <InfoRow label="Room" value={tenant.room || "Unassigned"} />
                          <InfoRow label="Room type" value={tenant.roomType || "—"} />
                          <InfoRow label="Rent" value={`${formatCurrency(tenant.rentAmount)}/mo`} />
                          <InfoRow label="Move-in date" value={tenant.moveInDate || "—"} />
                          {!tenant.active && <InfoRow label="Move-out date" value={tenant.moveOutDate ?? "—"} />}
                        </div>
                        {tenant.notes && (
                          <div className="mt-4">
                            <SectionLabel>Landlord note</SectionLabel>
                            <p className="mt-1 text-sm text-ink">{tenant.notes}</p>
                          </div>
                        )}
                      </div>

                      <div>
                        <SectionLabel>Emergency contact{tenant.emergencyContacts.length !== 1 ? "s" : ""}</SectionLabel>
                        {tenant.emergencyContacts.length === 0 ? (
                          <p className="mt-2 text-sm text-muted">None on file.</p>
                        ) : (
                          <div className="mt-2 space-y-3">
                            {tenant.emergencyContacts.map((c) => (
                              <div key={c.id} className="rounded-lg border border-line p-3">
                                <p className="text-sm font-medium text-ink">
                                  {c.name} <span className="font-normal text-muted">· {relationLabel(c)}</span>
                                </p>
                                <div className="mt-1 space-y-0.5">
                                  {c.phones.length === 0 && <p className="text-xs text-muted">No phone on file</p>}
                                  {c.phones.map((p, i) => (
                                    <p key={i} className="text-xs text-muted">
                                      {p}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {tab === "Payment history" && (
                    <div>
                      <div className={`flex items-start gap-2.5 rounded-lg px-4 py-3 ${tenant.owedAmount === 0 ? "bg-emerald-50" : "bg-amber-50"}`}>
                        {tenant.owedAmount === 0 ? (
                          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" />
                        ) : (
                          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
                        )}
                        <div>
                          <p className={`text-sm font-semibold ${tenant.owedAmount === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                            {tenant.owedAmount === 0 ? "Fully paid up" : `${formatCurrency(tenant.owedAmount)} owed`}
                          </p>
                          <p className={`text-xs ${tenant.owedAmount === 0 ? "text-emerald-700/70" : "text-amber-700/70"}`}>
                            Paid on time {tenant.onTimeCount} of {tenant.totalMonthsCount || tenant.onTimeCount} months
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-2">
                        <SectionLabel>Transactions</SectionLabel>
                        <div className="relative">
                          <select
                            value={historyFilter}
                            onChange={(e) => setHistoryFilter(e.target.value as (typeof historyFilters)[number])}
                            className="appearance-none rounded-md py-1 pr-5 pl-1 text-xs font-medium text-muted outline-none hover:text-ink"
                          >
                            {historyFilters.map((f) => (
                              <option key={f}>{f}</option>
                            ))}
                          </select>
                          <CaretDown size={10} weight="bold" className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-muted" />
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
                                <th className="py-2 font-medium uppercase tracking-wide">Label</th>
                                <th className="py-2 font-medium uppercase tracking-wide">Date</th>
                                <th className="py-2 font-medium uppercase tracking-wide">Status</th>
                                <th className="py-2 text-right font-medium uppercase tracking-wide">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {filteredLedger.map((row, i) => (
                                <tr key={`${row.label}-${i}`}>
                                  <td className="py-2.5 text-ink">{row.label}</td>
                                  <td className="py-2.5 text-muted">
                                    {row.createdAt
                                      ? new Date(row.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                                      : "—"}
                                  </td>
                                  <td className="py-2.5">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentStatusStyle[row.status ?? "paid"]}`}>
                                      {statusLabel[row.status ?? "paid"]}
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-right text-ink">
                                    {row.paidAmount !== undefined ? `${formatCurrency(row.paidAmount)} of ${formatCurrency(row.amount)}` : formatCurrency(row.amount)}
                                  </td>
                                </tr>
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
                                <p className="text-sm font-medium text-ink">{r.location}</p>
                                <p className="mt-0.5 truncate text-xs text-muted">{r.description}</p>
                                <p className="mt-0.5 text-[11px] text-muted">
                                  {new Date(r.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${maintenanceStatusStyle[r.status]}`}>
                                {maintenanceStatusLabel[r.status]}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showEdit && <TenantFormDrawer editing={tenant} onClose={() => setShowEdit(false)} />}
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
        {showLogPayment && (
          <LogPaymentModal
            tenantName={tenant.name}
            room={tenant.room}
            outstanding={tenant.owedAmount || tenant.rentAmount}
            onClose={() => setShowLogPayment(false)}
            onConfirm={() => {
              logPayment(tenant.id, tenant.owedAmount || tenant.rentAmount);
              setShowLogPayment(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
