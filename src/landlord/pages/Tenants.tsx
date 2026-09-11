import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/PageHeader";
import ConfirmDeleteTenantModal from "../components/ConfirmDeleteTenantModal";
import { useTenants, formatCurrency } from "../TenantsContext";
import { MagnifyingGlass, Trash, UsersThree } from "@phosphor-icons/react";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import Button from "../components/Button";

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

function TrashIcon() {
  return <Trash size={14} weight="duotone" />;
}

/** Deliberately louder than an "active" badge — a moved-out tenant is a materially
 * different state (not just "behind on rent"), and needs to read as such at a glance. */
const movedOutStyle = "bg-red-50 text-red-600";

export default function Tenants() {
  const { tenants, isReady, deleteTenant } = useTenants();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "moved-out">("active");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);

  const deleting = tenants.find((t) => t.id === deletingId) ?? null;

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        q.length === 0 ||
        t.name.toLowerCase().includes(q) ||
        t.room.toLowerCase().includes(q) ||
        t.phones.some((p) => p.replace(/\s+/g, "").includes(q.replace(/\s+/g, "")));
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

  return (
    <>
      <PageHeader title="Tenants" description="View and manage every tenant across your property." />

      <div className="space-y-4 px-4 sm:px-8 pb-10">
        {/* Top actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" disabled title="Coming soon" className="cursor-not-allowed text-muted">
            Export all data
          </Button>
          <Button variant="primary" onClick={() => navigate("/tenants/new")} className="hover:scale-[1.02]">
            + Add tenant
          </Button>
        </div>

        <div className="rounded-xl border border-line bg-paper">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-6">
            <div className="flex items-center gap-2.5 rounded-md bg-mist px-3.5 py-2.5 transition-colors focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand/25 sm:w-80">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, room or phone"
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
                      <span className={active ? (s === "active" ? "text-emerald-600" : "text-red-600") : "text-muted"}>
                        {s === "active" ? counts.active : counts.movedOut}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile: cards — an HTML table doesn't have room to breathe on a phone screen */}
          <div className="divide-y divide-line md:hidden">
            {!isReady &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            {isReady && pageRows.map((t) => (
              <div key={t.id} onClick={() => navigate(`/tenants/${t.id}`)} className="p-6 transition-colors duration-200 ease-in-out active:bg-mist">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{t.name}</p>
                    <p className="mt-0.5 text-sm text-muted">{t.phones[0] ?? "—"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm text-ink">{t.roomType}</p>
                    <p className="mt-0.5 text-sm text-muted">{t.room}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      t.active ? "bg-emerald-50 text-emerald-600" : movedOutStyle
                    }`}
                  >
                    {t.active ? "Active" : "Moved out"}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                  <div>
                    <p className="font-display font-semibold text-ink">{formatCurrency(t.rentAmount)}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {t.active ? `Moved in ${t.moveInDate}` : `Moved out ${t.moveOutDate ?? ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/tenants/${t.id}`);
                      }}
                      className="font-semibold text-ink underline-offset-2 hover:underline"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(t.id);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-red-600"
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

          {/* Desktop / tablet: table — bounded height with its own scroll, so the sticky header
              has an actual scroll container to stick within (relying on the page/shell's own
              scroll container doesn't work reliably here: overflow-x-auto below implicitly
              resolves overflow-y to auto too, per the CSS spec, silently making this div its own
              non-scrolling-looking-but-still-a-container context). */}
          <div className="hidden max-h-[70vh] overflow-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-paper text-[11px] text-muted">
                <tr className="border-b border-line">
                  <th className="px-6 py-4 font-medium tracking-wide uppercase">Tenant</th>
                  <th className="px-6 py-4 font-medium tracking-wide uppercase">Room</th>
                  <th className="px-6 py-4 font-medium tracking-wide uppercase">Move-in date</th>
                  <th className="px-6 py-4 font-medium tracking-wide uppercase">Rent</th>
                  <th className="px-6 py-4 font-medium tracking-wide uppercase">Status</th>
                  <th className="px-6 py-4 text-right font-medium tracking-wide uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {!isReady && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
                {isReady && pageRows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/tenants/${t.id}`)}
                    className="group cursor-pointer transition-colors duration-200 ease-in-out hover:bg-mist"
                  >
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink">{t.name}</p>
                      <p className="mt-0.5 text-muted">{t.phones[0] ?? "—"}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-ink">{t.roomType}</p>
                      <p className="mt-0.5 text-muted">{t.room}</p>
                    </td>
                    <td className="px-6 py-4 text-muted">{t.moveInDate}</td>
                    <td className="font-display px-6 py-4 font-medium text-ink">{formatCurrency(t.rentAmount)}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          t.active ? "bg-emerald-50 text-emerald-600" : movedOutStyle
                        }`}
                      >
                        {t.active ? "Active" : "Moved out"}
                      </span>
                      {!t.active && t.moveOutDate && <p className="mt-1 text-[11px] text-muted">{t.moveOutDate}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/tenants/${t.id}`);
                          }}
                          className="rounded-full font-semibold text-ink underline-offset-2 hover:underline"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          aria-label="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(t.id);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {isReady && pageRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-14">
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
