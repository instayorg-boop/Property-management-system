import { useEffect, useState } from "react";
import { resolvePortalToken, getPortalProperty } from "../../lib/payPortal";

/** Resolves a /p/:token link into the propertySlug/tenantId it points at, plus the property's own
 * display info (name, logo) — the same first two steps TenantBalance already did inline, now
 * shared so a new portal page (statements history, documents) can be a standalone, bookmarkable
 * route that re-resolves its own token on load instead of depending on router state passed down
 * from TenantBalance. */
export function usePortalIdentity(token: string | undefined) {
  const [propertySlug, setPropertySlug] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [propertyLogoUrl, setPropertyLogoUrl] = useState<string | null>(null);
  const [propertyDueDay, setPropertyDueDay] = useState(1);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const resolved = await resolvePortalToken(token);
      if (cancelled) return;
      if (!resolved) {
        setNotFound(true);
        return;
      }
      setPropertySlug(resolved.propertySlug);
      setTenantId(resolved.tenantId);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!propertySlug) return;
    let cancelled = false;
    getPortalProperty(propertySlug).then((property) => {
      if (cancelled) return;
      setPropertyName(property?.name ?? "");
      setPropertyLogoUrl(property?.logoUrl ?? null);
      // 1st-of-month is the same fallback the landlord dashboard's own useSettings() effectively
      // lands on for a property that's never set one — not fabricated here, just not undefined.
      setPropertyDueDay(property?.dueDay ?? 1);
    });
    return () => {
      cancelled = true;
    };
  }, [propertySlug]);

  return { propertySlug, tenantId, propertyName, propertyLogoUrl, propertyDueDay, notFound };
}
