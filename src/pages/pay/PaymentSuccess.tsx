import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { resolvePortalToken, getPortalProperty, getPortalTenant, type PortalTenant } from "../../lib/payPortal";
import PaymentComplete from "./PaymentComplete";

type SuccessState = {
  amount?: number;
  feeAmount?: number;
  rentPortion?: number;
  isPartial?: boolean;
  method?: "mobile" | "card";
  provider?: "mtn" | "airtel" | "zamtel";
  phone?: string;
  /** The Lenco collectionId — also the reference shown on the receipt and what the PDF receipt is
   * generated from. */
  reference?: string;
};

export default function PaymentSuccess() {
  const { token } = useParams();
  const location = useLocation();
  const [propertySlug, setPropertySlug] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [propertyLogoUrl, setPropertyLogoUrl] = useState<string | null>(null);
  const [tenant, setTenant] = useState<PortalTenant | null>(null);

  // Re-resolving the token here (rather than trusting a session left over from TenantBalance) is
  // what lets this page work as a standalone reload/bookmark too, same as the balance page. The
  // dollar figures on the receipt come from router state (set right after collect-payment/poll
  // resolves) — this fetch is only for the tenant's current room/balance, to know whether the
  // payment cleared the balance (isFull) if the state didn't already say so.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const resolved = await resolvePortalToken(token);
      if (cancelled || !resolved) return;
      setPropertySlug(resolved.propertySlug);
      const [property, t] = await Promise.all([
        getPortalProperty(resolved.propertySlug),
        getPortalTenant(resolved.propertySlug, resolved.tenantId),
      ]);
      if (cancelled) return;
      setPropertyName(property?.name ?? "");
      setPropertyLogoUrl(property?.logoUrl ?? null);
      setTenant(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const state = (location.state as SuccessState | null) ?? null;
  const paidAt = useMemo(() => new Date(), []);

  if (!tenant || !propertySlug || !state?.amount || !state?.reference) {
    // Either still resolving, or this page was opened without the transaction state that only
    // exists right after TenantBalance's own redirect — nothing meaningful to show either way.
    return null;
  }

  // isPartial reflects the balance the way it actually settled — prefer the flag the collect
  // response/poll already computed server-side, but if it's missing (e.g. someone re-opened this
  // URL from history) fall back to the tenant's current owed_amount.
  const remainingBalance = state.isPartial === undefined ? tenant.owedAmount : state.isPartial ? tenant.owedAmount : 0;

  return (
    <PaymentComplete
      propertyName={propertyName}
      avatarUrl={propertyLogoUrl}
      propertySlug={propertySlug}
      tenantId={tenant.id}
      room={tenant.room}
      paidAmount={state.amount}
      rentPortion={state.rentPortion ?? state.amount}
      feeAmount={state.feeAmount ?? 0}
      remainingBalance={remainingBalance}
      reference={state.reference}
      collectionId={state.reference}
      operator={state.provider ?? "mtn"}
      phone={state.phone ?? tenant.phone ?? ""}
      paidAt={paidAt}
    />
  );
}
