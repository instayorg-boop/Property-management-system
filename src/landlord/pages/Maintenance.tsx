import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import SectionLabel from "../components/SectionLabel";
import Lightbox from "../components/Lightbox";
import {
  MagnifyingGlass,
  Paperclip,
  Wrench,
  PencilSimple,
  Trash,
  CaretDown,
  CaretRight,
  CaretUpDown,
  X,
  Image,
  CheckCircle,
  Check,
  DotsThreeVertical,
} from "@phosphor-icons/react";
import { useMaintenance, type MaintenanceReport, type MaintenanceStatus } from "../MaintenanceContext";
import { useTenants } from "../TenantsContext";
import Modal from "../components/Modal";
import { uploadPhoto } from "../../lib/storage";
import { Skeleton } from "../components/Skeleton";
import Button from "../components/Button";
import { PendingSyncTag } from "../components/SyncStatus";
import { usePendingMaintenanceIds } from "../../lib/offline/hooks";
import MaintenancePhoto from "../../assets/Maintance Empty State Ui.png";

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

const statusLabel: Record<MaintenanceStatus, string> = { open: "Open", "in-progress": "In progress", resolved: "Resolved" };

const statusStyle: Record<MaintenanceStatus, string> = {
  open: "bg-orange-50 text-orange-600",
  "in-progress": "bg-amber-50 text-amber-600",
  resolved: "bg-emerald-50 text-emerald-600",
};

const STATUS_GROUPS: MaintenanceStatus[] = ["open", "in-progress", "resolved"];

const GROUP_HEADER_STYLE = "bg-white hover:bg-mist";

const groupFilterOptions: { value: "all" | MaintenanceStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

const groupFilterActiveColor: Record<"all" | MaintenanceStatus, string> = {
  all: "text-ink",
  open: "text-orange-600",
  "in-progress": "text-amber-600",
  resolved: "text-emerald-600",
};

const nextStatus: Record<MaintenanceStatus, MaintenanceStatus> = {
  open: "in-progress",
  "in-progress": "resolved",
  resolved: "open",
};

type SortMode = "date" | "location-asc" | "location-desc";

/** Native tri-state checkbox (checked / unchecked / indeterminate) — no Radix, just a styled
 * input with a manual `indeterminate` DOM property set via ref, since that state can't be
 * expressed as a plain attribute. */
function RowCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <label className="relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="peer absolute inset-0 h-4 w-4 cursor-pointer appearance-none rounded border border-line bg-white transition-colors checked:border-ink checked:bg-ink indeterminate:border-ink indeterminate:bg-ink"
      />
      <Check
        size={10}
        weight="bold"
        className="pointer-events-none relative hidden text-white peer-checked:block peer-indeterminate:block"
      />
    </label>
  );
}

/** Small local dropdown menu — a button that toggles a floating panel, closed on outside click
 * or Escape. Stands in for the Radix DropdownMenu without adding that dependency. */
