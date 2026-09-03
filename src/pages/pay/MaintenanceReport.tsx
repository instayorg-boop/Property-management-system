import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { CaretLeft, Paperclip, CheckCircle } from "@phosphor-icons/react";
import { useTenants } from "../../landlord/TenantsContext";
import { useMaintenance } from "../../landlord/MaintenanceContext";
import { useSettings } from "../../landlord/SettingsContext";
import PayShell from "./PayShell";

export default function MaintenanceReport() {
  const { propertySlug, tenantId } = useParams();
  const navigate = useNavigate();
  const { propertyName } = useSettings();
  const { tenants } = useTenants();
  const { addReport } = useMaintenance();

  const tenant = tenants.find((t) => t.id === tenantId);

  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);

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
    if (!description.trim()) return;
    addReport({
      tenant: tenant.name,
      location: tenant.room,
      description: description.trim(),
      submittedAt: new Date().toISOString(),
      status: "open",
      hasPhoto: !!photoUrl,
      photoUrl,
    });
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
          <label className="mb-1.5 block text-xs font-medium text-muted">Photo (optional)</label>
          {photoUrl ? (
            <div className="space-y-2">
              <div className="h-40 overflow-hidden rounded-lg border border-line bg-mist">
                <img src={photoUrl} alt="Attached to this report" className="h-full w-full object-cover" />
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
