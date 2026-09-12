import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Warning } from "@phosphor-icons/react";
import { resolvePortalToken } from "../../lib/payPortal";
import PayShell from "./PayShell";
import Spinner from "./Spinner";

/** Landing point for a tenant's short SMS/WhatsApp link (pay.instay.co/p/:token) — the token alone
 * identifies both property and tenant, so this resolves it and redirects straight into the real
 * portal route (/pay/:propertySlug/:tenantId), skipping the "search for yourself" step entirely.
 * A dead/mistyped token shows an error instead of silently redirecting nowhere. */
export default function TokenLink() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolvePortalToken(token);
        if (cancelled) return;
        if (!resolved) {
          setNotFound(true);
          return;
        }
        navigate(`/pay/${resolved.propertySlug}/${resolved.tenantId}`, {
          replace: true,
          state: { name: resolved.tenantName, room: resolved.room ? `Room ${resolved.room}` : undefined },
        });
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  if (notFound) {
    return (
      <PayShell propertyName="">
        <div className="pay-step flex flex-col items-center py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Warning size={22} weight="duotone" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold tracking-tight text-[#0d253d]">Link not found</h1>
          <p className="mt-1.5 max-w-xs text-sm text-[#64748d]">
            This payment link isn't valid anymore. Check the link, or ask your landlord for a new one.
          </p>
          <Link to="/" className="mt-4 text-sm font-medium text-[#533afd] hover:underline">
            Go to Instay
          </Link>
        </div>
      </PayShell>
    );
  }

  return (
    <PayShell propertyName="">
      <div className="flex flex-col items-center justify-center py-16">
        <Spinner size={24} color="#533afd" />
      </div>
    </PayShell>
  );
}
