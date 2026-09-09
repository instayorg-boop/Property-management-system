import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MagnifyingGlass, CaretRight } from "@phosphor-icons/react";
import { getPortalProperty, searchPortalTenants, type PortalTenantSummary } from "../../lib/payPortal";
import PayShell from "./PayShell";
import Skeleton from "./Skeleton";

export default function SelectTenant() {
  const { propertySlug } = useParams();
  const navigate = useNavigate();
  const [propertyName, setPropertyName] = useState("");
  const [tenants, setTenants] = useState<PortalTenantSummary[] | null>(null);
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
    return (tenants ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.room.toLowerCase().includes(q));
  }, [tenants, query]);

  // Fades the bottom edge of the list only while there's more to scroll to — a quiet cue that
  // doesn't need a visible scrollbar to tell the tenant the list continues.
  const listRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => setShowBottomFade(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    update();
    el.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [results.length]);

  return (
    <PayShell propertyName={propertyName}>
      <div className="pay-step mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#0d253d]">Pay rent</h1>
        <p className="mt-1 text-sm text-[#64748d]">Select your name to see your balance and pay.</p>
      </div>

      <div className="pay-step flex items-center gap-2 rounded-md border border-[#a8c3de] bg-white px-3 py-2.5 transition-colors focus-within:border-[#533afd]">
        <MagnifyingGlass size={16} weight="bold" className="text-[#64748d]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or room"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#64748d]"
        />
      </div>

      <div className="relative mt-3">
        <div ref={listRef} className="scrollbar-hide -mx-1 max-h-90 space-y-1 overflow-y-auto px-1">
          {tenants === null &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            ))}

          {tenants !== null &&
            results.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/pay/${propertySlug}/${t.id}`, { state: { name: t.name, room: t.room } })}
                style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}
                className="pay-step flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[#f6f9fc] active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5">
                  <div>
                    <p className="text-sm font-medium text-[#0d253d]">{t.name}</p>
                    <p className="text-xs text-[#64748d]">{t.room}</p>
                  </div>
                </div>
                <CaretRight size={14} weight="bold" className="text-[#64748d]" />
              </button>
            ))}

          {tenants !== null && results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[#64748d]">No match. Check the spelling and try again.</p>
          )}
        </div>

        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent transition-opacity duration-200 ${
            showBottomFade ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </PayShell>
  );
}
