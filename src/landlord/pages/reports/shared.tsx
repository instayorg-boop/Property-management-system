import type { ReactNode } from "react";

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.75}>
      <path d="M8 2v8m0 0 3-3m-3 3-3-3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <path d="M3.5 2h2.2l1 3-1.5 1.2a8 8 0 0 0 3.6 3.6l1.2-1.5 3 1v2.2a1 1 0 0 1-1.1 1A11 11 0 0 1 2.5 3.1 1 1 0 0 1 3.5 2Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <path d="M2 8a6 6 0 1 1 2.4 4.8L2 13.5l.7-2.4A6 6 0 0 1 2 8Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Search() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

export function currency(n: number) {
  return `K${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

export function ReportCard({
  title,
  audience,
  children,
}: {
  title: string;
  audience: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-4">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-muted">For: {audience}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-mist"
        >
          <DownloadIcon />
          Download PDF
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// --- Shared mock data ---------------------------------------------------------
// The bed roll doubles as the source for gross-collected in the Owner Payout
// Statement, so it lives here rather than duplicated per report.

export type BedStatus = "paid" | "overdue" | "partial" | "vacant";

export type Bed = {
  id: string;
  room: string;
  roomType: string;
  bed: string;
  tenant: string | null;
  rent: number;
  status: BedStatus;
};

export const bedRoll: Bed[] = [
  { id: "b1", room: "Room 12", roomType: "Single", bed: "Bed A", tenant: "A. Mwansa", rent: 1200, status: "paid" },
  { id: "b2", room: "Room 08", roomType: "Single", bed: "Bed A", tenant: "B. Phiri", rent: 950, status: "overdue" },
  { id: "b3", room: "Room 03", roomType: "Two sharing", bed: "Bed A", tenant: "C. Banda", rent: 450, status: "partial" },
  { id: "b4", room: "Room 03", roomType: "Two sharing", bed: "Bed B", tenant: "D. Zulu", rent: 450, status: "paid" },
  { id: "b5", room: "Room 05", roomType: "Two sharing", bed: "Bed A", tenant: null, rent: 450, status: "vacant" },
  { id: "b6", room: "Room 05", roomType: "Two sharing", bed: "Bed B", tenant: "F. Chileshe", rent: 450, status: "paid" },
  { id: "b7", room: "Room 19", roomType: "Two sharing", bed: "Bed A", tenant: "G. Mwape", rent: 450, status: "paid" },
  { id: "b8", room: "Room 19", roomType: "Two sharing", bed: "Bed B", tenant: null, rent: 450, status: "vacant" },
  { id: "b9", room: "Room 14", roomType: "Single", bed: "Bed A", tenant: "H. Banda", rent: 1200, status: "overdue" },
  { id: "b10", room: "Room 33", roomType: "Four sharing", bed: "Bed A", tenant: "J. Kunda", rent: 325, status: "paid" },
  { id: "b11", room: "Room 33", roomType: "Four sharing", bed: "Bed B", tenant: "K. Phiri", rent: 325, status: "paid" },
  { id: "b12", room: "Room 33", roomType: "Four sharing", bed: "Bed C", tenant: null, rent: 325, status: "vacant" },
  { id: "b13", room: "Room 33", roomType: "Four sharing", bed: "Bed D", tenant: "L. Zulu", rent: 325, status: "partial" },
  { id: "b14", room: "Room 22", roomType: "Two sharing", bed: "Bed A", tenant: "M. Ngoma", rent: 450, status: "paid" },
];
