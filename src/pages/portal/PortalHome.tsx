import { useParams } from "react-router-dom";
import { Wrench, ClockCounterClockwise, CalendarBlank, Door, Receipt, FileText } from "@phosphor-icons/react";
import { usePortal } from "./portalData";
import { isPortalDevMode } from "./portalDev";
import {
  ActionTile,
  Card,
  Pill,
  PortalButton,
  PortalMessage,
  PoweredByInstay,
  Row,
  SectionLabel,
  Shimmer,
  formatDate,
  formatMoney,
  type ToneName,
} from "./portalUi";
import { groupPortalLedger } from "../../lib/payPortal";

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** The one line at the top of the balance card that tells a tenant where they stand before they
 * read the figure — counted in whole days from midnight to midnight so "due in 1 day" doesn't
 * flip to "due in 0 days" just because it's late in the evening. */
function dueBadge(nextDue: Date | null, owed: number, now = new Date()): { label: string; tone: ToneName } {
  if (owed <= 0) return { label: "All paid up", tone: "green" };
  if (!nextDue) return { label: "Payment due", tone: "amber" };
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate()).getTime();
  const days = Math.round((startOfDue - startOfToday) / 86_400_000);
  if (days < 0) return { label: days === -1 ? "1 day overdue" : `${Math.abs(days)} days overdue`, tone: "red" };
  if (days === 0) return { label: "Due today", tone: "amber" };
  if (days === 1) return { label: "Due tomorrow", tone: "amber" };
  return { label: `Due in ${days} days`, tone: days <= 7 ? "amber" : "accent" };
}

/** The period the outstanding amount is actually for — "September 2026 rent" above the figure,
 * rather than an unlabelled number the tenant has to take on trust. Falls back to the current
 * month only when nothing is open in the ledger yet (a charge not invoiced). */
function owedFor(labels: string[], now = new Date()): string {
  if (labels.length === 0) return `${now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} rent`;
  if (labels.length === 1) return labels[0];
  return `${labels.length} unpaid periods`;
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
  const badge = dueBadge(nextDueDate, owed);
  const openLabels = groupPortalLedger(ledger)
    .filter((row) => row.status !== "paid")
    .map((row) => row.label);
  const lastPaid = ledger.find((row) => row.status === "paid");

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
          <p className="mt-0.5 truncate text-[13px]" style={{ color: "var(--p-muted)" }}>
            {identity.propertyName}
          </p>
        )}
      </header>

      {/* The one thing this page exists to answer: what do I owe, by when, and how do I pay it.
          Everything else on the screen is secondary and sits below it. */}
      <Card className="px-5 py-6 text-center">
        <Pill tone={badge.tone}>{badge.label}</Pill>
        <p className="mt-4 text-[13px]" style={{ color: "var(--p-muted)" }}>
          {isClear ? "Nothing due right now" : owedFor(openLabels)}
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
          value={[tenant.room, identity.propertyName].filter(Boolean).join(", ") || "—"}
        />
        <Row
          icon={<Receipt size={17} weight="regular" />}
          label="Last payment"
          value={
            lastPaid ? (
              <span className="num" style={{ color: "var(--p-green)" }}>
                {formatMoney(lastPaid.paidAmount ?? lastPaid.amount)} · {formatDate(lastPaid.createdAt)}
              </span>
            ) : (
              "None yet"
            )
          }
        />
        <Row
          icon={<FileText size={17} weight="regular" />}
          label="Monthly rent"
          value={<span className="num">{formatMoney(tenant.rentAmount)}</span>}
        />
      </Card>

      {/* Two tiles, not three — receipts live inside each payment in the history, which is where a
          tenant looks for them, rather than in a separate documents drawer. */}
      <div className="mt-4 flex gap-3">
        <ActionTile to={`/p/${token}/maintenance`} icon={<Wrench size={18} weight="regular" />} label="Report a problem" />
        <ActionTile to={`/p/${token}/history`} icon={<ClockCounterClockwise size={18} weight="regular" />} label="Payment history" />
      </div>

      <div className="flex-1" />
      <PoweredByInstay />
    </>
  );
}
