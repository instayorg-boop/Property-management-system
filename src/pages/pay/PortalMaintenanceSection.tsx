import { useState } from "react";
import { uploadPhoto } from "../../lib/storage";
import { submitPortalMaintenanceReport } from "../../lib/payPortal";

export type MaintenancePhoto = { id: string; dataUrl: string; file: File };

export type PortalMaintenanceSectionProps = {
  propertySlug: string;
  tenantId: string;
};

type MaintStep = "prompt" | "form" | "confirm";

/** Shared "Report an issue" card — mounted on both the success and failure pages (a payment not
 * going through is no reason a tenant can't also flag something broken in their unit), so this is
 * its own component rather than living only inside PaymentComplete. */
export default function PortalMaintenanceSection({ propertySlug, tenantId }: PortalMaintenanceSectionProps) {
  const [maintStep, setMaintStep] = useState<MaintStep>("prompt");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<MaintenancePhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhotoSelect = (files: FileList | null) => {
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

  const removePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));

  const sendReport = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const photoUrls = await Promise.all(photos.map((p) => uploadPhoto("maintenance-photos", p.file)));
      await submitPortalMaintenanceReport(propertySlug, tenantId, location, description, photoUrls);
      setMaintStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send the report. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card print:hidden">
      {maintStep === "prompt" && (
        <div className="maint">
          <p className="title">Need something fixed?</p>
          <p className="desc">Report a maintenance issue and your property manager will follow up.</p>
          <button type="button" className="btn-primary" onClick={() => setMaintStep("form")}>
            Report an issue
          </button>
        </div>
      )}

      {maintStep === "form" && (
        <div className="maint">
          <p className="title">Report an issue</p>
          <div className="field">
            <label htmlFor="issue-location">Location</label>
            <input
              id="issue-location"
              type="text"
              placeholder="e.g. Bathroom"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="field">
            <label htmlFor="issue-desc">Description</label>
            <textarea
              id="issue-desc"
              placeholder="Describe what's wrong and where"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="field">
            <label>Photos</label>
            <div className="drop">
              Tap to add photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  handlePhotoSelect(e.target.files);
                  e.target.value = "";
                }}
                disabled={submitting}
              />
            </div>
            {photos.length > 0 && (
              <div className="thumbs">
                {photos.map((p) => (
                  <div key={p.id} className="thumb">
                    <img src={p.dataUrl} alt="" />
                    <button type="button" onClick={() => removePhoto(p.id)} aria-label="Remove photo" disabled={submitting}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <p className="desc" style={{ color: "var(--red)" }}>{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setMaintStep("prompt")} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={sendReport}
              disabled={submitting || !location.trim() || !description.trim()}
            >
              {submitting ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      )}

      {maintStep === "confirm" && (
        <div className="maint confirm">
          <svg className="mark-sm" width="32" height="32" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="26" cy="26" r="25" stroke="var(--green)" strokeWidth="1.5" />
            <path d="M16 27L22.5 33.5L36.5 18.5" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="msg">Request sent. A manager will follow up soon.</p>
        </div>
      )}
    </div>
  );
}
