import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import { Eye, MagnifyingGlass, Paperclip, Wrench } from "@phosphor-icons/react";
import { useMaintenance, type MaintenanceReport, type MaintenanceStatus } from "../MaintenanceContext";
import { useTenants } from "../TenantsContext";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import MetricCard from "../components/MetricCard";

function EyeIcon() {
  return <Eye size={14} weight="duotone" />;
}

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

const statusLabel: Record<MaintenanceStatus, string> = { open: "Open", "in-progress": "In progress", resolved: "Resolved" };

const statusStyle: Record<MaintenanceStatus, string> = {
  open: "bg-red-50 text-red-600",
  "in-progress": "bg-amber-50 text-amber-600",
  resolved: "bg-emerald-50 text-emerald-600",
};

const filterOptions = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function RequestDrawer({
  request,
  onClose,
  onSetStatus,
}: {
  request: MaintenanceReport;
  onClose: () => void;
  onSetStatus: (status: MaintenanceStatus) => void;
}) {
  const { tenants } = useTenants();
  const navigate = useNavigate();
  const reportedByTenant = tenants.find((t) => t.name === request.tenant);

  return (
    <SlideOver
      onClose={onClose}
      title={request.location}
      description={
        <>
          Reported by{" "}
          {reportedByTenant ? (
            <button
              type="button"
              onClick={() => navigate("/tenants", { state: { openTenantId: reportedByTenant.id } })}
              className="font-medium text-brand hover:underline"
            >
              {request.tenant}
            </button>
          ) : (
            request.tenant
          )}{" "}
          · {formatDate(request.submittedAt)}
        </>
      }
      footer={
        <>
          <div className="grid grid-cols-3 gap-2">
            {(["open", "in-progress", "resolved"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSetStatus(s)}
                className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  request.status === s ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                }`}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>

          <Link
            to="/expenses"
            state={{
              expensePrefill: {
                name: `Repair — ${request.location}`,
                description: request.description,
                categoryId: "maintenance",
              },
            }}
            className="mt-2 block w-full rounded-lg border border-line py-2.5 text-center text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            Log a repair cost for this 
          </Link>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[request.status]}`}>
          {statusLabel[request.status]}
        </span>
        {request.status === "resolved" && request.resolvedAt && (
          <span className="text-xs text-muted">Resolved {formatDate(request.resolvedAt)}</span>
        )}
      </div>
      <p className="mt-3 rounded-lg bg-mist p-4 text-sm text-ink">{request.description}</p>

      <p className="mt-6 text-sm font-medium text-ink">Photo</p>
      {request.hasPhoto || request.photoUrl ? (
        <div className="mt-2 h-48 overflow-hidden rounded-lg border border-line bg-mist">
          {request.photoUrl ? (
            <img src={request.photoUrl} alt="Attached to this maintenance request" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">Photo attached by tenant</div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">No photo attached to this request.</p>
      )}
    </SlideOver>
  );
}

function AddRequestDrawer({ onClose, onSave }: { onClose: () => void; onSave: (request: Omit<MaintenanceReport, "id" | "unread" | "resolvedAt">) => void }) {
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);

  const canSave = location.trim().length > 0 && description.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      tenant: "Landlord",
      location: location.trim(),
      description: description.trim(),
      submittedAt: new Date().toISOString(),
      status: "open",
      hasPhoto: !!photoUrl,
      photoUrl,
    });
  };

  return (
    <SlideOver
      onClose={onClose}
      title="Add maintenance request"
      description="Log an issue you noticed yourself — anywhere on the property, not just a tenant's room."
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
        >
          Add maintenance request
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Room 08, Main gate, Borehole pump, Parking lot"
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What's the issue?"
            className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Photo (optional)</label>
          {photoUrl ? (
            <div className="space-y-2">
              <div className="h-40 overflow-hidden rounded-lg border border-line bg-mist">
                <img src={photoUrl} alt="Attached to this request" className="h-full w-full object-cover" />
              </div>
              <button type="button" onClick={() => setPhotoUrl(undefined)} className="text-xs font-medium text-red-600 hover:underline">
                Remove photo
              </button>
            </div>
          ) : (
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line py-2.5 text-sm font-medium text-muted transition-colors hover:bg-mist">
              <Paperclip size={14} weight="duotone" />
              Attach a photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPhotoUrl(URL.createObjectURL(file));
                }}
              />
            </label>
          )}
        </div>
      </div>
    </SlideOver>
  );
}

