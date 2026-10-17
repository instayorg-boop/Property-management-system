import { Suspense } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { AccessProvider, useAccess } from "../AccessContext";
import { supabase } from "../../lib/supabaseClient";
import LoadingScreen, { MinimumLoadingScreen } from "../../components/LoadingScreen";

function AccessGate() {
  const { isReady, rows, accessRemoved } = useAccess();

  if (accessRemoved || (isReady && rows.length === 0)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <h1 className="text-lg font-semibold">Your access to this property was removed</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          An owner removed your access, or your invite was revoked. Sign out and ask them to invite you again if this is unexpected.
        </p>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!isReady) return <LoadingScreen />;

  return (
    <MinimumLoadingScreen>
      <Suspense fallback={<LoadingScreen />}>
        <Outlet />
      </Suspense>
    </MinimumLoadingScreen>
  );
}

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
    <AccessProvider>
      <AccessGate />
    </AccessProvider>
  );
}
