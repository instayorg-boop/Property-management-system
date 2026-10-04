import { useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, Camera, X } from "@phosphor-icons/react";
import { submitPortalMaintenanceReport } from "../../lib/payPortal";
import { uploadPhoto } from "../../lib/storage";
import { usePortal, usePortalMaintenance, invalidatePortal } from "./portalData";
import { Card, Pill, PortalButton, PortalTopBar, PoweredByInstay, Shimmer, formatDate, type ToneName } from "./portalUi";

type Photo = { id: string; dataUrl: string; file: File };

const STATUS_TONE: Record<string, ToneName> = {
  open: "amber",
  pending: "amber",
  "in progress": "accent",
  in_progress: "accent",
  resolved: "green",
  closed: "green",
  completed: "green",
};

/** Suggestions, not a fixed list — a tenant can still type anything, but one tap covers the rooms
 * almost every report is actually about, which is the difference between a report being filed
 * from a phone and being put off. */
const COMMON_LOCATIONS = ["Bathroom", "Kitchen", "Bedroom", "Living room", "Electrical", "Plumbing", "Outside"];

export default function PortalMaintenance() {
  const { token } = useParams();
  const { tenant, identity, loading } = usePortal(token);
  const { data: reports, loading: reportsLoading } = usePortalMaintenance(tenant?.id);

  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result;
        if (typeof dataUrl !== "string") return;
        setPhotos((prev) => [...prev, { id: crypto.randomUUID(), dataUrl, file }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const submit = async () => {
    if (!identity || !tenant) return;
    setSubmitting(true);
    setError(null);
    try {
      const photoUrls = await Promise.all(photos.map((p) => uploadPhoto("maintenance-photos", p.file)));
      await submitPortalMaintenanceReport(identity.propertySlug, tenant.id, location.trim(), description.trim(), photoUrls);
      // The list below this form is cached — drop it so the request the tenant just filed is in it
      // when they come back to this page.
      invalidatePortal(token!, tenant.id);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send the request. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <PortalTopBar title="Report a problem" fallbackTo={`/p/${token}`} />
        <Shimmer className="h-[300px] w-full rounded-lg" />
      </>
    );
  }

  if (sent) {
    return (
      <>
        <PortalTopBar title="Report a problem" fallbackTo={`/p/${token}`} />
        <div className="flex flex-col items-center pt-10">
          <span
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: "var(--p-green-tint)", color: "var(--p-green)" }}
          >
            <CheckCircle size={38} weight="fill" />
          </span>
          <h2 className="display mt-5 text-[20px] font-semibold">Request sent</h2>
          <p className="mt-2 max-w-[300px] text-center text-[14px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
            Your property manager has it and will follow up. You can track it on this page.
          </p>
        </div>
        <div className="mt-6 space-y-2.5">
          <PortalButton to={`/p/${token}`}>Back home</PortalButton>
          <PortalButton
            variant="secondary"
            onClick={() => {
              setSent(false);
              setLocation("");
              setDescription("");
              setPhotos([]);
            }}
          >
            Report something else
          </PortalButton>
        </div>
        <div className="flex-1" />
        <PoweredByInstay />
      </>
    );
  }

  const canSubmit = location.trim().length > 0 && description.trim().length > 0 && !submitting;

  return (
    <>
      <PortalTopBar title="Report a problem" fallbackTo={`/p/${token}`} />

      <p className="mb-4 px-1 text-[14px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
        Tell your property manager what needs fixing. Photos help them come prepared.
      </p>

      <Card className="space-y-4 p-4">
        <div>
          <label htmlFor="mt-location" className="mb-1.5 block text-[13px] font-medium">
            Where is it?
          </label>
          <input
            id="mt-location"
            className="p-input"
            placeholder="e.g. Bathroom"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={submitting}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COMMON_LOCATIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setLocation(opt)}
                disabled={submitting}
                className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                style={{
                  background: location === opt ? "var(--p-accent-tint)" : "#F1F2F5",
                  color: location === opt ? "var(--p-accent)" : "var(--p-ink-soft)",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="mt-desc" className="mb-1.5 block text-[13px] font-medium">
            What's wrong?
          </label>
          <textarea
            id="mt-desc"
            className="p-input"
            rows={4}
            style={{ minHeight: 110, resize: "vertical" }}
            placeholder="Describe the problem — when it started, and anything that makes it worse."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium">Photos (optional)</span>
          <label
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-5 text-[13px] font-medium"
            style={{ borderColor: "var(--p-line-strong)", color: "var(--p-muted)" }}
          >
            <Camera size={18} />
            Add photos
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={submitting}
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {photos.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {photos.map((p) => (
                <span key={p.id} className="relative h-16 w-16 overflow-hidden rounded-lg">
                  <img src={p.dataUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    disabled={submitting}
                    onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
                  >
                    <X size={11} weight="bold" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-[13px]" style={{ color: "var(--p-red)" }}>
            {error}
          </p>
        )}

        <PortalButton onClick={submit} disabled={!canSubmit}>
          {submitting ? "Sending…" : "Submit request"}
        </PortalButton>
      </Card>

      {/* Past requests sit below the form, not above it — the reason a tenant opens this page is
          almost always to file a new one, and the history is what they check second. */}
      {!reportsLoading && reports && reports.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
            Your past requests
          </h2>
          <Card>
            {reports.map((r) => (
              <div key={r.id} className="p-row" style={{ alignItems: "flex-start" }}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{r.location}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
                    {r.description}
                  </span>
                  <span className="mt-1 block text-[12px]" style={{ color: "var(--p-muted)" }}>
                    {formatDate(r.submittedAt)}
                  </span>
                </span>
                <Pill tone={STATUS_TONE[r.status?.toLowerCase()] ?? "neutral"}>{r.status || "Open"}</Pill>
              </div>
            ))}
          </Card>
        </>
      )}

      <div className="flex-1" />
      <PoweredByInstay />
    </>
  );
}
