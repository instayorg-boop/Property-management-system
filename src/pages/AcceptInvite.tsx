import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Button from "../landlord/components/Button";
import LoadingScreen from "../components/LoadingScreen";

type LookupResult =
  | {
      valid: true;
      email: string;
      propertyName: string;
      roleLabel: string;
      inviterName: string;
      hasAccount: boolean;
      expiresAt?: string;
    }
  | { valid: false; error: string };

type AcceptErrorBody = {
  error?: string;
  needsSignIn?: boolean;
  email?: string;
  code?: string;
};

async function readFunctionError(error: unknown): Promise<string> {
  const err = error as { context?: Response; message?: string } | null;
  if (err?.context && typeof err.context.json === "function") {
    try {
      const body = (await err.context.json()) as AcceptErrorBody;
      if (body?.error) return body.error;
    } catch {
      // fall through to generic message
    }
  }
  return err?.message || "Something went wrong. Please try again.";
}

async function parseAcceptError(error: unknown): Promise<AcceptErrorBody> {
  const err = error as { context?: Response; message?: string } | null;
  if (err?.context && typeof err.context.json === "function") {
    try {
      return (await err.context.json()) as AcceptErrorBody;
    } catch {
      // ignore
    }
  }
  return { error: err?.message || "Something went wrong. Please try again." };
}

