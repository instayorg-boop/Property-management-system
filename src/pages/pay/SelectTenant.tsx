import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MagnifyingGlass, CaretRight } from "@phosphor-icons/react";
import { useTenants, formatCurrency } from "../../landlord/TenantsContext";
import { useSettings } from "../../landlord/SettingsContext";
import PayShell from "./PayShell";

export default function SelectTenant() {
  const { propertySlug } = useParams();
  const navigate = useNavigate();
  const { propertyName } = useSettings();
  const { tenants } = useTenants();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants
      .filter((t) => t.active)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.room.toLowerCase().includes(q));
  }, [tenants, query]);

  return (
    <PayShell propertyName={propertyName}>
      <p className="font-display text-lg font-semibold tracking-tight text-ink">Find your name</p>
      <p className="mt-1 text-sm text-muted">Search for yourself to view your balance and pay rent.</p>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-mist px-3 py-2.5">
        <MagnifyingGlass size={16} weight="bold" className="text-muted" />
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
            onClick={() => navigate(`/pay/${propertySlug}/${t.id}`)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-mist"
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
              <span className="text-xs text-muted">{formatCurrency(t.owedAmount || t.rentAmount)}</span>
              <CaretRight size={14} weight="bold" className="text-muted" />
            </div>
          </button>
        ))}
        {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No match. Check the spelling and try again.</p>}
      </div>
    </PayShell>
  );
}
