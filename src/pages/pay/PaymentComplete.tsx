import { useState } from "react";
import PortalHeader from "./PortalHeader";
import PortalFooter from "./PortalFooter";
import PortalMaintenanceSection from "./PortalMaintenanceSection";
import { generatePortalReceipt, getPortalDocuments } from "../../lib/payPortal";

export type PaymentCompleteProps = {
  /** Not on PortalTenant yet — passed in separately, same placeholder gap as the other pages. */
  propertyName?: string;
  /** Property/landlord photo — see PortalHeader's comment; omitted until upload exists. */
  avatarUrl?: string | null;
  propertySlug: string;
  tenantId: string;
  room: string;
  paidAmount: number;
  /** The rent-only portion of paidAmount and the sending fee (rate depends on the tenant's rent
   * band — see src/lib/pricing.ts) — shown as separate receipt line items, matching the receipt
   * PDF's layout rather than one lump figure. */
  rentPortion: number;
  feeAmount: number;
  /** Whatever's left owing after this payment — 0 means it fully cleared the balance. */
  remainingBalance: number;
  reference: string;
  /** The collections row id — needed to generate/fetch the real PDF receipt. */
  collectionId: string;
  operator: "mtn" | "airtel" | "zamtel";
  phone: string;
  paidAt: Date;
};

const OPERATOR_LABEL: Record<PaymentCompleteProps["operator"], string> = { mtn: "MTN", airtel: "Airtel", zamtel: "Zamtel" };

