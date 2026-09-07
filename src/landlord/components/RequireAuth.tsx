import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

/** Gates every dashboard/onboarding route behind a signed-in session, sending an anonymous
 * visitor to sign in first and back to where they were headed once they do. */
export default function RequireAuth() {
  const { session, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) return null;
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location }} />;

  return <Outlet />;
}