function RowActionsMenu({
  onView,
  onAdvance,
  advanceLabel,
  onDelete,
}: {
  onView: () => void;
  onAdvance: () => void;
  advanceLabel: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const item = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-label="Row actions"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
      >
        <DotsThreeVertical size={16} weight="bold" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={item(onView)}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-mist"
            >
              View details
            </button>
            <button
              type="button"
              onClick={item(onAdvance)}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-mist"
            >
              {advanceLabel}
            </button>
            <button
              type="button"
              onClick={item(onDelete)}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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

function ConfirmDeleteModal({
  count,
  onClose,
  onConfirm,
}: {
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title={count > 1 ? `Delete ${count} reports?` : "Delete this report?"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="dangerSolid" onClick={onConfirm}>
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
  pendingMaintenanceIds,
  onClose,
  onSetStatus,
  onUpdate,
  onDelete,
}: {
  pendingMaintenanceIds: Set<string>;
  request: MaintenanceReport;
  onClose: () => void;
  onSetStatus: (status: MaintenanceStatus) => void;
  onUpdate: (patch: { location: string; description: string; photoUrls: string[] }) => void;
  onDelete: () => void;
}) {
  const { tenants } = useTenants();
  const navigate = useNavigate();
  const reportedByTenant = request.tenantId
    ? tenants.find((t) => t.id === request.tenantId)
    : tenants.find((t) => t.name === request.tenant);

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
              onClick={() => navigate(`/tenants/${reportedByTenant.portalToken}`)}
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
            <div className="inline-flex w-full gap-0.5 rounded-md bg-mist p-1">
              {(["open", "in-progress", "resolved"] as const).map((s) => {
                const active = request.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSetStatus(s)}
                    className={`relative flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                      active ? groupFilterActiveColor[s] : "text-muted hover:text-ink"
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
              to="/expense-tracker"
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
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[request.status]}`}>
              {statusLabel[request.status]}
            </span>
            {request.status === "resolved" && request.resolvedAt && (
              <span className="text-xs text-muted">Resolved {formatDate(request.resolvedAt)}</span>
            )}
            {pendingMaintenanceIds.has(request.id) && <PendingSyncTag />}
          </div>

          <div className="mt-4">
            <SectionLabel>Description</SectionLabel>
            <div className="mt-1.5 border-l-2 border-brand bg-mist py-2.5 pr-4 pl-3.5">
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
          <ConfirmDeleteModal count={1} onClose={() => setConfirmingDelete(false)} onConfirm={() => { setConfirmingDelete(false); onDelete(); }} />
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
      tenantId: null,
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
        <Button variant="primary" onClick={submit} disabled={!canSave} className="w-full py-3 hover:scale-[1.01] disabled:hover:scale-100">
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
  const pendingMaintenanceIds = usePendingMaintenanceIds();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingRequest, setAddingRequest] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<MaintenanceStatus>>(new Set(["resolved"]));
  const [groupFilter, setGroupFilter] = useState<"all" | MaintenanceStatus>("all");
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const selected = reports.find((r) => r.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const rows = reports.filter(
      (r) => r.location.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase())
    );
    return [...rows].sort((a, b) => {
      if (sortMode === "location-asc") return a.location.localeCompare(b.location);
      if (sortMode === "location-desc") return b.location.localeCompare(a.location);
      return a.submittedAt < b.submittedAt ? 1 : -1;
    });
  }, [reports, query, sortMode]);

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

  const cycleSortMode = () => {
    setSortMode((prev) => (prev === "date" ? "location-asc" : prev === "location-asc" ? "location-desc" : "date"));
  };

  const openRequest = (r: MaintenanceReport) => {
    setSelectedId(r.id);
    if (r.unread) markRead(r.id);
  };

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroupChecked = (rows: MaintenanceReport[], value: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (value) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  };

  const clearChecked = () => setCheckedIds(new Set());

  const bulkMarkResolved = () => {
    checkedIds.forEach((id) => setStatus(id, "resolved"));
    clearChecked();
  };

  const bulkDelete = () => {
    checkedIds.forEach((id) => deleteReport(id));
    setBulkDeleteConfirm(false);
    clearChecked();
  };

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
      <PageHeader title="Maintenance requests" description="Review and resolve maintenance requests from tenants." />

      <div className="space-y-5 px-4 pb-24 sm:px-8">
        <div className="flex items-center justify-end">
          <Button variant="primary" onClick={() => setAddingRequest(true)} className="hover:scale-[1.02]">
            + Add maintenance request
          </Button>
        </div>

        {reports.length !== 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by location or description"
                className="w-56 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>

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
                          className="absolute inset-0 rounded-md bg-white shadow-sm"
                        />
                      )}
                      <span className="relative">{o.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!isReady ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-line bg-white p-4">
                <Skeleton className="h-4 w-32" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-2 text-center">
            <span className="flex w-md items-center justify-center text-muted">
              <img src={MaintenancePhoto} />
            </span>
            <div>
              <p className="font-display text-xl font-bold tracking-tight text-brand">Complete Maintenance Visibility</p>
              <p className="mt-0.5 max-w-lg text-sm text-muted">
                From appliance replacements to requests submited by tenants, maintain a complete log of every issue and repair across your property.
              </p>
            </div>
            <div className="flex items-center justify-end">
              <Button variant="primary" onClick={() => setAddingRequest(true)} className="hover:scale-[1.02]">
                + Add maintenance request
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleGroups.map((status) => {
              const rows = grouped.get(status) ?? [];
              const isCollapsed = collapsed.has(status);
              const allChecked = rows.length > 0 && rows.every((r) => checkedIds.has(r.id));
              const someChecked = rows.some((r) => checkedIds.has(r.id));

              return (
                <div key={status} className="overflow-hidden rounded-xl border border-line bg-white">
                  <button
                    type="button"
                    onClick={() => toggleGroup(status)}
                    className={`flex w-full items-center gap-3 px-6 py-4 text-left transition-colors duration-200 ease-in-out ${GROUP_HEADER_STYLE}`}
                  >
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${statusStyle[status]}`}>
                      {statusLabel[status]} · {rows.length}
                    </span>
                    <CaretDown
                      size={14}
                      weight="bold"
                      className={`ml-auto shrink-0 text-muted transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
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
                            {/* Mobile: cards */}
                            <div className="divide-y divide-line md:hidden">
                              {rows.map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => openRequest(r)}
                                  className="flex w-full items-start justify-between gap-3 p-6 text-left transition-colors active:bg-mist"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      {r.unread ? (
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                      ) : (
                                        <CheckCircle size={12} weight="fill" className="shrink-0 text-muted/50" />
                                      )}
                                      <p className="truncate text-sm font-semibold text-ink">{r.location}</p>
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
                                  <CaretRight size={16} weight="bold" className="mt-1 shrink-0 text-muted" />
                                </button>
                              ))}
                            </div>

                            {/* Desktop / tablet: plain table, styled to match */}
                            <div className="hidden overflow-x-auto md:block">
                              <table className="w-full table-fixed text-left text-sm">
                                <colgroup>
                                  <col className="w-10" />
                                  <col className="w-40" />
                                  <col />
                                  <col className="w-36" />
                                  <col className="w-24" />
                                  <col className="w-28" />
                                  <col className="w-10" />
                                </colgroup>
                                <thead className="border-b border-line bg-white text-[11px] text-muted uppercase">
                                  <tr>
                                    <th className="px-4 py-3">
                                      <RowCheckbox
                                        checked={allChecked}
                                        indeterminate={someChecked}
                                        onChange={() => toggleGroupChecked(rows, !allChecked)}
                                        label={`Select all ${statusLabel[status].toLowerCase()} rows`}
                                      />
                                    </th>
                                    <th className="px-4 py-3 font-medium tracking-wide">
                                      <button type="button" onClick={cycleSortMode} className="flex items-center gap-1 hover:text-ink">
                                        Location
                                        <CaretUpDown size={12} weight="bold" />
                                      </button>
                                    </th>
                                    <th className="px-4 py-3 font-medium tracking-wide">Description</th>
                                    <th className="px-4 py-3 font-medium tracking-wide">Reported by</th>
                                    <th className="px-4 py-3 font-medium tracking-wide">Photos</th>
                                    <th className="px-4 py-3 font-medium tracking-wide">Date</th>
                                    <th className="px-4 py-3 font-medium"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                  {rows.map((r) => (
                                    <tr
                                      key={r.id}
                                      onClick={() => openRequest(r)}
                                      className="group cursor-pointer transition-colors duration-200 ease-in-out hover:bg-mist"
                                    >
                                      <td className="px-4 py-4 align-top" onClick={(e) => e.stopPropagation()}>
                                        <RowCheckbox checked={checkedIds.has(r.id)} onChange={() => toggleChecked(r.id)} label="Select row" />
                                      </td>
                                      <td className="px-4 py-4 align-top">
                                        <div className="flex items-center gap-1.5">
                                          {r.unread ? (
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                          ) : (
                                            <CheckCircle size={12} weight="fill" className="shrink-0 text-muted/50" />
                                          )}
                                          <span className="truncate font-semibold text-ink">{r.location}</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-4 align-top text-muted">
                                        <p className="line-clamp-2 whitespace-normal">{r.description}</p>
                                      </td>
                                      <td className="px-4 py-4 align-top text-muted">
                                        <span className="line-clamp-2 whitespace-normal">{r.tenant}</span>
                                      </td>
                                      <td className="px-4 py-4 align-top">
                                        {r.photoUrls.length > 0 ? (
                                          <span className="flex w-fit items-center gap-1 whitespace-nowrap rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                                            <Image size={10} weight="duotone" />
                                            Photos
                                          </span>
                                        ) : (
                                          <span className="flex w-fit items-center whitespace-nowrap rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-medium text-muted/60">
                                            None
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-4 align-top text-muted">
                                        <span className="whitespace-nowrap">{formatDate(r.submittedAt)}</span>
                                      </td>
                                      <td className="px-4 py-4 align-top" onClick={(e) => e.stopPropagation()}>
                                        <RowActionsMenu
                                          onView={() => openRequest(r)}
                                          onAdvance={() => setStatus(r.id, nextStatus[r.status])}
                                          advanceLabel={`Mark as ${statusLabel[nextStatus[r.status]]}`}
                                          onDelete={() => deleteReport(r.id)}
                                        />
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
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-10 text-center">
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
        {checkedIds.size > 0 && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] sm:px-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                {checkedIds.size} of {filtered.length} row(s) selected.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={clearChecked} className="px-3 py-1.5 text-xs">
                  Clear
                </Button>
                <Button variant="secondary" onClick={bulkMarkResolved} className="px-3 py-1.5 text-xs">
                  Mark resolved
                </Button>
                <Button variant="dangerSolid" onClick={() => setBulkDeleteConfirm(true)} className="px-3 py-1.5 text-xs">
                  Delete
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bulkDeleteConfirm && (
          <ConfirmDeleteModal count={checkedIds.size} onClose={() => setBulkDeleteConfirm(false)} onConfirm={bulkDelete} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <RequestDrawer
            request={selected}
            pendingMaintenanceIds={pendingMaintenanceIds}
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