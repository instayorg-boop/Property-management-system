import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import SectionLabel from "../components/SectionLabel";
import Lightbox from "../components/Lightbox";
import { Eye, MagnifyingGlass, Paperclip, Wrench, PencilSimple, Trash, CaretDown, X, Image, CheckCircle } from "@phosphor-icons/react";
import { useMaintenance, type MaintenanceReport, type MaintenanceStatus } from "../MaintenanceContext";
import { useTenants } from "../TenantsContext";
import Modal from "../components/Modal";
import { uploadPhoto } from "../../lib/storage";
import { Skeleton } from "../components/Skeleton";
import Button from "../components/Button";

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

/** The whole group header is tinted, not just a thin accent strip — same hue family as the
 * status pills used elsewhere, just applied to the full row so it actually reads at a glance. */
const statusHeaderStyle: Record<MaintenanceStatus, string> = {
  open: "bg-red-50 hover:bg-red-100/70",
  "in-progress": "bg-amber-50 hover:bg-amber-100/70",
  resolved: "bg-emerald-50 hover:bg-emerald-100/70",
};
const statusHeaderText: Record<MaintenanceStatus, string> = {
  open: "text-red-700",
  "in-progress": "text-amber-700",
  resolved: "text-emerald-700",
};

const groupFilterOptions: { value: "all" | MaintenanceStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

/** The active filter's own text takes on that status's colour, instead of the same neutral ink
 * every tab gets — so "Open" selected actually reads red, not just "selected". */
const groupFilterActiveColor: Record<"all" | MaintenanceStatus, string> = {
  all: "text-ink",
  open: "text-red-600",
  "in-progress": "text-amber-600",
  resolved: "text-emerald-600",
};

/** Small square thumbnail + "add another" tile — used for both adding a report (tenant portal
 * mirrors this pattern separately, kept isolated per docs/BACKEND.md) and editing an existing one. */
function PhotoPicker({ photoUrls, onChange }: { photoUrls: string[]; onChange: (urls: string[]) => void }) {
  const addPhoto = (file: File) => {
    uploadPhoto("maintenance-photos", file)
      .then((url) => onChange([...photoUrls, url]))
      .catch((err) => console.error("Failed to upload photo", err));
  };

  return (
    <div className="flex flex-wrap gap-2">
      {photoUrls.map((url, i) => (
        <div key={i} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-mist">
          <img src={url} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(photoUrls.filter((_, idx) => idx !== i))}
            aria-label="Remove photo"
            className="absolute top-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-ink/70 text-paper opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X size={9} weight="bold" />
          </button>
        </div>
      ))}
      <label className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-muted transition-colors hover:bg-mist">
        <Paperclip size={16} weight="duotone" />
        <span className="text-[10px] font-medium">Add</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) addPhoto(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} className="bg-red-600 text-paper hover:bg-red-700">
            Delete
          </Button>
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
  onUpdate: (patch: { location: string; description: string; photoUrls: string[] }) => void;
  onDelete: () => void;
}) {
  const { tenants } = useTenants();
  const navigate = useNavigate();
  const reportedByTenant = tenants.find((t) => t.name === request.tenant);

  const [isEditing, setIsEditing] = useState(false);
  const [location, setLocation] = useState(request.location);
  const [description, setDescription] = useState(request.description);
  const [photoUrls, setPhotoUrls] = useState(request.photoUrls);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const canSave = location.trim().length > 0 && description.trim().length > 0;

  const startEditing = () => {
    setLocation(request.location);
    setDescription(request.description);
    setPhotoUrls(request.photoUrls);
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (!canSave) return;
    onUpdate({ location: location.trim(), description: description.trim(), photoUrls });
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
            <Button variant="secondary" onClick={() => setIsEditing(false)} className="flex-1 py-2.5">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={saveEdit}
              disabled={!canSave}
              className="flex-1 py-2.5 hover:scale-[1.01] disabled:hover:scale-100"
            >
              Save changes
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted">Tap a stage to move this request</p>
            {/* Segmented control, not three separate bordered tiles — the active status slides
                between options, matching the same pattern used across the rest of this page. */}
            <div className="inline-flex w-full gap-0.5 rounded-md bg-mist p-1">
              {(["open", "in-progress", "resolved"] as const).map((s) => {
                const active = request.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSetStatus(s)}
                    className={`relative flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                      active ? statusHeaderText[s] : "text-muted hover:text-ink"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="maintenance-status-pill"
                        transition={{ type: "spring", stiffness: 480, damping: 38 }}
                        className="absolute inset-0 rounded-md bg-paper shadow-sm"
                      />
                    )}
                    <span className="relative">{statusLabel[s]}</span>
                  </button>
                );
              })}
            </div>

            <Link
              to="/accounting"
              state={{
                expensePrefill: {
                  name: `Repair — ${request.location}`,
                  description: request.description,
                  categoryId: "maintenance",
                },
              }}
              className="block w-full rounded-lg border border-line py-2 text-center text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-mist"
            >
              Log a repair cost for this - opens the Expenses page
            </Link>

            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash size={11} weight="bold" />
              Delete this report
            </button>
          </div>
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
            <label className="mb-1.5 block text-xs font-medium text-muted">Photos (optional)</label>
            <PhotoPicker photoUrls={photoUrls} onChange={setPhotoUrls} />
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

          {/* A note, not a plain filled box — a label above it and a left accent bar give it the
              shape of an actual annotation rather than just a grey rectangle of text. */}
          <div className="mt-4">
            <SectionLabel>Description</SectionLabel>
            <div className="mt-1.5  border-l-2 border-brand bg-mist py-2.5 pr-4 pl-3.5">
              <p className="text-sm leading-relaxed text-ink">{request.description}</p>
            </div>
          </div>

          <div className="mt-5">
            <SectionLabel>Photo{request.photoUrls.length !== 1 ? "s" : ""}</SectionLabel>
            {request.photoUrls.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted">No photos attached to this request.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {request.photoUrls.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className="h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-line transition-opacity hover:opacity-80"
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
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

      {lightboxIndex !== null && (
        <Lightbox photos={request.photoUrls} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </SlideOver>
  );
}

function AddRequestDrawer({ onClose, onSave }: { onClose: () => void; onSave: (request: Omit<MaintenanceReport, "id" | "unread" | "resolvedAt">) => void }) {
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const canSave = location.trim().length > 0 && description.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      tenant: "Landlord",
      location: location.trim(),
      description: description.trim(),
      submittedAt: new Date().toISOString(),
      status: "open",
      photoUrls,
    });
  };

  return (
    <SlideOver
      onClose={onClose}
      title="Add maintenance request"
      description="Log an issue noticed anywhere on the property."
      footer={
        <Button
          variant="primary"
          onClick={submit}
          disabled={!canSave}
          className="w-full py-3 hover:scale-[1.01] disabled:hover:scale-100"
        >
          Add maintenance request
        </Button>
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
          <label className="mb-1.5 block text-xs font-medium text-muted">Photos (optional)</label>
          <PhotoPicker photoUrls={photoUrls} onChange={setPhotoUrls} />
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
  // Which group(s) to show at all — "all" shows every section, picking a status hides the rest
  // entirely rather than just collapsing them.
  const [groupFilter, setGroupFilter] = useState<"all" | MaintenanceStatus>("all");

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

  const visibleGroups = groupFilter === "all" ? STATUS_GROUPS : [groupFilter];

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
        {/* Add stands alone on its own row; search + filters sit on the row below it, not beside it. */}
        <div className="flex items-center justify-end">
          <Button variant="primary" onClick={() => setAddingRequest(true)} className="hover:scale-[1.02]">
            + Add maintenance request
          </Button>
        </div>

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

          {/* Segmented control — matches the Tenants page's filter tabs: the active pill slides
              between options instead of each button carrying its own border/fill. */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="inline-flex gap-0.5 rounded-md bg-mist p-1">
              {groupFilterOptions.map((o) => {
                const active = groupFilter === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setGroupFilter(o.value)}
                    className={`relative shrink-0 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      active ? groupFilterActiveColor[o.value] : "text-muted hover:text-ink"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="maintenance-filter-pill"
                        transition={{ type: "spring", stiffness: 480, damping: 38 }}
                        className="absolute inset-0 rounded-md bg-paper shadow-sm"
                      />
                    )}
                    <span className="relative">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
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
            {visibleGroups.map((status) => {
              const rows = grouped.get(status) ?? [];
              const isCollapsed = collapsed.has(status);
              return (
                <div key={status} className="overflow-hidden rounded-lg border-2 border-gray-100 bg-paper">
                  <button
                    type="button"
                    onClick={() => toggleGroup(status)}
                    className={`flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors ${statusHeaderStyle[status]}`}
                  >
                    <span className={`text-xs font-bold tracking-wide uppercase ${statusHeaderText[status]}`}>{statusLabel[status]}</span>
                    <span className={`text-xs font-medium ${statusHeaderText[status]} opacity-70`}>({rows.length})</span>
                    <CaretDown
                      size={14}
                      weight="bold"
                      className={`ml-auto transition-transform ${statusHeaderText[status]} ${isCollapsed ? "-rotate-90" : ""}`}
                    />
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
                                      {r.unread ? (
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                                      ) : (
                                        <CheckCircle size={12} weight="fill" className="shrink-0 text-muted/50" />
                                      )}
                                      <p className="truncate text-sm font-medium text-ink">{r.location}</p>
                                    </div>
                                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{r.description}</p>
                                    <div className="mt-1.5 flex items-center gap-2">
                                      <p className="text-[11px] text-muted">
                                        {r.tenant} · {formatDate(r.submittedAt)}
                                      </p>
                                      {r.photoUrls.length > 0 && (
                                        <span className="flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                                          <Image size={10} weight="duotone" />
                                          {r.photoUrls.length > 1 ? `${r.photoUrls.length} photos` : "Photo"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted">
                                    <EyeIcon />
                                    View
                                  </span>
                                </button>
                              ))}
                            </div>

                            {/* Desktop / tablet: table */}
                            <div className="hidden overflow-x-auto md:block">
                              <table className="w-full table-fixed text-left text-sm">
                                <colgroup>
                                  <col className="w-36" />
                                  <col className="w-28" />
                                  <col />
                                  <col className="w-24" />
                                  <col className="w-32" />
                                  <col className="w-24" />
                                </colgroup>
                                <thead className="bg-mist text-xs text-muted">
                                  <tr>
                                    <th className="px-3 py-2 font-medium">Location</th>
                                    <th className="px-3 py-2 font-medium">Reported by</th>
                                    <th className="px-3 py-2 font-medium">Description</th>
                                    <th className="px-3 py-2 font-medium">Photos</th>
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
                                      <td className="px-3 py-2.5 align-top">
                                        <div className="flex items-center gap-1.5">
                                          {r.unread ? (
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                                          ) : (
                                            <CheckCircle size={12} weight="fill" className="shrink-0 text-muted/50" />
                                          )}
                                          <span className="truncate font-medium text-ink">{r.location}</span>
                                        </div>
                                      </td>
                                      <td className="truncate px-3 py-2.5 align-top text-ink">{r.tenant}</td>
                                      <td className="px-3 py-2.5 align-top text-muted">
                                        <p className="line-clamp-2 whitespace-normal">{r.description}</p>
                                      </td>
                                      <td className="px-3 py-2.5 align-top">
                                        {r.photoUrls.length > 0 ? (
                                          <span className="flex w-fit items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                                            <Image size={10} weight="duotone" />
                                            {r.photoUrls.length > 1 ? `${r.photoUrls.length} photos` : "Photo"}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-muted/60">None</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 align-top text-muted">
                                        <span className="whitespace-nowrap">{formatDate(r.submittedAt)}</span>
                                      </td>
                                      <td className="px-3 py-2.5 text-right align-top">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openRequest(r);
                                          }}
                                          aria-label={`View maintenance request for ${r.location}`}
                                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
                                        >
                                          <EyeIcon />
                                          View
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
