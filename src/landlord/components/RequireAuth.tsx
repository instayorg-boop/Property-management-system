import { Suspense } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import LoadingScreen, { MinimumLoadingScreen } from "../../components/LoadingScreen";

/** Gates every dashboard route behind a signed-in session, sending an anonymous
 * visitor to sign in first and back to where they were headed once they do. */
export default function RequireAuth() {
  const { session, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) return <LoadingScreen />;
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location }} />;

  // This guard stays mounted across dashboard navigation, so the minimum hold only happens on
  // entering the dashboard (app open, or just after sign-in), never on page-to-page moves. The
  // Suspense sits inside it so the dashboard chunk downloads under the same hold rather than
  // suspending up to the root boundary and restarting it.
  return (
    <MinimumLoadingScreen>
      <Suspense fallback={<LoadingScreen />}>
        <Outlet />
      </Suspense>
    </MinimumLoadingScreen>
  );
}
