import { useState } from "react";
import { Link } from "react-router-dom";
import { MagnifyingGlass as SearchIcon } from "@phosphor-icons/react";
import SlideOver from "./SlideOver";
import { useTenants, formatCurrency, type Tenant } from "../TenantsContext";

const statusStyle: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};

const statusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };

export default function TenantSearchDrawer({
  onClose,
  onPick,
  title = "Log a payment",
  description = "Search for the tenant you're recording a payment for.",
  excludeTenantId,
}: {
  onClose: () => void;
  onPick: (t: Tenant) => void;
  title?: string;
  description?: string;
  /** Leave out one tenant from the results — e.g. the room's current occupant when reassigning. */
  excludeTenantId?: string;
}) {
  const { tenants } = useTenants();
  const [query, setQuery] = useState("");

  const results = tenants.filter(
    (t) =>
      t.active &&
      t.id !== excludeTenantId &&
      (t.name.toLowerCase().includes(query.toLowerCase()) || t.room.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <SlideOver onClose={onClose} title={title} description={description}>
      <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5">
        <SearchIcon size={16} weight="duotone" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or room"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      <div className="mt-3 space-y-1">
        {results.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-mist"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mist text-[10px] font-semibold text-muted">
                {t.name.split(" ").map((s) => s[0]).join("")}
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{t.name}</p>
                <p className="text-xs text-muted">
                  {t.room} · {t.roomType}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                {statusLabel[t.status]}
              </span>
              <p className="mt-1 text-xs text-muted">{formatCurrency(t.owedAmount || t.rentAmount)}</p>
            </div>
          </button>
        ))}
        {results.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted">No tenants match.</p>
            <Link
              to="/tenants"
              state={{ openAddTenant: true }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper"
            >
              + Add tenant
            </Link>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
