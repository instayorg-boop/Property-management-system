import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Checks, DownloadSimple, Copy, Check } from "@phosphor-icons/react";
import { usePortal, usePortalDocuments } from "./portalData";
import Confetti from "./Confetti";
import { Card, MoneyRow, Pill, PortalButton, PortalMessage, PoweredByInstay, formatDate, formatMoney } from "./portalUi";

type SuccessState = {
  amount?: number;
  feeAmount?: number;
  rentPortion?: number;
  isPartial?: boolean;
  provider?: "mtn" | "airtel" | "zamtel";
  phone?: string;
  /** The Lenco collectionId — also the reference printed on the PDF receipt. */
  reference?: string;
};

const PROVIDER_LABEL: Record<string, string> = { mtn: "MTN MoMo", airtel: "Airtel Money", zamtel: "Zamtel Kwacha" };

/** The collectionId is a full UUID — unusable as something a tenant reads out over the phone. The
 * receipt PDF already shows a short code derived the same way (last 12 hex characters, grouped),
 * so the two agree, and the full value is still what gets copied. */
function shortReference(reference: string): string {
  const hex = reference.replace(/-/g, "").toUpperCase();
  const tail = hex.slice(-12);
  return `${tail.slice(0, 4)} ${tail.slice(4, 8)} ${tail.slice(8, 12)}`;
}

/** How long to keep re-checking for the receipt PDF. It is generated server-side the moment the
 * charge confirms, but that is a round trip behind this page's render, so the button appears as
 * "Preparing…" and resolves a moment later rather than being absent or broken. */
const RECEIPT_RETRIES = 4;
const RECEIPT_RETRY_MS = 2500;

