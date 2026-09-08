import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import { Eye, MagnifyingGlass, Paperclip, Wrench, PencilSimple, Trash, CaretDown } from "@phosphor-icons/react";
import { useMaintenance, type MaintenanceReport, type MaintenanceStatus } from "../MaintenanceContext";
import { useTenants } from "../TenantsContext";
import Modal from "../components/Modal";
import { uploadPhoto } from "../../lib/storage";
import { Skeleton } from "../components/Skeleton";

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

/** Groups render in this order regardless of which statuses actually have reports right now. */
const STATUS_GROUPS: MaintenanceStatus[] = ["open", "in-progress", "resolved"];

/** The little accent bar identifying each group at a glance — same hue family as its status pill. */
const statusAccent: Record<MaintenanceStatus, string> = {
  open: "bg-red-500",
  "in-progress": "bg-amber-500",
  resolved: "bg-emerald-500",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ConfirmDeleteReportModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Delete this report?"
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
      <p className="text-sm text-muted">This can't be undone.</p>
    </Modal>
  );
}

function RequestDrawer({
  request,
  onClose,
  onSetStatus,
  onUpdate,
  onDelete,
}: {
  request: MaintenanceReport;
  onClose: () => void;
  onSetStatus: (status: MaintenanceStatus) => void;
  onUpdate: (patch: { location: string; description: string; photoUrl?: string }) => void;
  onDelete: () => void;
}) {
  const { tenants } = useTenants();
  const navigate = useNavigate();
  const reportedByTenant = tenants.find((t) => t.name === request.tenant);

  const [isEditing, setIsEditing] = useState(false);
  const [location, setLocation] = useState(request.location);
  const [description, setDescription] = useState(request.description);
  const [photoUrl, setPhotoUrl] = useState(request.photoUrl);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canSave = location.trim().length > 0 && description.trim().length > 0;

  const startEditing = () => {
    setLocation(request.location);
    setDescription(request.description);
    setPhotoUrl(request.photoUrl);
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (!canSave) return;
    onUpdate({ location: location.trim(), description: description.trim(), photoUrl });
    setIsEditing(false);
  };

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
              onClick={() => navigate(`/tenants/${reportedByTenant.id}`)}
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
      headerActions={
        !isEditing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Edit report"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <PencilSimple size={14} weight="duotone" />
          </button>
        )
      }
      footer={
        isEditing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={!canSave}
              className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
            >
              Save changes
            </button>
          </div>
        ) : (
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
              Log a repair cost for this →
            </Link>

            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
            >
              <Trash size={12} weight="bold" />
              Delete report
            </button>
          </>
        )
      }
    >
      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
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
                    if (!file) return;
                    uploadPhoto("maintenance-photos", file)
                      .then(setPhotoUrl)
                      .catch((err) => console.error("Failed to upload photo", err));
                  }}
                />
              </label>
            )}
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

      <AnimatePresence>
        {confirmingDelete && (
          <ConfirmDeleteReportModal
            onClose={() => setConfirmingDelete(false)}
            onConfirm={() => {
              setConfirmingDelete(false);
              onDelete();
            }}
          />
        )}
      </AnimatePresence>
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
                  if (!file) return;
                  uploadPhoto("maintenance-photos", file)
                    .then(setPhotoUrl)
                    .catch((err) => console.error("Failed to upload photo", err));
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
  const { reports, isReady, setStatus, markRead, addReport, updateReport, deleteReport } = useMaintenance();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingRequest, setAddingRequest] = useState(false);
  // Every group starts expanded — collapsing is something you do per-visit to focus on one status,
  // not a preference worth persisting (next time you land here, you want to see everything again).
  const [collapsed, setCollapsed] = useState<Set<MaintenanceStatus>>(new Set());

  const selected = reports.find((r) => r.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const rows = reports.filter(
      (r) => r.location.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase())
    );
    return [...rows].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  }, [reports, query]);

  const grouped = useMemo(() => {
    const map = new Map<MaintenanceStatus, MaintenanceReport[]>();
    for (const status of STATUS_GROUPS) map.set(status, []);
    for (const r of filtered) map.get(r.status)?.push(r);
    return map;
  }, [filtered]);

  const toggleGroup = (status: MaintenanceStatus) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by location or description"
              className="w-56 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <button
            type="button"
            onClick={() => setAddingRequest(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
          >
            + Add maintenance request
          </button>
        </div>

        {/* Grouped by status, each in its own collapsible section — collapse a group to focus on
            just the others, matching a Kanban-style board's status columns without needing an
            actual multi-column layout that wouldn't fit this page's width. */}
        {!isReady ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-line bg-paper p-4">
                <Skeleton className="h-4 w-32" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-line bg-paper px-4 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
              <Wrench size={22} weight="duotone" />
            </span>
            <div>
              <p className="text-xs font-semibold text-ink">No maintenance requests yet</p>
              <p className="mt-0.5 text-xs text-muted">Requests tenants submit will show up here.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {STATUS_GROUPS.map((status) => {
              const rows = grouped.get(status) ?? [];
              const isCollapsed = collapsed.has(status);
              return (
                <div key={status} className="overflow-hidden rounded-lg border border-line bg-paper">
                  <button
                    type="button"
                    onClick={() => toggleGroup(status)}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-mist"
                  >
                    <span className={`h-4 w-1 shrink-0 rounded-full ${statusAccent[status]}`} />
                    <span className="text-xs font-semibold tracking-wide text-ink uppercase">{statusLabel[status]}</span>
                    <span className="text-xs text-muted">({rows.length})</span>
                    <CaretDown size={14} weight="bold" className={`ml-auto text-muted transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  </button>

                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden border-t border-line"
                      >
                        {rows.length === 0 ? (
                          <p className="px-4 py-6 text-center text-xs text-muted">
                            {query ? "No matches in this group." : `Nothing ${statusLabel[status].toLowerCase()} right now.`}
                          </p>
                        ) : (
                          <>
                            {/* Mobile: cards — an HTML table doesn't have room to breathe on a phone screen */}
                            <div className="divide-y divide-line md:hidden">
                              {rows.map((r) => (
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
                                  <EyeIcon />
                                </button>
                              ))}
                            </div>

                            {/* Desktop / tablet: table */}
                            <div className="hidden overflow-x-auto md:block">
                              <table className="w-full table-fixed text-left text-sm">
                                <colgroup>
                                  <col className="w-40" />
                                  <col className="w-32" />
                                  <col />
                                  <col className="w-32" />
                                  <col className="w-16" />
                                </colgroup>
                                <thead className="bg-mist text-xs text-muted">
                                  <tr>
                                    <th className="px-3 py-2 font-medium">Location</th>
                                    <th className="px-3 py-2 font-medium">Reported by</th>
                                    <th className="px-3 py-2 font-medium">Description</th>
                                    <th className="px-3 py-2 font-medium">Date</th>
                                    <th className="px-3 py-2 font-medium"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((r) => (
                                    <tr
                                      key={r.id}
                                      onClick={() => openRequest(r)}
                                      className="cursor-pointer border-t border-line transition-colors hover:bg-mist"
                                    >
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
                                      <td className="px-3 py-2.5 text-right">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openRequest(r);
                                          }}
                                          aria-label={`View maintenance request for ${r.location}`}
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-paper hover:text-ink"
                                        >
                                          <EyeIcon />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-line bg-paper px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <Wrench size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">No requests match your search</p>
                  <p className="mt-0.5 text-xs text-muted">Try a different search term.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <RequestDrawer
            request={selected}
            onClose={() => setSelectedId(null)}
            onSetStatus={(status) => setStatus(selected.id, status)}
            onUpdate={(patch) => updateReport(selected.id, patch)}
            onDelete={() => {
              deleteReport(selected.id);
              setSelectedId(null);
            }}
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
