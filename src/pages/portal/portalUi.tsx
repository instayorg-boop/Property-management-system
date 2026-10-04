/**
 * The tenant portal's whole visual language, in one file.
 *
 * Deliberately narrow: one page frame, one card, one row, one button. The old portal gave each
 * screen its own inline <style> block with its own palette, so the statement, the pay step and
 * the success page read as three different products.
 *
 * Two things are worth knowing before editing anything here:
 *
 * 1. Buttons are the app's own raised <Button> (src/landlord/components/Button.tsx) — the same
 *    component and the same `primary` variant the marketing hero and the dashboard use, so a CTA
 *    here has the identical bezel, shadow and press behaviour as everywhere else in the product.
 *    Its brand fill already matches the portal accent, so nothing needs re-theming.
 * 2. Corner radius is always --radius (Tailwind's `lg`), the same value the rest of the app
 *    rounds to. Circles — avatars, status dots, the success mark — stay circles; "lg everywhere"
 *    is about box corners, not about flattening a pill into a rectangle.
 */
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import Button from "../../landlord/components/Button";

export function formatMoney(amount: number): string {
  return `K${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The palette and the few element styles that would otherwise be
 * repeated as long class strings on every screen. Injected once by PortalFrame. */
export const portalStyles = `
.tenant-portal {
  --p-bg: #F5F6F8;
  --p-surface: #FFFFFF;
  --p-line: #E8EAEF;
  --p-line-strong: #D6DAE2;
  --p-ink: #14181F;
  --p-ink-soft: #454D5A;
  --p-muted: #6B7483;
  --p-accent: #1E3A8A;
  --p-accent-hover: #182F6F;
  --p-accent-tint: #EEF1FB;
  --p-green: #067647;
  --p-green-tint: #E7F6EE;
  --p-amber: #8A5A08;
  --p-amber-tint: #FCF3E4;
  --p-red: #B42318;
  --p-red-tint: #FDECEA;

  min-height: 100vh;
  min-height: 100dvh;
  background: var(--p-bg);
  color: var(--p-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
.tenant-portal * { box-sizing: border-box; }

/* Fraunces, the app's display face, carries every figure and every page title — the same split
   the dashboard already uses (see MetricCard). Inter stays on labels, body copy and controls,
   where a serif would slow reading down. Tabular figures so a column of kwacha lines up. */
.tenant-portal .num {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.tenant-portal .display {
  font-family: var(--font-display);
  letter-spacing: -0.02em;
}

/* One shared focus ring, so a keyboard user gets the same visible affordance on a card-sized tile
   as on a text input — the browser default is near-invisible against these surfaces. */
.tenant-portal :focus-visible {
  outline: 2px solid var(--p-accent);
  outline-offset: 2px;
  border-radius: var(--radius);
}

.tenant-portal .p-card {
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--radius);
}

.tenant-portal .p-input {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 1px solid var(--p-line-strong);
  border-radius: var(--radius);
  background: var(--p-surface);
  color: var(--p-ink);
  font-size: 15px;
  font-family: inherit;
}
.tenant-portal .p-input::placeholder { color: #9AA1AD; }
.tenant-portal .p-input:focus { outline: 2px solid var(--p-accent); outline-offset: -1px; border-color: transparent; }

/* Rows sit flush, separated by a hairline rather than boxed individually — a list of tenancy
   facts reads faster as one block than as five cards. */
.tenant-portal .p-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  min-height: 52px;
  font-size: 14px;
}
.tenant-portal .p-row + .p-row { border-top: 1px solid var(--p-line); }
.tenant-portal .p-row .p-row-label { color: var(--p-muted); display: flex; align-items: center; gap: 10px; }
.tenant-portal .p-row .p-row-value { color: var(--p-ink); font-weight: 500; text-align: right; }
/* A row that navigates gets the affordance a static one doesn't. */
.tenant-portal a.p-row:hover, .tenant-portal button.p-row:hover { background: #FAFBFC; }
.tenant-portal button.p-row { width: 100%; text-align: left; cursor: pointer; }

@media (prefers-reduced-motion: reduce) {
  .tenant-portal *, .tenant-portal *::before, .tenant-portal *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

export function PortalFrame({ children }: { children: ReactNode }) {
  return (
    <div className="tenant-portal">
      <style>{portalStyles}</style>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[460px] flex-col px-4 pb-10 pt-5">{children}</div>
    </div>
  );
}

/** Sub-page top bar: back affordance on the left, title centred, nothing else. Back goes back in
 * history (falling back to an explicit route when the page was opened cold) so it matches the
 * gesture/hardware back a tenant is more likely to use than any on-screen control. */
export function PortalTopBar({ title, fallbackTo }: { title: string; fallbackTo: string }) {
  const navigate = useNavigate();
  return (
    <div className="mb-5 flex items-center gap-2">
      <Button
        variant="ghost"
        aria-label="Go back"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(fallbackTo))}
        className="-ml-2 h-10 w-10 shrink-0 rounded-full px-0!"
      >
        <ArrowLeft size={20} weight="bold" />
      </Button>
      <h1 className="display flex-1 text-center text-[17px] font-semibold">{title}</h1>
      {/* Mirrors the back button's width so the title is optically centred, not shifted left. */}
      <span className="h-10 w-10 shrink-0" aria-hidden="true" />
    </div>
  );
}

/** The portal's full-width call to action — the app's raised <Button>, sized for a thumb on a
 * phone. `to` navigates on click rather than rendering an <a>: the shared Button is a real
 * <button>, and wrapping one in a Link would be invalid markup for the sake of a long-press menu
 * no one uses inside a payment flow. */
export function PortalButton({
  children,
  to,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <Button
      type={type}
      variant={variant}
      onClick={to ? () => navigate(to) : onClick}
      disabled={disabled}
      className={`h-13 w-full rounded-lg text-[15px] font-semibold ${className}`}
    >
      {children}
    </Button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-card ${className}`}>{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold tracking-[-0.01em]" style={{ color: "var(--p-muted)" }}>
      {children}
    </h2>
  );
}

export function Row({ label, value, icon }: { label: ReactNode; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="p-row">
      <span className="p-row-label">
        {icon}
        {label}
      </span>
      <span className="p-row-value">{value}</span>
    </div>
  );
}

/** A label/amount pair inside a breakdown card — the figure always in the display face, and the
 * total visually heavier than the lines that add up to it. */
export function MoneyRow({ label, amount, strong }: { label: ReactNode; amount: number; strong?: boolean }) {
  return (
    <div className="p-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
      <span className="p-row-label" style={strong ? { color: "var(--p-ink)", fontWeight: 600 } : undefined}>
        {label}
      </span>
      <span className="p-row-value num" style={strong ? { fontSize: 17, fontWeight: 600 } : { fontSize: 15 }}>
        {formatMoney(amount)}
      </span>
    </div>
  );
}

export type ToneName = "neutral" | "green" | "amber" | "red" | "accent";

const toneVars: Record<ToneName, { fg: string; bg: string }> = {
  neutral: { fg: "var(--p-ink-soft)", bg: "#F1F2F5" },
  green: { fg: "var(--p-green)", bg: "var(--p-green-tint)" },
  amber: { fg: "var(--p-amber)", bg: "var(--p-amber-tint)" },
  red: { fg: "var(--p-red)", bg: "var(--p-red-tint)" },
  accent: { fg: "var(--p-accent)", bg: "var(--p-accent-tint)" },
};

export function Pill({ tone = "neutral", children }: { tone?: ToneName; children: ReactNode }) {
  const { fg, bg } = toneVars[tone];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ color: fg, background: bg }}
    >
      {children}
    </span>
  );
}

/** Big tappable square on the portal home — icon over a two-line label, comfortably past the 44px
 * touch target in both directions. */
export function ActionTile({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="p-card flex flex-1 flex-col gap-3 p-4 no-underline" style={{ color: "var(--p-ink)" }}>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ background: "var(--p-accent-tint)", color: "var(--p-accent)" }}
      >
        {icon}
      </span>
      <span className="text-[14px] font-semibold leading-snug tracking-[-0.01em]">{label}</span>
    </Link>
  );
}

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: "#E9EBEF" }} />;
}

/** The dead-end state every portal page shares — a revoked link, a page opened without the state
 * it needs, a list with nothing in it yet. */
export function PortalMessage({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h2 className="display text-[18px] font-semibold">{title}</h2>
      <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
        {body}
      </p>
      {action && <div className="mt-5 w-full max-w-[240px]">{action}</div>}
    </div>
  );
}

const INSTAY_LOGO =
  "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png";

export function PoweredByInstay() {
  return (
    <div className="mt-8 flex flex-col items-center gap-1 pb-1">
      <span className="text-[11px]" style={{ color: "var(--p-muted)" }}>
        Powered by
      </span>
      <Link to="/" className="flex items-center gap-1.5 no-underline">
        <img src={INSTAY_LOGO} alt="" className="h-6 w-auto" />
        <span className="text-[13px] font-semibold" style={{ color: "var(--p-accent)" }}>
          Instay Manage
        </span>
      </Link>
    </div>
  );
}
