import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { FilePdf, ArrowSquareOut, CircleNotch } from "@phosphor-icons/react";
import { generateRecordedPortalReceipt, groupPortalLedger, type PortalLedgerRow, type PortalDocument } from "../../lib/payPortal";
import { invalidatePortalDocuments, usePortal, usePortalDocuments } from "./portalData";
import {
  Card,
  MoneyRow,
  Pill,
  PortalButton,
  PortalMessage,
  PortalTopBar,
  PoweredByInstay,
  Row,
  SectionLabel,
  Shimmer,
  formatDate,
  formatMoney,
  type ToneName,
} from "./portalUi";

/**
 * Ledger rows have no id of their own, so a row addresses itself by the two fields that together
 * identify it — when it was logged and what it was for.
 *
 * base64url, not encodeURIComponent: the key is a path segment, and React Router hands `useParams`
 * back already-decoded, so a percent-encoded key never matched the encoded one this function
 * produced and every entry opened as "we couldn't find that entry". Base64url has no characters
 * that survive a round trip differently, and it also can't break the route when a label contains a
 * slash.
 */
export function ledgerEntryKey(row: PortalLedgerRow): string {
  // encodeURIComponent first so btoa (latin1-only) can't throw on a non-ASCII label.
  const raw = btoa(encodeURIComponent(`${row.createdAt}|${row.label}`));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const STATUS: Record<string, { tone: ToneName; label: string }> = {
  paid: { tone: "green", label: "Paid" },
  partial: { tone: "amber", label: "Partially paid" },
  overdue: { tone: "red", label: "Overdue" },
  unpaid: { tone: "amber", label: "Unpaid" },
};

/** Matches the PDF receipt that belongs to this entry.
 *
 * There is no foreign key to match on: pay-portal-generate-receipt files the receipt under the
 * tenant's documents keyed on the collection, and the ledger row it settles is a separate record
 * with only a label and a timestamp. What is reliable is the timing — the receipt is generated
 * within seconds of the payment being confirmed — so a PDF filed on the same calendar day as the
 * entry is its receipt. Where a tenant paid twice in one day, both PDFs show rather than one being
 * guessed at, and where nothing matches the page says so instead of linking to the wrong file. */
function receiptsFor(row: PortalLedgerRow, documents: PortalDocument[] | undefined): PortalDocument[] {
  if (!documents) return [];
  const day = new Date(row.createdAt).toDateString();
  // A receipt made on demand for a payment the landlord's import recorded is filed days after the
  // entry, so the same-day rule can't find it. Those carry the charge's own label in their name
  // ("October 2026 rent receipt.pdf"), which is matched as well.
  const named = `${row.label} receipt`.toLowerCase();
  return documents.filter(
    (d) =>
      d.contentType?.includes("pdf") &&
      (new Date(d.createdAt).toDateString() === day || d.name.toLowerCase().startsWith(named))
  );
}

/** Where a tenant last opened a payment page, so the home banner that points here can stand down. */
export function markReceiptSeen(tenantId: string) {
  try {
    localStorage.setItem(`ipm-receipt-seen:${tenantId}`, "1");
  } catch {
    // Storage can be blocked; the banner simply keeps showing.
  }
}
export function wasReceiptSeen(tenantId: string): boolean {
  try {
    return localStorage.getItem(`ipm-receipt-seen:${tenantId}`) === "1";
  } catch {
    return false;
  }
}

export default function PortalPaymentDetail() {
  const { token, entryKey } = useParams();
  const { ledger, tenant, loading } = usePortal(token);
  const { data: documents, loading: docsLoading } = usePortalDocuments(tenant?.id);

  const row = groupPortalLedger(ledger).find((r) => ledgerEntryKey(r) === entryKey);
  const rowLabel = row?.label;
  const tenantId = tenant?.id;
  const rowPaid = row ? (row.paidAmount ?? (row.status === "paid" ? row.amount : 0)) : 0;
  const hasReceipt = row ? receiptsFor(row, documents).length > 0 : false;

  // "idle" until a paid entry turns out to have no receipt on file; "working" while one is made on
  // the spot; "done" once it is filed and the documents list is reloading; "none" when the server
  // says there is nothing recorded to receipt (a cash payment, say); "failed" for anything else.
  const [gen, setGen] = useState<"idle" | "working" | "done" | "none" | "failed">("idle");
  const attempted = useRef("");

  const makeReceipt = async () => {
    if (!tenantId || !rowLabel) return;
    setGen("working");
    try {
      await generateRecordedPortalReceipt(tenantId, rowLabel);
      invalidatePortalDocuments(tenantId);
      setGen("done");
    } catch (e) {
      setGen(e instanceof Error && e.message.includes("No successful payment") ? "none" : "failed");
    }
  };

  useEffect(() => {
    if (tenantId) markReceiptSeen(tenantId);
  }, [tenantId]);

  const ready = !!documents && !docsLoading && !!tenantId && !!rowLabel && rowPaid > 0 && !hasReceipt;
  useEffect(() => {
    if (!ready) return;
    const key = `${tenantId}|${rowLabel}`;
    if (attempted.current === key) return;
    attempted.current = key;
    void makeReceipt();
    // makeReceipt only reads tenantId and rowLabel, both in the key above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tenantId, rowLabel]);

  if (loading) {
    return (
      <>
        <PortalTopBar title="Payment details" fallbackTo={`/p/${token}/history`} />
        <Shimmer className="h-60 w-full rounded-lg" />
      </>
    );
  }

  if (!row) {
    return (
      <>
        <PortalTopBar title="Payment details" fallbackTo={`/p/${token}/history`} />
        <PortalMessage
          title="We couldn't find that entry"
          body="It may have been updated since you last opened this page."
          action={<PortalButton to={`/p/${token}/history`}>Back to history</PortalButton>}
        />
      </>
    );
  }

  const status = row.status ? STATUS[row.status] : undefined;
  const paid = row.paidAmount ?? (row.status === "paid" ? row.amount : 0);
  const outstanding = Math.max(row.amount - paid, 0);
  const receipts = receiptsFor(row, documents);

  return (
    <>
      <PortalTopBar title="Payment details" fallbackTo={`/p/${token}/history`} />

      <div className="mb-5 text-center">
        <p className="text-[13px]" style={{ color: "var(--p-muted)" }}>
          {row.label}
        </p>
        <p className="num mt-1 text-[34px] font-semibold leading-none">{formatMoney(paid > 0 ? paid : row.amount)}</p>
        <div className="mt-3 flex justify-center">{status && <Pill tone={status.tone}>{status.label}</Pill>}</div>
      </div>

      <SectionLabel>Receipt</SectionLabel>
      {docsLoading ? (
        <Shimmer className="h-16 w-full rounded-lg" />
      ) : receipts.length > 0 ? (
        <Card>
          {receipts.map((doc) =>
            doc.url ? (
              <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer" className="p-row no-underline">
                <span className="p-row-label" style={{ color: "var(--p-accent)" }}>
                  <FilePdf size={18} />
                  <span className="truncate text-[14px] font-medium" style={{ color: "var(--p-ink)" }}>
                    {doc.name}
                  </span>
                </span>
                <span style={{ color: "var(--p-muted)" }}>
                  <ArrowSquareOut size={17} />
                </span>
              </a>
            ) : (
              <Row key={doc.id} label={doc.name} value="Unavailable" icon={<FilePdf size={18} />} />
            )
          )}
        </Card>
      ) : gen === "working" ? (
        <Card className="flex items-center gap-3 px-4 py-4">
          <CircleNotch size={20} className="animate-spin" style={{ color: "var(--p-accent)" }} />
          <p className="text-[13.5px]" style={{ color: "var(--p-muted)" }}>
            Preparing your receipt...
          </p>
        </Card>
      ) : gen === "failed" ? (
        <Card className="px-4 py-4">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
            We couldn't prepare your receipt just now.
          </p>
          <div className="mt-3">
            <PortalButton onClick={() => void makeReceipt()} variant="secondary">
              Try again
            </PortalButton>
          </div>
        </Card>
      ) : (
        <Card className="px-4 py-4">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
            {row.status === "paid" || paid > 0
              ? "No receipt is filed for this payment. Receipts are generated for payments made through this portal — ask your property manager if you paid another way."
              : "A receipt will be filed here once this period is paid."}
          </p>
        </Card>
      )}

      <SectionLabel>Breakdown</SectionLabel>
      <Card className="px-4 py-2">
        <MoneyRow label="Charged" amount={row.amount} />
        <MoneyRow label="Paid" amount={paid} />
        {outstanding > 0 && <MoneyRow label="Still owed" amount={outstanding} />}
        <MoneyRow label={outstanding > 0 ? "Balance on this period" : "Total settled"} amount={outstanding > 0 ? outstanding : paid} strong />
      </Card>

      <SectionLabel>Details</SectionLabel>
      <Card>
        <Row label="Date" value={formatDate(row.createdAt)} />
        <Row label="For" value={row.label} />
        {tenant && <Row label="Room" value={tenant.room || "-"} />}
      </Card>

      <div className="flex-1" />
      <PoweredByInstay />
    </>
  );
}