export default function AcceptInvite() {
  const navigate = useNavigate();

  // Lazy initializer runs once during this component's first render, before the URL-scrub effect
  // below ever touches history — safe under StrictMode's dev double-render/double-effect, unlike
  // reading it inside an effect (a second effect invocation would re-read the already-scrubbed URL
  // and overwrite a real token with null, leaving the page stuck on the loading screen forever).
  const [token] = useState<string | null>(() => new URLSearchParams(window.location.search).get("token"));
  const [checking, setChecking] = useState(true);
  const [lookup, setLookup] = useState<LookupResult | null>(null);

  // Session awareness, for states (c) and (d).
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  // No-account signup form state.
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Locked sign-in form state (state d).
  const [signInPassword, setSignInPassword] = useState("");
  const [lockedEmail, setLockedEmail] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Scrub the token from the visible URL — it should never linger in browser history or be
  // persisted anywhere outside this component's state. Idempotent: re-running this (e.g. under
  // StrictMode's dev double-invoke) just replaces the already-clean URL with itself.
  useEffect(() => {
    window.history.replaceState(null, "", "/accept-invite");
  }, []);

  useEffect(() => {
    if (token === null) return;
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) {
          setLookup({ valid: false, error: "This invite link is missing its token." });
          setChecking(false);
        }
        return;
      }
      try {
        const { data, error: fnError } = await supabase.functions.invoke("accept-team-invite", {
          body: { action: "lookup", token },
        });
        if (fnError) {
          const message = await readFunctionError(fnError);
          if (!cancelled) setLookup({ valid: false, error: message });
        } else if (!cancelled) {
          setLookup(data as LookupResult);
        }
      } catch (err) {
        if (!cancelled) {
          setLookup({ valid: false, error: err instanceof Error ? err.message : "Couldn't verify this invite." });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setSessionEmail(data.session?.user?.email ?? null);
        setSessionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeJoin = async (emailForSignIn: string | null, passwordForSignIn: string | null) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      if (emailForSignIn && passwordForSignIn) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailForSignIn,
          password: passwordForSignIn,
        });
        if (signInError) {
          setError(signInError.message);
          setSubmitting(false);
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        setSessionEmail(sessionData.session?.user?.email ?? null);
      }

      const { data, error: fnError } = await supabase.functions.invoke("accept-team-invite", {
        body: { action: "accept", token },
      });
      if (fnError) {
        const body = await parseAcceptError(fnError);
        if (body.needsSignIn) {
          setLockedEmail(body.email ?? (lookup && lookup.valid ? lookup.email : null));
          setError(body.error ?? "Please sign in to continue.");
        } else {
          setError(body.error ?? "Couldn't accept this invite. Please try again.");
        }
        return;
      }

      const result = data as { ok?: boolean; propertyId?: string };
      if (result?.ok && result.propertyId) {
        try {
          localStorage.setItem("ipm.activePropertyId", result.propertyId);
        } catch {
          // non-fatal — AccessContext will fall back to its own default
        }
        navigate("/dashboard");
      } else {
        setError("Couldn't accept this invite. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't accept this invite. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookup || !lookup.valid || !token) return;
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("accept-team-invite", {
        body: { action: "accept", token, fullName, password },
      });
      if (fnError) {
        const body = await parseAcceptError(fnError);
        if (body.needsSignIn) {
          setLockedEmail(body.email ?? lookup.email);
          setError(body.error ?? "An account already exists for this email. Please sign in.");
        } else {
          setError(body.error ?? "Couldn't create your account. Please try again.");
        }
        setSubmitting(false);
        return;
      }

      const result = data as { ok?: boolean; propertyId?: string };
      if (!result?.ok || !result.propertyId) {
        setError("Couldn't create your account. Please try again.");
        setSubmitting(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: lookup.email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setSubmitting(false);
        return;
      }

      try {
        localStorage.setItem("ipm.activePropertyId", result.propertyId);
      } catch {
        // non-fatal
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account. Please try again.");
      setSubmitting(false);
    }
  };

  const handleLockedSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = lockedEmail ?? (lookup && lookup.valid ? lookup.email : null);
    if (!targetEmail) return;
    await completeJoin(targetEmail, signInPassword);
  };

  const handleSignOut = async () => {
    setSubmitting(true);
    try {
      await supabase.auth.signOut();
      setSessionEmail(null);
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="grid min-h-screen bg-white grid-cols-1 lg:grid-cols-2">
      <div className="flex flex-col items-center justify-center px-6 sm:px-14 lg:px-24">
        <div className="mx-auto w-full max-w-xl">
          <Link to="/" className="flex items-center gap-3 mb-6">
            <img
              src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png"
              alt="Instay Manage"
              className="h-12 w-12 rounded-md object-contain"
            />
            <p className="font-sans text-blue-700 text-2xl font-bold tracking-[-0.07em]">Instay Manage</p>
          </Link>
          {children}
          <p className="mt-10 text-center text-[12px] text-muted">
            © {new Date().getFullYear()} Instay Manage. All rights reserved.
          </p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
        <img
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          alt="Modern residential building"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    </div>
  );

  if (checking || !sessionChecked || token === null) return <LoadingScreen />;

  // State (a): invalid/expired invite.
  if (!lookup || !lookup.valid) {
    const message = lookup && !lookup.valid ? lookup.error : "This invite link is invalid.";
    return shell(
      <div>
        <h1 className="font-sans text-2xl font-semibold tracking-tight mb-1">Invite not available</h1>
        <p className="mb-5 text-[14px] text-muted">{message}</p>
        <Link to="/sign-in" className="font-medium text-brand underline-offset-2 hover:underline text-[14px]">
          Back to sign in
        </Link>
      </div>
    );
  }

  const inviteEmail = lockedEmail ?? lookup.email;
  const needsLockedSignIn =
    lockedEmail !== null ||
    (lookup.hasAccount && sessionEmail && sessionEmail.toLowerCase() !== lookup.email.toLowerCase()) ||
    (lookup.hasAccount && !sessionEmail);

  const isSignedInAsInviteEmail =
    lookup.hasAccount && sessionEmail !== null && sessionEmail.toLowerCase() === lookup.email.toLowerCase() && !lockedEmail;

  const isSignedInAsDifferentEmail =
    lookup.hasAccount && sessionEmail !== null && sessionEmail.toLowerCase() !== lookup.email.toLowerCase() && !lockedEmail;

  // State (b): no account yet — signup form.
  if (!lookup.hasAccount) {
    return shell(
      <div>
        <h1 className="font-sans text-2xl font-semibold tracking-tight mb-1">You're invited 🎉</h1>
        <p className="mb-5 text-[14px] text-muted">
          <span className="font-medium text-ink">{lookup.inviterName}</span> invited you to{" "}
          <span className="font-medium text-ink">{lookup.propertyName}</span> as{" "}
          <span className="font-medium text-ink">{lookup.roleLabel}</span>.
        </p>

        <form className="space-y-4" onSubmit={handleSignupSubmit}>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-600 mb-1">{error}</p>}

          <div>
            <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-muted">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={lookup.email}
              disabled
              className="w-full rounded-md border border-line bg-mist px-3 py-2 text-[14px] text-muted outline-none"
            />
          </div>

          <div>
            <label htmlFor="fullName" className="mb-1 block text-[12px] font-medium text-muted">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-[12px] font-medium text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] outline-none transition-colors focus:border-brand"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-[12px] font-medium text-muted">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] outline-none transition-colors focus:border-brand"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            size="md"
            className="w-full rounded-md bg-brand py-2 text-[14px] font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
          >
            {submitting ? "Creating account…" : "Create account & join"}
          </Button>
        </form>
      </div>
    );
  }

  // State (d): has account, signed in as a different email.
  if (isSignedInAsDifferentEmail) {
    return shell(
      <div>
        <h1 className="font-sans text-2xl font-semibold tracking-tight mb-1">Wrong account</h1>
        <p className="mb-5 text-[14px] text-muted">
          This invite is for <span className="font-medium text-ink">{lookup.email}</span>. Sign out to continue.
        </p>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-600 mb-4">{error}</p>}
        <Button
          type="button"
          variant="primary"
          disabled={submitting}
          size="md"
          onClick={handleSignOut}
          className="w-full rounded-md bg-brand py-2 text-[14px] font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
        >
          {submitting ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    );
  }

  // State (c): has account, already signed in as the invite's email — show a "Join" action.
  if (isSignedInAsInviteEmail) {
    return shell(
      <div>
        <h1 className="font-sans text-2xl font-semibold tracking-tight mb-1">Join {lookup.propertyName}</h1>
        <p className="mb-5 text-[14px] text-muted">
          <span className="font-medium text-ink">{lookup.inviterName}</span> invited you to{" "}
          <span className="font-medium text-ink">{lookup.propertyName}</span> as{" "}
          <span className="font-medium text-ink">{lookup.roleLabel}</span>.
        </p>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-600 mb-4">{error}</p>}
        <Button
          type="button"
          variant="primary"
          disabled={submitting}
          size="md"
          onClick={() => completeJoin(null, null)}
          className="w-full rounded-md bg-brand py-2 text-[14px] font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
        >
          {submitting ? "Joining…" : `Join ${lookup.propertyName}`}
        </Button>
      </div>
    );
  }

  // State (d) fallback: has account, not signed in (or needsSignIn was returned) — locked sign-in form.
  if (needsLockedSignIn) {
    return shell(
      <div>
        <h1 className="font-sans text-2xl font-semibold tracking-tight mb-1">Sign in to continue</h1>
        <p className="mb-5 text-[14px] text-muted">
          Sign in as <span className="font-medium text-ink">{inviteEmail}</span> to join{" "}
          <span className="font-medium text-ink">{lookup.propertyName}</span>.
        </p>

        <form className="space-y-4" onSubmit={handleLockedSignIn}>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-600 mb-1">{error}</p>}

          <div>
            <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-muted">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={inviteEmail}
              disabled
              className="w-full rounded-md border border-line bg-mist px-3 py-2 text-[14px] text-muted outline-none"
            />
          </div>

          <div>
            <label htmlFor="signInPassword" className="mb-1 block text-[12px] font-medium text-muted">
              Password
            </label>
            <input
              id="signInPassword"
              type="password"
              required
              value={signInPassword}
              onChange={(e) => setSignInPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] outline-none transition-colors focus:border-brand"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            size="md"
            className="w-full rounded-md bg-brand py-2 text-[14px] font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
          >
            {submitting ? "Signing in…" : "Sign in & join"}
          </Button>
        </form>
      </div>
    );
  }

  return <LoadingScreen />;
}
