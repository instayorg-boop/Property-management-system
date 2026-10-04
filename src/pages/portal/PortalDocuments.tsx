import { useParams } from "react-router-dom";
import { FilePdf, FileText, Image as ImageIcon, ArrowSquareOut } from "@phosphor-icons/react";
import { usePortal, usePortalDocuments } from "./portalData";
import { Card, PortalMessage, PortalTopBar, PoweredByInstay, Shimmer, formatDate } from "./portalUi";

function fileIcon(contentType: string | null) {
  if (contentType?.includes("pdf")) return <FilePdf size={18} />;
  if (contentType?.startsWith("image/")) return <ImageIcon size={18} />;
  return <FileText size={18} />;
}

function fileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PortalDocuments() {
  const { token } = useParams();
  const { tenant, loading } = usePortal(token);
  const { data: documents, loading: docsLoading } = usePortalDocuments(tenant?.id);

  return (
    <>
      <PortalTopBar title="Documents" fallbackTo={`/p/${token}`} />

      {loading || docsLoading ? (
        <Shimmer className="h-[180px] w-full rounded-lg" />
      ) : !documents || documents.length === 0 ? (
        <PortalMessage
          title="No documents yet"
          body="Receipts for your payments, and anything your property manager shares with you, will appear here."
        />
      ) : (
        <Card>
          {documents.map((doc) => {
            const meta = [fileSize(doc.sizeBytes), formatDate(doc.createdAt)].filter(Boolean).join(" · ");
            // A document whose signed URL failed to mint renders as a disabled row rather than a
            // link that goes nowhere — the tenant can see it exists and ask about it.
            const content = (
              <>
                <span className="p-row-label" style={{ color: "var(--p-accent)" }}>
                  {fileIcon(doc.contentType)}
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium" style={{ color: "var(--p-ink)" }}>
                      {doc.name}
                    </span>
                    {meta && (
                      <span className="mt-0.5 block text-[12px]" style={{ color: "var(--p-muted)" }}>
                        {meta}
                      </span>
                    )}
                  </span>
                </span>
                <span style={{ color: doc.url ? "var(--p-muted)" : "var(--p-line-strong)" }}>
                  <ArrowSquareOut size={17} />
                </span>
              </>
            );
            return doc.url ? (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-row no-underline"
                style={{ alignItems: "center" }}
              >
                {content}
              </a>
            ) : (
              <div key={doc.id} className="p-row">
                {content}
              </div>
            );
          })}
        </Card>
      )}

      <div className="flex-1" />
      <PoweredByInstay />
    </>
  );
}
