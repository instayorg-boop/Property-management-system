import { Outlet } from "react-router-dom";

/**
 * Public payment-link surface — no auth, no dashboard chrome. Pages here talk to Supabase only
 * through the narrow `pay_portal_*` SECURITY DEFINER functions in `src/lib/payPortal.ts`, never
 * the landlord dashboard's contexts — those fetch entire tables under a permissive pre-auth RLS
 * policy meant for the landlord's own session, which would leak every tenant's data to any visitor
 * of this public route if reused here.
 */
export default function PaymentLayout() {
  return (
    <div className="min-h-screen bg-mist">
      <Outlet />
    </div>
  );
}