function formatMoney(amount: number): string {
  return `K${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lastDigits(phone: string, count: number): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-count);
}

function formatDateTime(date: Date): string {
  const datePart = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const timePart = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

export default function PaymentComplete({
  propertyName,
  avatarUrl,
  propertySlug,
  tenantId,
  room,
  paidAmount,
  rentPortion,
  feeAmount,
  remainingBalance,
  reference,
  collectionId,
  operator,
  phone,
  paidAt,
}: PaymentCompleteProps) {
  const isFull = remainingBalance <= 0;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const downloadReceipt = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { documentId } = await generatePortalReceipt(tenantId, collectionId);
      const documents = await getPortalDocuments(tenantId);
      const receipt = documents.find((d) => d.id === documentId);
      if (!receipt?.url) throw new Error("Receipt wasn't ready. Try again in a moment.");
      window.open(receipt.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to download the receipt.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="pay-complete-page">
      <style>{`
        .pay-complete-page {
          --paper: #FFFFFF;
          --paper-raised: #FFFFFF;
          --ink: #1B2420;
          --ink-muted: #5B665F;
          --rule: rgba(27,36,32,0.14);
          --green: #2F5233;
          --green-tint: #E4EAE1;
          --amber: #9C6B22;
          --amber-tint: #F1E7D4;
          --red: #DC2626;
          --red-tint: #FEE2E2;
          --action: #1E3A8A;
          --action-text: #FFFFFF;
          --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
          --sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

          background: var(--paper);
          color: var(--ink);
          font-family: var(--sans);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .pay-complete-page * { box-sizing: border-box; }
        .pay-complete-page .page { width: 100%; max-width: 440px; padding: 24px 16px 64px; }

        .pay-complete-page .heading-block { padding: 8px 4px 22px; text-align: center; }
        .pay-complete-page .mark { margin: 0 auto 16px; display: block; }
        .pay-complete-page .status-tag {
          display: inline-block; font-family: var(--sans); font-size: 12px; font-weight: 500;
          padding: 3px 10px; border-radius: 2px; margin: 0 0 12px;
        }
        .pay-complete-page .status-tag.full { background: var(--green-tint); color: var(--green); }
        .pay-complete-page .status-tag.partial { background: var(--amber-tint); color: var(--amber); }
        .pay-complete-page .heading-block .amount {
          font-family: var(--serif); font-weight: 500; font-size: 38px;
          font-variant-numeric: tabular-nums; margin: 0 0 8px; line-height: 1;
        }
        .pay-complete-page .heading-block .sub { font-family: var(--sans); font-size: 13px; color: var(--ink-muted); margin: 0; }
        .pay-complete-page .heading-block .sub.owing { color: var(--red); }

        .pay-complete-page .card { background: var(--paper-raised); border: 1px solid var(--rule); border-radius: 2px; margin-bottom: 16px; }

        .pay-complete-page .receipt { padding: 20px 22px; }
        .pay-complete-page .receipt .title { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 14px; }
        .pay-complete-page .receipt table { width: 100%; border-collapse: collapse; }
        .pay-complete-page .receipt td { padding: 7px 0; font-family: var(--sans); font-size: 14px; border-top: 1px dashed var(--rule); }
        .pay-complete-page .receipt tr:first-child td { border-top: none; }
        .pay-complete-page .receipt td.k { color: var(--ink-muted); }
        .pay-complete-page .receipt td.v { text-align: right; font-variant-numeric: tabular-nums; }

        .pay-complete-page .btn-secondary {
          display: block; width: 100%; margin-top: 18px; padding: 13px 16px;
          background: transparent; color: var(--ink); border: 1px solid var(--rule);
          border-radius: 2px; font-family: var(--sans); font-weight: 500; font-size: 14px; cursor: pointer;
        }
        .pay-complete-page .btn-secondary:hover { background: #F5F5F1; }
        .pay-complete-page .btn-secondary:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }

        .pay-complete-page .maint { padding: 20px 22px; }
        .pay-complete-page .maint .title { font-family: var(--sans); font-weight: 600; font-size: 14px; margin: 0 0 6px; }
        .pay-complete-page .maint .desc { font-family: var(--sans); font-size: 13px; color: var(--ink-muted); line-height: 1.5; margin: 0 0 16px; }

        .pay-complete-page .btn-primary {
          display: block; width: 100%; padding: 13px 16px; background: var(--action); color: var(--action-text);
          border: none; border-radius: 2px; font-family: var(--sans); font-weight: 600; font-size: 14px; cursor: pointer;
        }
        .pay-complete-page .btn-primary:hover { opacity: 0.92; }
        .pay-complete-page .btn-primary:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }
        .pay-complete-page .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .pay-complete-page .field { margin: 0 0 14px; }
        .pay-complete-page .field label { display: block; font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 8px; }
        .pay-complete-page .field input[type="text"], .pay-complete-page .field textarea {
          width: 100%; padding: 12px 13px; font-family: var(--sans); font-size: 14px; color: var(--ink);
          background: var(--paper); border: 1px solid var(--rule); border-radius: 2px; resize: vertical;
        }
        .pay-complete-page .field textarea { min-height: 84px; }
        .pay-complete-page .field input:focus-visible, .pay-complete-page .field textarea:focus-visible {
          outline: 2px solid var(--action); outline-offset: 1px;
        }

        .pay-complete-page .drop {
          border: 1px dashed var(--rule); border-radius: 2px; padding: 16px; text-align: center;
          font-family: var(--sans); font-size: 13px; color: var(--ink-muted); cursor: pointer; position: relative;
        }
        .pay-complete-page .drop input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

        .pay-complete-page .thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .pay-complete-page .thumb { position: relative; width: 64px; height: 64px; border-radius: 2px; overflow: hidden; border: 1px solid var(--rule); }
        .pay-complete-page .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .pay-complete-page .thumb button {
          position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%;
          border: none; background: rgba(0,0,0,0.55); color: #fff; font-size: 11px; line-height: 1; cursor: pointer;
        }

        .pay-complete-page .form-actions { display: flex; gap: 10px; margin-top: 4px; }
        .pay-complete-page .form-actions .btn-primary { flex: 1; }
        .pay-complete-page .form-actions .btn-secondary { flex: 1; margin-top: 0; }

        .pay-complete-page .confirm { text-align: center; padding: 8px 4px; }
        .pay-complete-page .confirm .mark-sm { margin: 0 auto 10px; display: block; }
        .pay-complete-page .confirm .msg { font-family: var(--sans); font-size: 14px; margin: 0 0 4px; }
        .pay-complete-page .confirm .ref { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0; }

        @media print {
          .pay-complete-page { padding: 0; background: #fff; }
          .pay-complete-page .card + .card,
          .pay-complete-page .btn-secondary { display: none !important; }
        }
      `}</style>

      <div className="print:hidden">
        <PortalHeader propertyName={propertyName} avatarUrl={avatarUrl} />
      </div>

      <div className="page">
        <div className="heading-block">
          <svg className="mark" width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="26" cy="26" r="25" stroke={isFull ? "var(--green)" : "var(--amber)"} strokeWidth="1.5" />
            <path
              d="M16 27L22.5 33.5L36.5 18.5"
              stroke={isFull ? "var(--green)" : "var(--amber)"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={`status-tag ${isFull ? "full" : "partial"}`}>{isFull ? "Payment received" : "Partial payment received"}</span>
          <p className="amount">{formatMoney(paidAmount)}</p>
          <p className={`sub${isFull ? "" : " owing"}`}>
            {isFull ? `${room} is now paid up` : `${formatMoney(remainingBalance)} still owed on your balance`}
          </p>
        </div>

        <div className="card">
          <div className="receipt">
            <p className="title">Receipt</p>
            <table>
              <tbody>
                <tr>
                  <td className="k">Paid to</td>
                  <td className="v">{propertyName ?? "—"}</td>
                </tr>
                <tr>
                  <td className="k">Room</td>
                  <td className="v">{room}</td>
                </tr>
                <tr>
                  <td className="k">Rent</td>
                  <td className="v">{formatMoney(rentPortion)}</td>
                </tr>
                <tr>
                  <td className="k">Sending fee</td>
                  <td className="v">{formatMoney(feeAmount)}</td>
                </tr>
                <tr>
                  <td className="k">Total paid</td>
                  <td className="v">{formatMoney(paidAmount)}</td>
                </tr>
                <tr>
                  <td className="k">Reference</td>
                  <td className="v">{reference}</td>
                </tr>
                <tr>
                  <td className="k">Paid via</td>
                  <td className="v">
                    {OPERATOR_LABEL[operator]}, number ending {lastDigits(phone, 3)}
                  </td>
                </tr>
                <tr>
                  <td className="k">Date</td>
                  <td className="v">{formatDateTime(paidAt)}</td>
                </tr>
              </tbody>
            </table>
            {downloadError && (
              <p className="sub owing" style={{ marginTop: 10 }}>
                {downloadError}
              </p>
            )}
            <button type="button" className="btn-secondary" onClick={downloadReceipt} disabled={downloading}>
              {downloading ? "Preparing receipt…" : "Download receipt"}
            </button>
          </div>
        </div>

        <PortalMaintenanceSection propertySlug={propertySlug} tenantId={tenantId} />

        <div className="print:hidden">
          <PortalFooter />
        </div>
      </div>
    </div>
  );
}
