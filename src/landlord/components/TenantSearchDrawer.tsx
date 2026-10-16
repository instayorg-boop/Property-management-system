import { useState } from "react";
import { Link } from "react-router-dom";
import { MagnifyingGlass as SearchIcon, X } from "@phosphor-icons/react";
import { dicebearAvatarUrl } from "../avatar";
import SlideOver from "./SlideOver";
import { useTenants, formatCurrency, type Tenant } from "../TenantsContext";
import { calcTotalOwed } from "../invoiceUtils";

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

  const q = query.trim().toLowerCase();
  // People who owe come first, then everyone else alphabetically.
  const results = tenants
    .filter(
      (t) =>
        t.active &&
        t.id !== excludeTenantId &&
        (t.name.toLowerCase().includes(q) || t.room.toLowerCase().includes(q) || t.phones.some((p) => p.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~")))
    )
    .sort((a, b) => (calcTotalOwed(b) > 0 ? 1 : 0) - (calcTotalOwed(a) > 0 ? 1 : 0) || a.name.localeCompare(b.name));

  return (
    <SlideOver onClose={onClose} title={title} description={description}>
      <div className="flex items-center gap-2.5 rounded-md border border-transparent bg-mist px-3 py-2.5 transition-colors focus-within:border-brand focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand/15">
        <SearchIcon size={16} weight="bold" className="shrink-0 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, room or phone"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted hover:text-ink">
            <X size={14} weight="bold" />
          </button>
        )}
      </div>
      <p className="mt-2 px-1 text-[11px] text-muted">
        {results.length} tenant{results.length === 1 ? "" : "s"}
        {q ? " found" : ", people who owe first"}
      </p>

      <div className="mt-2 space-y-1">
        {results.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-mist"
          >
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={t.photoUrl || dicebearAvatarUrl(t.id || t.name)}
                alt=""
                className="h-10 w-10 shrink-0 rounded-md bg-mist object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                <p className="truncate text-xs text-muted">
                  {[t.room ? (/^[A-Za-z]?\d+[A-Za-z]?$/.test(t.room) ? `Room ${t.room}` : t.room) : "No unit", t.roomType].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusStyle[t.status]}`}>
                {statusLabel[t.status]}
              </span>
              <p className="mt-1 text-xs text-muted">
                {calcTotalOwed(t) > 0 ? `Owes ${formatCurrency(calcTotalOwed(t))}` : `Rent ${formatCurrency(t.rentAmount)}`}
              </p>
            </div>
          </button>
        ))}
        {results.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted">No tenants match.</p>
            <Link
              to="/tenants/new"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-paper"
            >
              + Add tenant
            </Link>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
