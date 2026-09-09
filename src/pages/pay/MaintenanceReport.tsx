import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Paperclip, CheckCircle, X } from "@phosphor-icons/react";
import { getPortalProperty, getPortalTenant, getPortalSessionToken, submitPortalMaintenanceReport, type PortalTenant } from "../../lib/payPortal";
import { uploadPhoto } from "../../lib/storage";
import PayShell from "./PayShell";
import BackArrow from "./BackArrow";
import Spinner from "./Spinner";
import Skeleton from "./Skeleton";

export default function MaintenanceReport() {
  const { propertySlug, tenantId } = useParams();
  const navigate = useNavigate();
  const [propertyName, setPropertyName] = useState("");
  const [tenant, setTenant] = useState<PortalTenant | null | undefined>(undefined);

  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  // Defaults to the tenant's own room but stays editable — the issue might be in a shared
  // bathroom, a common area, or a roommate's space rather than where the tenant sleeps.
  useEffect(() => {
    if (tenant) setLocation((prev) => prev || tenant.room);
  }, [tenant]);

  if (tenant === undefined) {
    return (
      <PayShell propertyName={propertyName}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-5 w-40" />
        <Skeleton className="mt-1 h-3 w-28" />
        <Skeleton className="mt-6 h-24 w-full" />
        <Skeleton className="mt-5 h-11 w-full rounded-full" />
      </PayShell>
    );
  }

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
        <div className="pay-step flex flex-col items-center py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle size={32} weight="fill" />
          </div>
          <p className="mt-4 font-display text-lg font-semibold tracking-tight text-[#0d253d]">Report submitted</p>
          <p className="mt-1 text-sm text-[#64748d]">The landlord has been notified and will follow up.</p>
          <Link
            to={`/pay/${propertySlug}/${tenant.id}`}
            className="mt-6 block w-full rounded-full border border-[#e3e8ee] py-2.5 text-sm font-medium text-[#0d253d] transition-colors hover:bg-[#f6f9fc]"
          >
            Back to my balance
          </Link>
        </div>
      </PayShell>
    );
  }

  const submit = () => {
    if (!description.trim() || !location.trim() || !propertySlug || submitting) return;
    setSubmitting(true);
    submitPortalMaintenanceReport(propertySlug, tenant.id, location.trim(), description.trim(), photoUrls)
      .catch((e) => console.error("Failed to submit report", e))
      .finally(() => setSubmitted(true));
  };

  return (
    <PayShell propertyName={propertyName}>
      <div className="pay-step">
      <button
        type="button"
        onClick={() => navigate(`/pay/${propertySlug}/${tenant.id}`)}
        className="flex items-center gap-1 text-xs font-medium text-[#64748d] hover:text-[#0d253d]"
      >
        <BackArrow className="h-4 w-4" />
        Back
      </button>

      <p className="mt-3 font-display text-lg font-semibold tracking-tight text-[#0d253d]">Report an issue</p>
      <p className="mt-1 text-sm text-[#64748d]">
        {tenant.name} · {tenant.room}
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#64748d]">Where is the issue?</label>
          <input
            autoFocus
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Shared bathroom, 2nd floor"
            className="w-full rounded-md border border-[#a8c3de] px-3 py-2.5 text-sm outline-none focus:border-[#533afd]"
          />
          <p className="mt-1 text-[11px] text-[#64748d]">
            Defaults to your room ({tenant.room}) — change it if the issue is somewhere shared, like a bathroom or hallway.
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#64748d]">What's the issue?</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="e.g. Tap in the bathroom won't stop dripping."
            className="w-full resize-none rounded-md border border-[#a8c3de] px-3 py-2.5 text-sm outline-none focus:border-[#533afd]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#64748d]">Photos (optional)</label>
          <div className="flex flex-wrap gap-2">
            {photoUrls.map((url, i) => (
              <div key={i} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-[#e3e8ee] bg-[#f6f9fc]">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#0d253d]/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X size={9} weight="bold" />
                </button>
              </div>
            ))}
            <label className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[#a8c3de] text-[#64748d] transition-colors hover:bg-[#f6f9fc]">
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
        disabled={!description.trim() || !location.trim() || submitting}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#533afd] py-3 text-sm font-medium text-white transition-colors hover:bg-[#4434d4] active:bg-[#2e2b8c] disabled:opacity-50"
      >
        {submitting && <Spinner size={14} color="#fff" />}
        {submitting ? "Submitting" : "Submit report"}
      </button>
      </div>
    </PayShell>
  );
}