export default function PortalSuccess() {
  const { token } = useParams();
  const location = useLocation();
  const { tenant } = usePortal(token);
  const { data: documents, refresh: refreshDocuments } = usePortalDocuments(tenant?.id);
  const [copied, setCopied] = useState(false);
  // State, not a ref: the button's label depends on it, and a ref mutation wouldn't re-render.
  const [attempts, setAttempts] = useState(0);
  const state = (location.state as SuccessState | null) ?? null;
  const paidAt = useMemo(() => new Date(), []);

  // A tenant who just paid is the single most likely person to screenshot this or hand their phone
  // over, so land them at the top of the receipt rather than mid-scroll.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const receipt = useMemo(() => {
    if (!documents) return undefined;
    // Same-day PDF, newest first — the receipt for the payment that just happened. See
    // PortalPaymentDetail's note on why the match is by date rather than a foreign key.
    const today = new Date().toDateString();
    return documents.find((d) => d.contentType?.includes("pdf") && new Date(d.createdAt).toDateString() === today);
  }, [documents]);

  // Poll a few times while the receipt is still being written, then stop — a receipt that never
  // appears is not worth spinning on forever, and the payment itself already succeeded.
  useEffect(() => {
    if (receipt || !tenant?.id || attempts >= RECEIPT_RETRIES) return;
    const timer = window.setTimeout(() => {
      setAttempts((n) => n + 1);
      refreshDocuments();
    }, RECEIPT_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [receipt, tenant?.id, refreshDocuments, attempts]);

  if (!state?.amount || !state?.reference) {
    // Opened directly, or reloaded after the transaction state was dropped — there is no receipt
    // to show, and inventing one would be worse than saying so.
    return (
      <PortalMessage
        title="No recent payment to show"
        body="Your payments and receipts are all kept in your history."
        action={<PortalButton to={`/p/${token}/history`}>View payment history</PortalButton>}
      />
    );
  }

  const fee = state.feeAmount ?? 0;
  // Prefer the flag the collect response already computed server-side; fall back to the tenant's
  // current balance only when this page was reached without it.
  const remaining = state.isPartial === undefined ? (tenant?.owedAmount ?? 0) : state.isPartial ? (tenant?.owedAmount ?? 0) : 0;

  const copyReference = () => {
    navigator.clipboard
      .writeText(state.reference!)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard blocked (insecure context, or permission denied) — the reference is still
        // visible on screen and on the PDF, so this is not worth an error state.
      });
  };

  return (
    <>
      <Confetti />

      <div className="flex flex-col items-center pb-2 pt-8">
        <span
          className="success-mark flex h-23 w-23 items-center justify-center rounded-full"
          style={{ background: "var(--p-green-tint)" }}
        >
          <style>{`
            /* One spring-ish pop, then still. The inner mark lands a beat later so it reads as
               arriving rather than inflating. */
            .success-mark { animation: success-pop 420ms cubic-bezier(0.22, 1.2, 0.36, 1) both; }
            .success-mark-inner { animation: success-pop 420ms 90ms cubic-bezier(0.22, 1.35, 0.36, 1) both; }
            @keyframes success-pop {
              0% { transform: scale(0.4); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
          <span
            className="success-mark-inner flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: "#12B76A", color: "#FFFFFF" }}
          >
            <Checks size={32} weight="bold" />
          </span>
        </span>

        <h1 className="display mt-5 text-[22px] font-semibold">Payment successful</h1>
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--p-muted)" }}>
          You paid {formatMoney(state.amount)}
        </p>
      </div>

      {/* The receipt leads, above the details — a digital receipt is the whole point of paying
          this way, and burying it under a card is how people end up asking for a paper one. */}
      <div className="mt-5">
        {receipt?.url ? (
          <a
            href={receipt.url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="raised-btn-brand flex h-13 w-full items-center justify-center gap-2 rounded-lg text-[15px] font-semibold no-underline"
            style={{ color: "#fff" }}
          >
            <DownloadSimple size={19} weight="bold" />
            Download receipt
          </a>
        ) : (
          <PortalButton variant="secondary" disabled>
            <DownloadSimple size={19} />
            {attempts >= RECEIPT_RETRIES ? "Receipt not ready yet" : "Preparing your receipt…"}
          </PortalButton>
        )}
      </div>

      <Card className="mt-4 px-4 py-2">
        <p className="pb-1 pt-3 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
          Details
        </p>
        <div className="p-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <span className="p-row-label">Paid with</span>
          <span className="p-row-value">
            {PROVIDER_LABEL[state.provider ?? "mtn"]}
            {state.phone ? ` · ${state.phone}` : ""}
          </span>
        </div>
        <div className="p-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <span className="p-row-label">Date</span>
          <span className="p-row-value">{formatDate(paidAt)}</span>
        </div>
        <div className="p-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <span className="p-row-label">Reference</span>
          {/* Short enough to read out loud, with the full value one tap away on the clipboard —
              this is the number a tenant quotes when something needs chasing. */}
          <button
            type="button"
            onClick={copyReference}
            className="flex items-center gap-1.5"
            aria-label={`Copy full payment reference ${state.reference}`}
          >
            <span className="num text-[13px] font-medium">{shortReference(state.reference)}</span>
            <span style={{ color: copied ? "var(--p-green)" : "var(--p-muted)" }}>
              {copied ? <Check size={15} weight="bold" /> : <Copy size={15} />}
            </span>
          </button>
        </div>
        <MoneyRow label="Total paid" amount={state.amount} strong />
        <div className="p-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <span className="p-row-label">Status</span>
          <span>
            {remaining > 0 ? (
              <Pill tone="amber">{formatMoney(remaining)} still owed</Pill>
            ) : (
              <Pill tone="green">Paid in full</Pill>
            )}
          </span>
        </div>
      </Card>

      {fee > 0 && (
        <p className="mt-2 px-1 text-center text-[12px]" style={{ color: "var(--p-muted)" }}>
          Includes {formatMoney(fee)} transaction fee. The full breakdown is on your receipt.
        </p>
      )}

      <div className="mt-5">
        <PortalButton to={`/p/${token}`}>Back home</PortalButton>
      </div>

      <div className="flex-1" />
      <PoweredByInstay />
    </>
  );
}
