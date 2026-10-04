import { Outlet } from "react-router-dom";
import { PortalFrame } from "./portalUi";

/**
 * Public tenant-portal surface — no auth, no dashboard chrome. Pages under here talk to Supabase
 * only through the narrow `pay_portal_*` SECURITY DEFINER functions in `src/lib/payPortal.ts`
 * (wrapped by portalData.ts), never the landlord dashboard's contexts — those fetch entire tables
 * under a permissive pre-auth RLS policy meant for the landlord's own session, which would leak
 * every tenant's data to any visitor of this public route if reused here.
 *
 * The frame is mounted once, above the Outlet, so navigating between portal pages never remounts
 * the page chrome or re-injects its styles — the tap-to-paint is a content swap, nothing more.
 */
export default function PortalLayout() {
  return (
    <PortalFrame>
      <Outlet />
    </PortalFrame>
  );
}
