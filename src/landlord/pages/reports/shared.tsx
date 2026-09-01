import { useMemo, type ReactNode } from "react";
import {
  DownloadSimple,
  Phone,
  ChatCircle,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useRoomsView, roomLabel } from "../../RoomsContext";
import { useTenants, type PaymentStatus, type Tenant } from "../../TenantsContext";

export function DownloadIcon() {
  return <DownloadSimple size={14} weight="bold" />;
}

export function PhoneIcon() {
  return <Phone size={14} weight="duotone" />;
}

export function ChatIcon() {
  return <ChatCircle size={14} weight="duotone" />;
}

export function Search() {
  return <MagnifyingGlass size={16} weight="bold" />;
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
    <div className="rounded-lg border border-line bg-paper p-6">
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

// --- Live report views ---------------------------------------------------------
// These are derived from RoomsContext/TenantsContext (not separate mock data), so
// editing a tenant or a room anywhere else in the app is reflected here automatically.

export type BedStatus = PaymentStatus | "vacant";

export type BedRow = {
  id: string;
  room: string;
  roomType: string;
  bed: string;
  tenant: string | null;
  tenantId: string | null;
  rent: number;
  status: BedStatus;
};

/** One row per physical bed, live from RoomsContext's merged room/occupancy view. */
export function useBedRoll(): BedRow[] {
  const rooms = useRoomsView();
  return useMemo(() => {
    const rows: BedRow[] = [];
    for (const room of rooms) {
      room.beds.forEach((occupant, i) => {
        rows.push({
          id: `${room.number}-${i}`,
          room: roomLabel(room.number),
          roomType: room.typeConfig.name,
          bed: room.beds.length > 1 ? `Bed ${String.fromCharCode(65 + i)}` : "—",
          tenant: occupant?.name ?? null,
          tenantId: occupant?.id ?? null,
          rent: occupant?.rentAmount ?? room.typeConfig.rent,
          status: occupant ? occupant.status : "vacant",
        });
      });
    }
    return rows;
  }, [rooms]);
}

export type ArrearsRow = {
  id: string;
  tenantId: string;
  tenant: string;
  room: string;
  daysOverdue: number;
  owed: number;
  guardianName: string;
  guardianPhone: string;
};

/** Active tenants who are overdue or unpaid, live from TenantsContext. */
export function useArrears(): ArrearsRow[] {
  const { tenants } = useTenants();
  return useMemo(
    () =>
      tenants
        .filter((t): t is Tenant => t.active && (t.status === "overdue" || t.status === "unpaid"))
        .map((t) => ({
          id: t.id,
          tenantId: t.id,
          tenant: t.name,
          room: t.room,
          daysOverdue: t.daysOverdue ?? 0,
          owed: t.owedAmount,
          guardianName: t.guardianName,
          guardianPhone: t.guardianPhone,
        })),
    [tenants]
  );
}
