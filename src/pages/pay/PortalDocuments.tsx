import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPortalDocuments, type PortalDocument } from "../../lib/payPortal";
import { usePortalIdentity } from "./usePortalIdentity";
import PortalHeader from "./PortalHeader";
import PortalFooter from "./PortalFooter";
import BackArrow from "./BackArrow";
import { Skeleton as SkeletonBlock } from "../../landlord/components/Skeleton";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PortalDocuments() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { tenantId, propertyName, propertyLogoUrl, notFound } = usePortalIdentity(token);
  const [documents, setDocuments] = useState<PortalDocument[] | null | undefined>(undefined);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const docs = await getPortalDocuments(tenantId);
        if (!cancelled) setDocuments(docs);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load documents", err);
        setDocuments(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <div className="portal-documents-page">
      <style>{`
        .portal-documents-page {
          /* Deliberately NOT the same white as --paper-raised — see RentStatement.tsx's note; the
             perforation strip's "holes" are punched in this color and need to actually contrast
             against the card. */
          --paper: #F6F5F1;
          --paper-raised: #FFFFFF;
          --ink: #1B2420;
          --ink-muted: #5B665F;
          --rule: rgba(27,36,32,0.14);
          --action: #1E3A8A;
          --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
          --sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

          background: var(--paper);
          color: var(--ink);
          font-family: var(--sans);
          min-height: 100vh;
        }
        .portal-documents-page * { box-sizing: border-box; }
        .portal-documents-page .page { width: 100%; max-width: 440px; margin: 0 auto; padding: 20px 16px 48px; }

        .portal-documents-page .back {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: var(--sans); font-size: 13px; color: var(--ink-muted);
          background: none; border: none; padding: 0; cursor: pointer; margin: 4px 0 18px;
        }
        .portal-documents-page .back:hover { color: var(--ink); }

        .portal-documents-page h1 { font-family: var(--serif); font-weight: 500; font-size: 22px; margin: 0 0 4px; }
        .portal-documents-page .sub { font-family: var(--sans); font-size: 13px; color: var(--ink-muted); margin: 0 0 18px; }

        .portal-documents-page .card {
          background: var(--paper-raised); border: 1px solid var(--rule); border-radius: 2px; overflow: hidden;
          box-shadow: 0 1px 3px rgba(27,36,32,0.06), 0 4px 14px rgba(27,36,32,0.04);
        }
        .portal-documents-page .perforation {
          height: 14px;
          background-image: radial-gradient(circle at 8px 0px, var(--paper) 6px, transparent 6.5px);
          background-size: 16px 14px;
          background-repeat: repeat-x;
          background-position: center top;
        }
        .portal-documents-page .doc-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px 16px; border-top: 1px solid var(--rule);
        }
        .portal-documents-page .doc-row:first-child { border-top: none; }
        .portal-documents-page .doc-info { min-width: 0; }
        .portal-documents-page .doc-name {
          font-family: var(--sans); font-size: 14px; color: var(--ink); margin: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .portal-documents-page .doc-meta { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 2px 0 0; }
        .portal-documents-page .doc-download {
          flex-shrink: 0; padding: 8px 14px;
          font-family: var(--sans); font-size: 13px; font-weight: 500;
          color: var(--action); border: 1px solid var(--rule); border-radius: 2px;
          text-decoration: none; white-space: nowrap;
        }
        .portal-documents-page .doc-download:hover { background: #F5F5F1; }
        .portal-documents-page .empty {
          padding: 40px 16px; text-align: center; font-family: var(--sans); font-size: 13px; color: var(--ink-muted);
        }
      `}</style>

      <PortalHeader propertyName={propertyName} avatarUrl={propertyLogoUrl} />

      <div className="page">
        <button type="button" className="back" onClick={() => navigate(`/p/${token}`)}>
          <BackArrow className="h-3.5 w-3.5" />
          Back to statement
        </button>

        <h1>Documents &amp; receipts</h1>
        <p className="sub">Payment receipts and anything else your landlord has shared with you.</p>

        {notFound || documents === null ? (
          <p className="sub">We couldn't load your documents. Open your payment link again.</p>
        ) : documents === undefined ? (
          <div className="card" style={{ padding: 16 }}>
            <SkeletonBlock className="h-4 w-40 mb-3" />
            <SkeletonBlock className="h-4 w-full mb-2" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
        ) : documents.length === 0 ? (
          <div className="card">
            <div className="perforation" />
            <p className="empty">No documents yet. A receipt shows up here right after each payment.</p>
          </div>
        ) : (
          <div className="card">
            <div className="perforation" />
            {documents.map((doc) => (
              <div key={doc.id} className="doc-row">
                <div className="doc-info">
                  <p className="doc-name">{doc.name}</p>
                  <p className="doc-meta">
                    {formatShortDate(doc.createdAt)}
                    {doc.sizeBytes != null ? ` · ${formatSize(doc.sizeBytes)}` : ""}
                  </p>
                </div>
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="doc-download">
                    Download
                  </a>
                ) : (
                  <span className="doc-meta">Unavailable</span>
                )}
              </div>
            ))}
          </div>
        )}

        <PortalFooter />
      </div>
    </div>
  );
}
