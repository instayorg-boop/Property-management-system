import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { CaretLeft, Paperclip, CheckCircle, X } from "@phosphor-icons/react";
import { getPortalProperty, getPortalTenant, getPortalSessionToken, submitPortalMaintenanceReport, type PortalTenant } from "../../lib/payPortal";
import { uploadPhoto } from "../../lib/storage";
import PayShell from "./PayShell";

export default function MaintenanceReport() {
  const { propertySlug, tenantId } = useParams();
  const navigate = useNavigate();
  const [propertyName, setPropertyName] = useState("");
  const [tenant, setTenant] = useState<PortalTenant | null | undefined>(undefined);

  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!propertySlug || !tenantId) return;
    // This page requires the same OTP-verified session TenantBalance establishes — if someone
    // lands here directly (a bookmarked/shared link, a refresh that lost the session) without one,
    // send them to verify there first rather than showing a silent infinite spinner.
    if (!getPortalSessionToken(tenantId)) {
      navigate(`/pay/${propertySlug}/${tenantId}`, { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      const [property, t] = await Promise.all([getPortalProperty(propertySlug), getPortalTenant(propertySlug, tenantId)]);
      if (cancelled) return;
      setPropertyName(property?.name ?? "");
      setTenant(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertySlug, tenantId, navigate]);

  if (tenant === undefined) return <PayShell propertyName={propertyName}>{null}</PayShell>;

  if (!tenant) {
    return (
      <PayShell propertyName={propertyName}>
        <p className="text-sm text-muted">We couldn't find that tenant.</p>
        <Link to={`/pay/${propertySlug}`} className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
          ← Back to search
        </Link>
      </PayShell>
    );
  }

  if (submitted) {
    return (
      <PayShell propertyName={propertyName}>
        <div className="flex flex-col items-center py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle size={32} weight="fill" />
          </div>
          <p className="mt-4 font-display text-lg font-semibold tracking-tight text-ink">Report submitted</p>
          <p className="mt-1 text-sm text-muted">The landlord has been notified and will follow up.</p>
          <Link
            to={`/pay/${propertySlug}/${tenant.id}`}
            className="mt-6 block w-full rounded-lg border border-line py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            Back to my balance
          </Link>
        </div>
      </PayShell>
    );
  }

  const submit = () => {
    if (!description.trim() || !propertySlug) return;
    void submitPortalMaintenanceReport(propertySlug, tenant.id, tenant.room, description.trim(), photoUrls).catch((e) =>
      console.error("Failed to submit report", e)
    );
    setSubmitted(true);
  };

  return (
    <PayShell propertyName={propertyName}>
      <button
        type="button"
        onClick={() => navigate(`/pay/${propertySlug}/${tenant.id}`)}
        className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
      >
        <CaretLeft size={12} weight="bold" />
        Back
      </button>

      <p className="mt-3 font-display text-lg font-semibold tracking-tight text-ink">Report an issue</p>
      <p className="mt-1 text-sm text-muted">
        {tenant.name} · {tenant.room}
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">What's the issue?</label>
          <textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="e.g. Tap in the bathroom won't stop dripping."
            className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Photos (optional)</label>
          <div className="flex flex-wrap gap-2">
            {photoUrls.map((url, i) => (
              <div key={i} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-mist">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
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
                  if (!file) return;
                  uploadPhoto("maintenance-photos", file)
                    .then((url) => setPhotoUrls((prev) => [...prev, url]))
                    .catch((err) => console.error("Failed to upload photo", err));
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!description.trim()}
        className="mt-5 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
      >
        Submit report
      </button>
    </PayShell>
  );
}