export default function Maintenance() {
  const { reports, setStatus, markRead, addReport } = useMaintenance();
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingRequest, setAddingRequest] = useState(false);

  const selected = reports.find((r) => r.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const rows = reports
      .filter((r) => filter === "all" || r.status === filter)
      .filter((r) => r.location.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase()));
    return [...rows].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  }, [reports, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const counts = useMemo(
    () => ({
      open: reports.filter((r) => r.status === "open").length,
      inProgress: reports.filter((r) => r.status === "in-progress").length,
      unread: reports.filter((r) => r.unread).length,
    }),
    [reports]
  );

  const openRequest = (r: MaintenanceReport) => {
    setSelectedId(r.id);
    if (r.unread) markRead(r.id);
  };

  // Arriving from the Dashboard's maintenance preview — open that request, then drop the nav state.
  useEffect(() => {
    const openId = (location.state as { openReportId?: string } | null)?.openReportId;
    if (openId) {
      const request = reports.find((r) => r.id === openId);
      if (request) openRequest(request);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  return (
    <>
      <PageHeader title="Maintenance" />

      <div className="space-y-5 px-4 sm:px-8 pb-10">
        {/* Top actions */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setAddingRequest(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
          >
            + Add maintenance request
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            compact
            label="Open"
            value={counts.open}
            tone={counts.open > 0 ? "warning" : "success"}
            caption={counts.open > 0 ? "Waiting to be picked up" : "Nothing waiting"}
          />
          <MetricCard
            compact
            label="In progress"
            value={counts.inProgress}
            caption="Currently being worked on"
          />
          <MetricCard
            compact
            label="Unread"
            value={counts.unread}
            tone={counts.unread > 0 ? "danger" : "success"}
            caption={counts.unread > 0 ? "New reports to review" : "You're all caught up"}
          />
        </div>

        {/* Search + status filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by location or description"
              className="w-56 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {filterOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setFilter(o.value);
                  setPage(1);
                }}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  filter === o.value ? "bg-ink text-paper" : "border border-line text-muted hover:bg-mist"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Request table */}
        <div className="rounded-lg border border-line">
          {/* Mobile: cards — an HTML table doesn't have room to breathe on a phone screen */}
          <div className="divide-y divide-line md:hidden">
            {pageRows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openRequest(r)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors active:bg-mist"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {r.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                    <p className="truncate text-sm font-medium text-ink">{r.location}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">{r.description}</p>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {r.tenant} · {formatDate(r.submittedAt)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyle[r.status]}`}>
                  {statusLabel[r.status]}
                </span>
              </button>
            ))}
            {pageRows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <Wrench size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">
                    {reports.length === 0 ? "No maintenance requests yet" : "No requests match this filter"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {reports.length === 0 ? "Requests tenants submit will show up here." : "Try a different search or status filter."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Desktop / tablet: table */}
          <div className="hidden overflow-x-auto md:block">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-32" />
              <col className="w-32" />
              <col />
              <col className="w-36" />
              <col className="w-28" />
              <col className="w-20" />
            </colgroup>
            <thead className="bg-mist text-xs text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Location</th>
                <th className="px-3 py-2.5 font-medium">Reported by</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-line transition-colors hover:bg-mist">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {r.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                      <span className="truncate font-medium text-ink">{r.location}</span>
                    </div>
                  </td>
                  <td className="truncate px-3 py-2.5 text-ink">{r.tenant}</td>
                  <td className="truncate px-3 py-2.5 text-muted" title={r.description}>
                    {r.description}
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    <span className="whitespace-nowrap">{formatDate(r.submittedAt)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyle[r.status]}`}>
                      {statusLabel[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => openRequest(r)}
                      aria-label={`View maintenance request for ${r.location}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-paper hover:text-ink"
                    >
                      <EyeIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                        <Wrench size={22} weight="duotone" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-ink">
                          {reports.length === 0 ? "No maintenance requests yet" : "No requests match this filter"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {reports.length === 0
                            ? "Requests tenants submit will show up here."
                            : "Try a different search or status filter."}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          {filtered.length > 0 && (
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
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <RequestDrawer
            request={selected}
            onClose={() => setSelectedId(null)}
            onSetStatus={(status) => setStatus(selected.id, status)}
          />
        )}
        {addingRequest && (
          <AddRequestDrawer
            onClose={() => setAddingRequest(false)}
            onSave={(request) => {
              addReport(request);
              setAddingRequest(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
