import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/PageHeader";
import Avatar from "../components/Avatar";
import TenantFormDrawer from "../components/TenantFormDrawer";
import ConfirmDeleteTenantModal from "../components/ConfirmDeleteTenantModal";
import { useTenants, formatCurrency, type PaymentStatus, type Tenant } from "../TenantsContext";
import { MagnifyingGlass, Trash, WhatsappLogo, UsersThree, SquaresFour, Rows, DotsThreeVertical } from "@phosphor-icons/react";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { Skeleton, SkeletonRow } from "../components/Skeleton";

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

function TrashIcon() {
  return <Trash size={14} weight="duotone" />;
}

/** Zambian mobile numbers stored as "0977 123 456" -> wa.me needs "260977123456". */
function whatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "");
  return `https://wa.me/260${digits}`;
}

const statusLabel: Record<PaymentStatus, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };
const paymentStatusStyle: Record<PaymentStatus, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};

/** Small "···" menu for the one destructive action a card doesn't want as a permanent button. */
function CardMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="More actions"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
      >
        <DotsThreeVertical size={16} weight="bold" />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-paper py-1 shadow-card">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50"
          >
            <Trash size={13} weight="bold" />
            Delete tenant
          </button>
        </div>
      )}
    </div>
  );
}

function TenantCard({
  tenant,
  onView,
  onMessage,
  onDelete,
}: {
  tenant: Tenant;
  onView: () => void;
  onMessage: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-paper p-4 transition-shadow hover:shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <Avatar name={tenant.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{tenant.name}</p>
            <p className="mt-0.5 text-xs text-muted">{tenant.phones[0] ?? "No phone on file"}</p>
          </div>
        </div>
        <CardMenu onDelete={onDelete} />
      </div>

      <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Room</span>
          <span className="truncate font-medium text-ink">
            {tenant.room || "Unassigned"} {tenant.roomType && <span className="font-normal text-muted">· {tenant.roomType}</span>}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Rent</span>
          <span className="font-medium text-ink">{formatCurrency(tenant.rentAmount)}/mo</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Status</span>
          {tenant.active ? (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentStatusStyle[tenant.status]}`}>
              {statusLabel[tenant.status]}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Moved out</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onMessage}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <WhatsappLogo size={14} weight="fill" />
          Message
        </button>
        <button
          type="button"
          onClick={onView}
          className="flex-1 rounded-lg border border-line py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
        >
          View profile
        </button>
      </div>
    </div>
  );
}


export default function Tenants() {
  const { tenants, isReady, deleteTenant } = useTenants();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "moved-out">("active");
  const [view, setView] = useState<"grid" | "table">(() => (window.localStorage.getItem("instay-tenants-view") === "table" ? "table" : "grid"));
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);

  const editing = tenants.find((t) => t.id === editingId) ?? null;
  const deleting = tenants.find((t) => t.id === deletingId) ?? null;

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const matchesQuery = t.name.toLowerCase().includes(query.toLowerCase()) || t.room.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "active" ? t.active : !t.active;
      return matchesQuery && matchesStatus;
    });
  }, [tenants, query, statusFilter]);

  // Independent of the search box/tab — the metric row always reflects the whole tenant list.
  const counts = useMemo(
    () => ({
      active: tenants.filter((t) => t.active).length,
      movedOut: tenants.filter((t) => !t.active).length,
    }),
    [tenants]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Arriving from elsewhere in the app to open the Add tenant drawer — then drop the state so
  // navigating back here later doesn't reopen it. (Opening a specific tenant now links straight
  // to /tenants/:id instead of routing through this page's state.)
  useEffect(() => {
    const state = location.state as { openAddTenant?: boolean } | null;
    if (state?.openAddTenant) {
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
            <div className="flex items-center gap-2.5 rounded-md bg-mist px-3.5 py-2.5 transition-colors focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand/25 sm:w-64">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name or room"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>

            {/* Segmented control — the selected pill slides between tabs */}
            <div className="ml-auto inline-flex gap-0.5 rounded-md bg-mist p-1">
              {(["active", "moved-out"] as const).map((s) => {
                const active = statusFilter === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatusFilter(s);
                      setPage(1);
                    }}
                    className={`relative rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      active ? "text-ink" : "text-muted hover:text-ink"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="tenants-filter-pill"
                        transition={{ type: "spring", stiffness: 480, damping: 38 }}
                        className="absolute inset-0 rounded-md bg-paper shadow-sm"
                      />
                    )}
                    <span className="relative">
                      {s === "active" ? "Active" : "Moved out"}{" "}
                      <span className={active ? (s === "active" ? "text-emerald-600" : "text-slate-500") : "text-muted"}>
                        {s === "active" ? counts.active : counts.movedOut}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Layout toggle — grid mirrors a card-based CRM view, table is the dense operator view */}
            <div className="flex rounded-lg border border-line p-0.5">
              {(
                [
                  { id: "grid" as const, Icon: SquaresFour, label: "Grid view" },
                  { id: "table" as const, Icon: Rows, label: "Table view" },
                ]
              ).map(({ id, Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setView(id);
                    window.localStorage.setItem("instay-tenants-view", id);
                  }}
                  aria-label={label}
                  aria-pressed={view === id}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    view === id ? "bg-ink text-paper" : "text-muted hover:bg-mist"
                  }`}
                >
                  <Icon size={16} weight="duotone" />
                </button>
              ))}
            </div>
          </div>

          {/* Grid view — card-based, photo-first once real tenant photos exist */}
          {view === "grid" && (
            <div className="p-4">
              {!isReady && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-line p-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-11 w-11 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-2/3" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                      <Skeleton className="mt-4 h-16 w-full" />
                      <Skeleton className="mt-4 h-8 w-full" />
                    </div>
                  ))}
                </div>
              )}
              {isReady && pageRows.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {pageRows.map((t) => (
                    <TenantCard
                      key={t.id}
                      tenant={t}
                      onView={() => navigate(`/tenants/${t.id}`)}
                      onMessage={() => window.open(whatsAppLink(t.phones[0] ?? ""), "_blank", "noreferrer")}
                      onDelete={() => setDeletingId(t.id)}
                    />
                  ))}
                </div>
              )}
              {isReady && pageRows.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
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
          )}

          {/* Table view: mobile cards — an HTML table doesn't have room to breathe on a phone screen */}
          {view === "table" && (
          <>
          <div className="divide-y divide-line md:hidden">
            {!isReady &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            {isReady && pageRows.map((t) => (
              <div key={t.id} onClick={() => navigate(`/tenants/${t.id}`)} className="p-4 transition-colors active:bg-mist">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{t.phones[0] ?? "—"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm text-ink">{t.roomType}</p>
                    <p className="mt-0.5 text-xs text-muted">{t.room}</p>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      t.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {t.active ? "Active" : "Moved out"}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{formatCurrency(t.rentAmount)}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {t.active ? `Moved in ${t.moveInDate}` : `Moved out ${t.moveOutDate ?? ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/tenants/${t.id}`);
                      }}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-mist"
                    >
                      View details
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(t.id);
                      }}
                      className="rounded-lg border-2 border-gray-200 p-2 text-muted transition-colors hover:text-red-600"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {isReady && pageRows.length === 0 && (
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
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Tenant</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Room</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Move-in date</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Rent</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {!isReady && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)}
                {isReady && pageRows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/tenants/${t.id}`)}
                    className="cursor-pointer border-t border-line transition-colors hover:bg-mist"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{t.name}</p>
                      <p className="text-xs text-muted">{t.phones[0] ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{t.roomType}</p>
                      <p className="text-xs text-muted">{t.room}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{t.moveInDate}</td>
                    <td className="px-4 py-3 text-muted">{formatCurrency(t.rentAmount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {t.active ? "Active" : "Moved out"}
                      </span>
                      {!t.active && t.moveOutDate && <p className="mt-0.5 text-[11px] text-muted">{t.moveOutDate}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/tenants/${t.id}`);
                          }}
                          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-mist"
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          aria-label="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(t.id);
                          }}
                          className="transition-colors border-2 border-gray-200 p-2 rounded-lg text-muted hover:text-red-600"
                        >
                          <TrashIcon />
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
          </>
          )}

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
        {showAdd && <TenantFormDrawer editing={null} onClose={() => setShowAdd(false)} />}
        {editing && <TenantFormDrawer editing={editing} onClose={() => setEditingId(null)} />}
        {deleting && (
          <ConfirmDeleteTenantModal
            tenant={deleting}
            onClose={() => setDeletingId(null)}
            onConfirm={() => {
              deleteTenant(deleting.id);
              setDeletingId(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
