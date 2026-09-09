import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Session, User } from "@supabase/supabase-js";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** False until the initial session check resolves — routes use this to avoid a flash redirect to /sign-in. */
  isReady: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const LAST_ACTIVE_KEY = "instay:lastActiveAt";
// A manager who opens the app at least this often never sees a forced re-login. Supabase's own
// refresh token (rotated on every use) would otherwise keep a session alive indefinitely — this
// is an app-level ceiling on top of that, independent of the project's Auth dashboard settings,
// so the "no daily logins, but not forever either" behavior is guaranteed regardless of how
// those are configured.
const MAX_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const lastActive = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? 0);
    const staleSession = lastActive > 0 && Date.now() - lastActive > MAX_INACTIVITY_MS;

    (async () => {
      if (staleSession) {
        // Sign out rather than trust a refresh token that's technically still valid — the
        // manager hasn't opened this in over 30 days, so treat the session as expired.
        await supabase.auth.signOut();
        localStorage.removeItem(LAST_ACTIVE_KEY);
        setSession(null);
        setIsReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      setSession(data.session);
      setIsReady(true);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      else localStorage.removeItem(LAST_ACTIVE_KEY);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, isReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
