import type { ReactNode, TdHTMLAttributes } from "react";

/**
 * Shared table chrome — matches the Payouts page's "Transfers sent / Payments
 * received" table pixel-for-pixel (bg-paper card, uppercase muted header,
 * divide-y rows, pill status badges). Use these on every data table in the
 * dashboard instead of hand-rolling table classes per page, so tables stay
 * visually identical across Rent, Expenses, Tenants, Maintenance, Payouts, etc.
 */

export function TableCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-lg border border-line bg-paper ${className}`}>
      {children}
    </div>
  );
}

export function TableCardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 ${className}`}
    >
      {children}
    </div>
  );
}

export function DataTable({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left text-[13px] ${className}`}>{children}</table>
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-paper text-[10.5px] text-muted uppercase">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap ${align === "right" ? "text-right" : ""} ${className}`}
    >
      {children}
    </th>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line [&>tr]:transition-colors [&>tr]:duration-100 [&>tr:hover]:bg-mist/40">{children}</tbody>;
}

/** Plain <td> has no padding of its own — always use this (or pass px-4 py-3
 * explicitly) instead of a bare <td>, or rows render with text touching the
 * row dividers. */
export function Td({
  children,
  align = "left",
  className = "",
  ...props
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
} & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`px-4 py-3 align-middle ${align === "right" ? "text-right" : ""} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_STYLE: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
  info: "bg-blue-50 text-blue-600",
  neutral: "bg-mist text-muted",
};

export function StatusPill({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_STYLE[tone]}`}>
      {children}
    </span>
  );
}

export function TableEmptyState({
  colSpan,
  icon,
  title,
  description,
}: {
  colSpan: number;
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mist text-muted">
            {icon}
          </span>
          <div>
            <p className="text-[13px] font-bold text-ink">{title}</p>
            {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
          </div>
        </div>
      </td>
    </tr>
  );
}
