import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MagnifyingGlass, CaretRight, House } from "@phosphor-icons/react";
import { formatCurrency } from "../../landlord/TenantsContext";
import { getPortalProperty, searchPortalTenants, type PortalTenantSummary } from "../../lib/payPortal";
import PayShell from "./PayShell";

export default function SelectTenant() {
  const { propertySlug } = useParams();
  const navigate = useNavigate();
  const [propertyName, setPropertyName] = useState("");
  const [tenants, setTenants] = useState<PortalTenantSummary[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!propertySlug) return;
    let cancelled = false;
    (async () => {
      const [property, results] = await Promise.all([getPortalProperty(propertySlug), searchPortalTenants(propertySlug)]);
      if (cancelled) return;
      setPropertyName(property?.name ?? "");
      setTenants(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertySlug]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants.filter((t) => !q || t.name.toLowerCase().includes(q) || t.room.toLowerCase().includes(q));
  }, [tenants, query]);

  return (
    <PayShell propertyName={propertyName}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand">
          <House size={16} weight="fill" />
        </div>
        <div>
          <p className="font-display text-base font-semibold tracking-tight text-ink">Find your name</p>
          <p className="text-xs text-muted">to view your balance and pay rent</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-mist px-3 py-2.5 focus-within:border-brand">
        <MagnifyingGlass size={16} weight="bold" className="text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or room"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      <div className="mt-3 -mx-1 max-h-90 space-y-1 overflow-y-auto px-1">
        {results.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(`/pay/${propertySlug}/${t.id}`)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-mist active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-mist text-[11px] font-semibold text-muted">
                {t.name.split(" ").map((s) => s[0]).join("")}
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{t.name}</p>
                <p className="text-xs text-muted">{t.room}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {t.owedAmount > 0 ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                  {formatCurrency(t.owedAmount)}
                </span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">Paid up</span>
              )}
              <CaretRight size={14} weight="bold" className="text-muted" />
            </div>
          </button>
        ))}
        {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No match. Check the spelling and try again.</p>}
      </div>
    </PayShell>
  );
}
