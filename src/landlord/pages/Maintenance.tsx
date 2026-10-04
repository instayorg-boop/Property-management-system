import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import Lightbox from "../components/Lightbox";
import {
  MagnifyingGlass,
  Paperclip,
  Wrench,
  CaretRight,
  X,
  Image,
  DotsThreeVertical,
  DownloadSimple,
  FunnelSimple,
} from "@phosphor-icons/react";
import { useMaintenance, type MaintenanceReport, type MaintenanceStatus } from "../MaintenanceContext";
import type { MaintenancePriority } from "../../lib/maintenance";
import { useTenants } from "../TenantsContext";
import Modal from "../components/Modal";
import { uploadPhoto } from "../../lib/storage";
import { Skeleton } from "../components/Skeleton";
import Button from "../components/Button";
import { PendingSyncTag } from "../components/SyncStatus";
import { usePendingMaintenanceIds } from "../../lib/offline/hooks";
import MaintenancePhoto from "../../assets/Maintance Empty State Ui.png";
import { TableCard, DataTable, DataTableHead, Th, DataTableBody, Td, StatusPill, TableEmptyState, type StatusTone } from "../components/DataTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../ToastContext";

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

const statusLabel: Record<MaintenanceStatus, string> = { open: "Open", "in-progress": "In progress", resolved: "Resolved" };

const statusTone: Record<MaintenanceStatus, StatusTone> = {
  open: "warning",
  "in-progress": "info",
  resolved: "success",
};

const priorityOrder: MaintenancePriority[] = ["low", "medium", "high", "urgent"];

const priorityLabel: Record<MaintenancePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const priorityTone: Record<MaintenancePriority, StatusTone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

