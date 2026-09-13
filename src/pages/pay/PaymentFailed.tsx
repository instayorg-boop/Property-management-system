import PortalHeader from "./PortalHeader";
import PortalFooter from "./PortalFooter";
import PortalMaintenanceSection from "./PortalMaintenanceSection";

export type PaymentFailedProps = {
  reason: string;
  propertyName?: string | null;
  /** Property/landlord photo — see PortalHeader's comment; omitted until upload exists. */
  avatarUrl?: string | null;
  propertySlug: string;
  tenantId: string;
  onRetry: () => void;
  onBack: () => void;
};

/** Same receipt-style design as the rest of the pay portal — a full-page state (not an inline
 * error line) for when a charge actually fails, so the reason gets the same weight a successful
 * payment does, not a small red line easy to miss. */
export default function PaymentFailed({
  reason,
  propertyName,
  avatarUrl,
  propertySlug,
  tenantId,
  onRetry,
  onBack,
}: PaymentFailedProps) {
  return (
    <div className="pay-failed-page">
      <style>{`
        .pay-failed-page {
          --paper: #FFFFFF;
          --paper-raised: #FFFFFF;
          --ink: #1B2420;
          --ink-muted: #5B665F;
          --rule: rgba(27,36,32,0.14);
          --red: #DC2626;
          --red-tint: #FEE2E2;
          --green: #2F5233;
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
        .pay-failed-page * { box-sizing: border-box; }
        .pay-failed-page .page { width: 100%; max-width: 440px; padding: 24px 16px 64px; }

        .pay-failed-page .heading-block { padding: 8px 4px 22px; text-align: center; }
        .pay-failed-page .mark { margin: 0 auto 16px; display: block; }
        .pay-failed-page .status-tag {
          display: inline-block; font-family: var(--sans); font-size: 12px; font-weight: 500;
          padding: 3px 10px; border-radius: 2px; margin: 0 0 12px;
          background: var(--red-tint); color: var(--red);
        }
        .pay-failed-page .heading-block .headline {
          font-family: var(--serif); font-weight: 500; font-size: 26px; margin: 0 0 10px; line-height: 1.15;
        }

        .pay-failed-page .card { background: var(--paper-raised); border: 1px solid var(--rule); border-radius: 2px; margin-bottom: 16px; }
        .pay-failed-page .reason { padding: 18px 22px; }
        .pay-failed-page .reason .title { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 8px; }
        .pay-failed-page .reason .text { font-family: var(--sans); font-size: 14px; color: var(--ink); line-height: 1.5; margin: 0; }

        .pay-failed-page .btn-primary {
          display: block; width: 100%; padding: 13px 16px; background: var(--action); color: var(--action-text);
          border: none; border-radius: 2px; font-family: var(--sans); font-weight: 600; font-size: 14px; cursor: pointer;
          margin-bottom: 10px;
        }
        .pay-failed-page .btn-primary:hover { opacity: 0.92; }
        .pay-failed-page .btn-primary:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }

        .pay-failed-page .btn-secondary {
          display: block; width: 100%; padding: 13px 16px;
          background: transparent; color: var(--ink); border: 1px solid var(--rule);
          border-radius: 2px; font-family: var(--sans); font-weight: 500; font-size: 14px; cursor: pointer;
        }
        .pay-failed-page .btn-secondary:hover { background: #F5F5F1; }
        .pay-failed-page .btn-secondary:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }

        .pay-failed-page .maint { padding: 20px 22px; }
        .pay-failed-page .maint .title { font-family: var(--sans); font-weight: 600; font-size: 14px; margin: 0 0 6px; }
        .pay-failed-page .maint .desc { font-family: var(--sans); font-size: 13px; color: var(--ink-muted); line-height: 1.5; margin: 0 0 16px; }
        .pay-failed-page .maint .btn-primary,
        .pay-failed-page .maint .btn-secondary { margin-top: 0; }

        .pay-failed-page .field { margin: 0 0 14px; }
        .pay-failed-page .field label { display: block; font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 8px; }
        .pay-failed-page .field input[type="text"], .pay-failed-page .field textarea {
          width: 100%; padding: 12px 13px; font-family: var(--sans); font-size: 14px; color: var(--ink);
          background: var(--paper); border: 1px solid var(--rule); border-radius: 2px; resize: vertical;
        }
        .pay-failed-page .field textarea { min-height: 84px; }
        .pay-failed-page .field input:focus-visible, .pay-failed-page .field textarea:focus-visible {
          outline: 2px solid var(--action); outline-offset: 1px;
        }

        .pay-failed-page .drop {
          border: 1px dashed var(--rule); border-radius: 2px; padding: 16px; text-align: center;
          font-family: var(--sans); font-size: 13px; color: var(--ink-muted); cursor: pointer; position: relative;
        }
        .pay-failed-page .drop input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

        .pay-failed-page .thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .pay-failed-page .thumb { position: relative; width: 64px; height: 64px; border-radius: 2px; overflow: hidden; border: 1px solid var(--rule); }
        .pay-failed-page .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .pay-failed-page .thumb button {
          position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%;
          border: none; background: rgba(0,0,0,0.55); color: #fff; font-size: 11px; line-height: 1; cursor: pointer;
        }

        .pay-failed-page .form-actions { display: flex; gap: 10px; margin-top: 4px; }
        .pay-failed-page .form-actions .btn-primary { flex: 1; }
        .pay-failed-page .form-actions .btn-secondary { flex: 1; margin-top: 0; }

        .pay-failed-page .confirm { text-align: center; padding: 8px 4px; }
        .pay-failed-page .confirm .mark-sm { margin: 0 auto 10px; display: block; }
        .pay-failed-page .confirm .msg { font-family: var(--sans); font-size: 14px; margin: 0 0 4px; }
        .pay-failed-page .confirm .ref { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0; }
      `}</style>

      <PortalHeader propertyName={propertyName} avatarUrl={avatarUrl} />

      <div className="page">
        <div className="heading-block">
          <svg className="mark" width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="26" cy="26" r="25" stroke="var(--red)" strokeWidth="1.5" />
            <path d="M19 19L33 33M33 19L19 33" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="status-tag">Payment failed</span>
          <p className="headline">We couldn't complete this payment</p>
        </div>

        <div className="card">
          <div className="reason">
            <p className="title">What happened</p>
            <p className="text">{reason}</p>
          </div>
        </div>

        <button type="button" className="btn-primary" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back to statement
        </button>

        <div className="mt-4">
          <PortalMaintenanceSection propertySlug={propertySlug} tenantId={tenantId} />
        </div>

        <PortalFooter />
      </div>
    </div>
  );
}
