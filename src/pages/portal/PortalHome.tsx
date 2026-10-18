import { Link, useParams } from "react-router-dom";
import { CalendarBlank, Door, FilePdf } from "@phosphor-icons/react";
import { usePortal } from "./portalData";
import { ledgerEntryKey, wasReceiptSeen } from "./PortalPaymentDetail";
import { isPortalDevMode } from "./portalDev";
import PortalQuickActions from "./PortalQuickActions";
import {
  Card,
  Pill,
  PortalButton,
  PortalMessage,
  PoweredByInstay,
  Row,
  SectionLabel,
  Shimmer,
  StatTile,
  formatDate,
  formatMoney,
  type ToneName,
} from "./portalUi";
import { groupPortalLedger, isOpenPortalRow, portalOwedPeriodLabel } from "../../lib/payPortal";

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** The one line at the top of the balance card that tells a tenant where they stand before they
 * read the figure — counted in whole days from midnight to midnight so "due in 1 day" doesn't
 * flip to "due in 0 days" just because it's late in the evening. */
function dueBadge(
  nextDue: Date | null,
  owed: number,
  moveIn: string | null | undefined,
  daysOverdue: number | undefined,
  now = new Date(),
): { label: string; tone: ToneName } {
  if (owed <= 0) return { label: "All paid up", tone: "green" };
  const mi = moveIn ? new Date(moveIn) : null;
  if (mi && !Number.isNaN(mi.getTime()) && new Date(mi.getFullYear(), mi.getMonth(), mi.getDate()).getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    return { label: `Moving in ${mi.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, tone: "accent" };
  }
  if (!nextDue) return { label: "Payment due", tone: "amber" };
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate()).getTime();
  const rawDays = Math.round((startOfDue - startOfToday) / 86_400_000);
  if (rawDays < 0) {
    // Overdue — use the tenant's real days-overdue figure, which correctly accounts for the
    // landlord's configured grace period, rather than a raw day count from the due date. Without
    // this, a tenant with a 5-day grace period sees a bigger, wrong "days overdue" number here
    // than their landlord sees on the Rent/tenant pages for the exact same account. Falls back to
    // the raw count only if daysOverdue genuinely isn't available.
    const days = daysOverdue && daysOverdue > 0 ? daysOverdue : Math.abs(rawDays);
    return { label: days === 1 ? "1 day overdue" : `${days} days overdue`, tone: "red" };
  }
  if (rawDays === 0) return { label: "Due today", tone: "amber" };
  if (rawDays === 1) return { label: "Due tomorrow", tone: "amber" };
  return { label: `Due in ${rawDays} days`, tone: rawDays <= 7 ? "amber" : "accent" };
}

export default function PortalHome() {
  const { token } = useParams();
  const { tenant, ledger, nextDueDate, identity, loading, notFound } = usePortal(token);

  if (loading) {
    return (
      <>
        <div className="mb-6 space-y-2">
          <Shimmer className="h-3.5 w-28" />
          <Shimmer className="h-6 w-44" />
        </div>
        <Shimmer className="h-52 w-full rounded-lg" />
        <Shimmer className="mt-6 h-54 w-full rounded-lg" />
      </>
    );
  }

  if (notFound) {
    return (
      <PortalMessage
        title="This link isn't active"
        body="It may have been replaced or revoked. Ask your landlord to send you a new payment link."
        action={<PortalButton to="/">Go to Instay</PortalButton>}
      />
    );
  }

  if (!tenant || !identity) {
    return (
      <PortalMessage
        title="We couldn't load your account"
        body="Something went wrong on our side. Check your connection and try opening your link again."
      />
    );
  }

  const owed = tenant.owedAmount;
  const isClear = owed <= 0;
  const badge = dueBadge(nextDueDate, owed, tenant?.moveInDate, tenant?.daysOverdue);
  const openLabels = groupPortalLedger(ledger)
    .filter(isOpenPortalRow)
    .map((row) => row.label);
  // A settled charge reads as "paid" in the portal ledger just like a payment does, so picking the
  // newest "paid" row once showed a damage charge as the tenant's last payment. The tenant record
  // now carries the real last payment; the ledger scan is kept only as a fallback for a portal
  // running against a deployment whose pay_portal_get_tenant_v2 predates that field.
  const legacyLastPaid = ledger.find((row) => row.status === "paid");
  const lastPayment =
    tenant.lastPayment === undefined
      ? legacyLastPaid
        ? { amount: legacyLastPaid.paidAmount ?? legacyLastPaid.amount, at: legacyLastPaid.createdAt }
        : null
      : tenant.lastPayment;

  // The newest settled entry, so the receipt for it is one tap from the front page. Tenants open
  // this screen looking for the pay button, so without a pointer the receipt (which lives two
  // levels down in each payment) goes unfound.
  const lastPaidRow = groupPortalLedger(ledger).find((row) => row.status === "paid");
  const receiptLink = lastPaidRow ? `/p/${token}/history/${ledgerEntryKey(lastPaidRow)}` : null;
  const showReceiptBanner = !!lastPaidRow && !wasReceiptSeen(tenant.id);

  return (
    <>
      {/* Visible confirmation that the ?dev=1 latch took — without it, the only way to tell dev
          mode is on is to reach the checkout and look for the simulate buttons. */}
      {isPortalDevMode() && (
        <p
          className="mb-4 rounded-lg px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide"
          style={{ background: "var(--p-amber-tint)", color: "var(--p-amber)" }}
        >
          Dev mode — simulate buttons on the pay page
        </p>
      )}

      <header className="mb-6">
        <p className="text-[13px]" style={{ color: "var(--p-muted)" }}>
          {greeting()},
        </p>
        <p className="display truncate text-[22px] font-semibold leading-tight">{tenant.name}</p>
        {identity.propertyName && (
          <p className="mt-1 truncate text-[15px] font-semibold">{identity.propertyName}</p>
        )}
        {identity.propertyAddress && (
          <p className="mt-0.5 truncate text-[12.5px]" style={{ color: "var(--p-muted)" }}>
            {identity.propertyAddress}
          </p>
        )}
      </header>

      {showReceiptBanner && lastPaidRow && receiptLink && (
        <Link
          to={receiptLink}
          className="mb-4 flex items-center justify-between gap-3 rounded-lg px-4 py-3 no-underline"
          style={{ background: "var(--p-accent-tint)", color: "var(--p-accent)" }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FilePdf size={18} />
            <span className="truncate text-[13.5px] font-semibold">Your {lastPaidRow.label} receipt is ready</span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold">View</span>
        </Link>
      )}

      {/* The one thing this page exists to answer: what do I owe, by when, and how do I pay it.
          Everything else on the screen is secondary and sits below it. */}
      <Card className="px-5 py-6 text-center">
        <Pill tone={badge.tone}>{badge.label}</Pill>
        <p className="mt-4 text-[10.5px] font-bold uppercase tracking-[.08em]" style={{ color: "var(--p-muted)" }}>
          {isClear ? "Nothing due right now" : portalOwedPeriodLabel(openLabels, nextDueDate)}
        </p>
        <p
          className="num mt-1.5 text-[38px] font-semibold leading-none"
          style={{ color: isClear ? "var(--p-green)" : "var(--p-ink)" }}
        >
          {formatMoney(Math.max(owed, 0))}
        </p>
        {tenant.penaltyAmount > 0 && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--p-red)" }}>
            Includes {formatMoney(tenant.penaltyAmount)} late fee
          </p>
        )}
        {!isClear && nextDueDate && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--p-muted)" }}>
            Amount due by {formatDate(nextDueDate)}
          </p>
        )}
        <div className="mt-5">
          <PortalButton to={`/p/${token}/pay`} variant={isClear ? "secondary" : "primary"}>
            {isClear ? "Pay early" : "Pay now"}
          </PortalButton>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile label="Monthly rent" value={formatMoney(tenant.rentAmount)} sub={tenant.room || undefined} />
        <StatTile
          label="Last payment"
          value={lastPayment ? formatMoney(lastPayment.amount) : "None yet"}
          sub={lastPayment ? formatDate(lastPayment.at) : undefined}
          tone={lastPayment ? "var(--p-green)" : undefined}
          to={lastPayment && receiptLink ? receiptLink : undefined}
          cta={lastPayment && receiptLink ? "View receipt" : undefined}
        />
      </div>

      <SectionLabel>Your tenancy</SectionLabel>
      <Card>
        <Row
          icon={<CalendarBlank size={17} weight="regular" />}
          label="Next due date"
          value={nextDueDate ? formatDate(nextDueDate) : "—"}
        />
        <Row
          icon={<Door size={17} weight="regular" />}
          label="Room"
          value={tenant.room || "-"}
        />
      </Card>

      {/* Two tiles, not three — receipts live inside each payment in the history, which is where a
          tenant looks for them, rather than in a separate documents drawer. */}
      <PortalQuickActions token={token!} />

      <div className="flex-1" />
      <PoweredByInstay />
    </>
  );
}