// How the request list is actually ordered: least-done work first (open, then in progress, then
// resolved), and within the same status, the most urgent thing first — a landlord scanning top to
// bottom should hit the open, urgent stuff before anything already in hand or finished.
const STATUS_RANK: Record<MaintenanceStatus, number> = { open: 0, "in-progress": 1, resolved: 2 };
const PRIORITY_RANK: Record<MaintenancePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const statusFilterOptions: { value: "all" | MaintenanceStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

const nextStatus: Record<MaintenanceStatus, MaintenanceStatus> = {
  open: "in-progress",
  "in-progress": "resolved",
  resolved: "open",
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** "MR-xxxx" — a short, stable-looking reference code derived from the report's own id (not a
 * real sequence number, since reports aren't numbered in the database), just so a request reads
 * as a trackable ticket rather than a bare description in the table. */
function ticketCode(id: string) {
  return `MR-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function downloadMaintenanceCsv(filename: string, rows: MaintenanceReport[]) {
  const header = ["Ticket", "Location", "Tenant", "Description", "Priority", "Status", "Submitted", "Resolved"];
  const lines = rows.map((r) =>
    [
      ticketCode(r.id),
      r.location,
      r.tenant,
      r.description,
      priorityLabel[r.priority],
      statusLabel[r.status],
      formatDate(r.submittedAt),
      r.resolvedAt ? formatDate(r.resolvedAt) : "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** One top-of-page number — the at-a-glance counts a landlord actually opens this page to check
 * (how much is outstanding, what's urgent) before ever touching the table underneath. */
function StatCard({ label, value, valueClassName = "" }: { label: string; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="flex-1 px-5 py-4">
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className={`font-display mt-2 text-2xl font-bold tracking-tight sm:text-[28px] ${valueClassName || "text-ink"}`}>{value}</p>
    </div>
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
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-line hover:text-ink"
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

/** Single "Filter" button standing in for the old row of status pills — opens the same options
 * in a dropdown instead of spending permanent width on every choice at once. */
function FilterMenu({
  value,
  onChange,
}: {
  value: "all" | MaintenanceStatus;
  onChange: (v: "all" | MaintenanceStatus) => void;
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

  const activeLabel = statusFilterOptions.find((o) => o.value === value)?.label ?? "All";

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
      >
        <FunnelSimple size={14} weight="bold" />
        Filter
        {value !== "all" && <span className="text-white/80">· {activeLabel}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 z-30 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
          >
            {statusFilterOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-mist ${
                  value === o.value ? "text-brand" : "text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PhotoPicker({ photoUrls, onChange }: { photoUrls: string[]; onChange: (urls: string[]) => void }) {
  const addPhotos = (files: FileList) => {
    Promise.all(Array.from(files).map((file) => uploadPhoto("maintenance-photos", file)))
      .then((urls) => onChange([...photoUrls, ...urls]))
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
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) addPhotos(e.target.files);
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
  report,
  onClose,
  onConfirm,
}: {
  report: MaintenanceReport;
  onClose: () => void;
  onConfirm: () => void;
}) {
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
          <Button variant="dangerSolid" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      }
    >
      <div className="rounded-lg border border-line bg-mist px-3 py-2.5">
        <p className="line-clamp-2 text-sm font-medium text-ink">{report.description}</p>
        <p className="mt-0.5 text-xs text-muted">{report.location}</p>
      </div>
      <p className="mt-3 text-sm text-muted">This can't be undone.</p>
    </Modal>
  );
}

const statusTextColor: Record<MaintenanceStatus, string> = {
  open: "text-orange-600",
  "in-progress": "text-amber-600",
  resolved: "text-emerald-600",
};

/** What the single primary button at the bottom does next — status only ever advances open → in
 * progress → resolved from here; going back to open is a deliberate "Reopen" correction, styled
 * differently (secondary, not primary) since it's undoing progress rather than making it. */
const PRIMARY_ACTION: Record<MaintenanceStatus, { label: string; next: MaintenanceStatus; variant: "primary" | "secondary" }> = {
  open: { label: "Start work", next: "in-progress", variant: "primary" },
  "in-progress": { label: "Mark resolved", next: "resolved", variant: "primary" },
  resolved: { label: "Reopen", next: "open", variant: "secondary" },
};

/** One label/value line in the Details list — plain text, no card, separated from its neighbors
 * purely by the parent's divide-y border. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}

/** Small "⋯" header menu standing in for the old standalone edit-pencil button — Edit/Log repair
 * cost/Delete all live here now instead of being spread across the header and the drawer's footer. */
function DetailOverflowMenu({
  onEdit,
  expenseLinkState,
  onDelete,
}: {
  onEdit: () => void;
  expenseLinkState: { expensePrefill: { name: string; description: string; categoryId: string } };
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

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
      >
        <DotsThreeVertical size={18} weight="bold" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-mist"
            >
              Edit request
            </button>
            <Link
              to="/expense-tracker"
              state={expenseLinkState}
              onClick={() => setOpen(false)}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-mist"
            >
              Log repair cost
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
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

  const primaryAction = PRIMARY_ACTION[request.status];

  return (
    <SlideOver
      onClose={onClose}
      title={request.location}
      description={
        !isEditing && (
          <>
            {request.tenant.trim() && (
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
                ·{" "}
              </>
            )}
            Reported {formatDate(request.submittedAt)}
          </>
        )
      }
      headerActions={
        !isEditing && (
          <DetailOverflowMenu
            onEdit={startEditing}
            expenseLinkState={{
              expensePrefill: {
                name: `Repair — ${request.location}`,
                description: request.description,
                categoryId: "maintenance",
              },
            }}
            onDelete={() => setConfirmingDelete(true)}
          />
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
          <Button
            variant={primaryAction.variant}
            onClick={() => onSetStatus(primaryAction.next)}
            className="w-full py-2.5 hover:scale-[1.01]"
          >
            {primaryAction.label}
          </Button>
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
        <div>
          <p className="text-xs font-medium text-muted">Description</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{request.description}</p>

          <p className="mt-5 text-xs font-medium text-muted">Photos</p>
          {request.photoUrls.length === 0 ? (
            <p className="mt-1.5 text-sm text-muted">No photos attached.</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {request.photoUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line transition-opacity hover:opacity-80"
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-5 divide-y divide-line border-t border-line">
            <DetailRow label="Request status">
              <Select value={request.status} onValueChange={(v) => onSetStatus(v as MaintenanceStatus)}>
                <SelectTrigger size="sm" className={`border border-gray-300 bg-transparent px-3 shadow-none font-medium ${statusTextColor[request.status]}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-gray-300">
                  {(["open", "in-progress", "resolved"] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DetailRow>

            {request.status === "resolved" && request.resolvedAt && (
              <DetailRow label="Resolved">
                <span className="text-sm text-ink">{formatDate(request.resolvedAt)}</span>
              </DetailRow>
            )}

            {pendingMaintenanceIds.has(request.id) && (
              <DetailRow label="Sync">
                <PendingSyncTag />
              </DetailRow>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {confirmingDelete && (
          <ConfirmDeleteModal report={request} onClose={() => setConfirmingDelete(false)} onConfirm={() => { setConfirmingDelete(false); onDelete(); }} />
        )}
      </AnimatePresence>

      {lightboxIndex !== null && (
        <Lightbox photos={request.photoUrls} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </SlideOver>
  );
}

function AddRequestDrawer({ onClose, onSave }: { onClose: () => void; onSave: (request: Omit<MaintenanceReport, "id" | "unread" | "resolvedAt" | "priority">) => void }) {
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
        <p className="text-xs text-muted">Priority is set automatically once submitted — you can change it afterward from the request.</p>
      </div>
    </SlideOver>
  );
}

export default function Maintenance() {
  const { reports, isReady, setStatus, markRead, addReport, updateReport, deleteReport } = useMaintenance();
  const pendingMaintenanceIds = usePendingMaintenanceIds();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingRequest, setAddingRequest] = useState(false);

  // Picked up when the global Create launcher (Header.tsx) navigates here with ?action=add-request
  // instead of clicking this page's own "+ Add maintenance request" button — cleared immediately
  // after so a refresh or back/forward doesn't reopen the drawer.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("action") === "add-request") {
      setAddingRequest(true);
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Deep-linked here from a task or notification about a specific report (Today's tasks / Recent
  // activity / Notifications — see linkResolver.ts) — opens straight to that report instead of
  // leaving the landlord to find it in the list themselves. Left alone (no redirect) if the id
  // isn't found: it may have been deleted, or reports just haven't loaded yet.
  useEffect(() => {
    const reportId = new URLSearchParams(location.search).get("report");
    if (reportId && reports.some((r) => r.id === reportId)) {
      setSelectedId(reportId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, reports]);
  const [statusFilter, setStatusFilter] = useState<"all" | MaintenanceStatus>("all");
  const [deletingReport, setDeletingReport] = useState<MaintenanceReport | null>(null);

  const selected = reports.find((r) => r.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const rows = reports.filter(
      (r) =>
        (statusFilter === "all" || r.status === statusFilter) &&
        (r.location.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase()))
    );
    return [...rows].sort((a, b) => {
      const statusDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (statusDiff !== 0) return statusDiff;
      const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.submittedAt < b.submittedAt ? 1 : -1;
    });
  }, [reports, query, statusFilter]);

  // Resolution time only means something once a report has actually been resolved — an open
  // report's age isn't a "resolution time" yet, so it's excluded rather than pulling the average
  // toward zero.
  const avgResolutionDays = useMemo(() => {
    const resolved = reports.filter((r) => r.status === "resolved" && r.resolvedAt);
    if (resolved.length === 0) return null;
    const totalDays = resolved.reduce(
      (sum, r) => sum + (new Date(r.resolvedAt!).getTime() - new Date(r.submittedAt).getTime()) / 86_400_000,
      0
    );
    return totalDays / resolved.length;
  }, [reports]);

  const openCount = reports.filter((r) => r.status === "open").length;
  const inProgressCount = reports.filter((r) => r.status === "in-progress").length;
  const urgentCount = reports.filter((r) => r.priority === "urgent" && r.status !== "resolved").length;

  const openRequest = (r: MaintenanceReport) => {
    setSelectedId(r.id);
    if (r.unread) markRead(r.id);
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
      <PageHeader
        title="Maintenance requests"
        description="Review and resolve maintenance requests from tenants."
        actions={
          <div className="flex items-center gap-2">
            {reports.length !== 0 && (
              <Button
                variant="secondary"
                onClick={() => downloadMaintenanceCsv("maintenance-requests.csv", filtered)}
              >
                <DownloadSimple size={14} weight="bold" />
                Export
              </Button>
            )}
            <Button variant="primary" onClick={() => setAddingRequest(true)} className="hover:scale-[1.02]">
              + New request
            </Button>
          </div>
        }
      />

      <div className="space-y-5 px-4 pb-24 sm:px-8">
        {reports.length !== 0 && (
          <div className="flex flex-wrap divide-x divide-line rounded-lg border border-line bg-white max-sm:divide-x-0 max-sm:divide-y">
            <StatCard label="Open" value={openCount} />
            <StatCard label="Urgent" value={urgentCount} valueClassName={urgentCount > 0 ? "text-red-600" : undefined} />
            <StatCard label="In progress" value={inProgressCount} />
            <StatCard label="Avg. resolution" value={avgResolutionDays === null ? "—" : `${avgResolutionDays.toFixed(1)} days`} />
          </div>
        )}

        {reports.length !== 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tenant, unit or issue"
                className="w-56 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>

            <FilterMenu value={statusFilter} onChange={setStatusFilter} />
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
          <TableCard>
            {/* Mobile: cards */}
            <div className="divide-y divide-line md:hidden">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openRequest(r)}
                  className={`flex w-full items-start justify-between gap-3 p-6 text-left transition-colors active:bg-mist ${r.unread ? "bg-mist" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="line-clamp-2 text-sm font-semibold text-ink">{r.description}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{r.location}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {r.tenant} · {timeAgo(r.submittedAt)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusPill tone={priorityTone[r.priority]}>{priorityLabel[r.priority]}</StatusPill>
                      <StatusPill tone={statusTone[r.status]}>{statusLabel[r.status]}</StatusPill>
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
              {filtered.length === 0 && (
                <p className="px-4 py-10 text-center text-xs text-muted">No requests match your search.</p>
              )}
            </div>

            {/* Desktop / tablet: single flat table across every status, same chrome as every other
                data table in the app (Rent, Tenants, Payouts, Reports) */}
            <div className="hidden md:block">
              <DataTable>
                <DataTableHead>
                  <Th>Request</Th>
                  <Th>Reported by</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th></Th>
                </DataTableHead>
                <DataTableBody>
                  {filtered.length === 0 ? (
                    <TableEmptyState
                      colSpan={6}
                      icon={<Wrench size={22} weight="duotone" />}
                      title="No requests match your search"
                      description="Try a different search term."
                    />
                  ) : (
                    filtered.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => openRequest(r)}
                        className={`group cursor-pointer transition-colors duration-200 ease-in-out hover:bg-mist ${r.unread ? "bg-mist" : ""}`}
                      >
                        <Td className="max-w-sm">
                          <div className="flex items-center gap-1.5">
                            <span className="line-clamp-2 font-semibold whitespace-normal text-ink group-hover:underline">{r.description}</span>
                            {r.photoUrls.length > 0 && (
                              <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                                <Image size={10} weight="duotone" />
                                {r.photoUrls.length > 1 ? r.photoUrls.length : ""}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted">{r.location}</p>
                          <p className="mt-1 text-[11px] text-muted">{timeAgo(r.submittedAt)}</p>
                        </Td>
                        <Td className="text-muted">{r.tenant}</Td>
                        <Td>
                          <StatusPill tone={priorityTone[r.priority]}>{priorityLabel[r.priority]}</StatusPill>
                        </Td>
                        <Td>
                          <StatusPill tone={statusTone[r.status]}>{statusLabel[r.status]}</StatusPill>
                        </Td>
                        <Td className="text-muted whitespace-nowrap">{formatDate(r.submittedAt)}</Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            <span onClick={(e) => e.stopPropagation()}>
                              <RowActionsMenu
                                onView={() => openRequest(r)}
                                onAdvance={() => setStatus(r.id, nextStatus[r.status])}
                                advanceLabel={`Mark as ${statusLabel[nextStatus[r.status]]}`}
                                onDelete={() => setDeletingReport(r)}
                              />
                            </span>
                            <CaretRight size={14} weight="bold" className="shrink-0 text-muted/50" />
                          </div>
                        </Td>
                      </tr>
                    ))
                  )}
                </DataTableBody>
              </DataTable>
            </div>
          </TableCard>
        )}
      </div>

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
              showToast("Request deleted", "success");
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
        {deletingReport && (
          <ConfirmDeleteModal
            report={deletingReport}
            onClose={() => setDeletingReport(null)}
            onConfirm={() => {
              deleteReport(deletingReport.id);
              setDeletingReport(null);
              showToast("Request deleted", "success");
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}