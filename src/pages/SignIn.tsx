import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { signIn } from "../lib/auth";
import { useAuth } from "../landlord/AuthContext";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.44H12v4.62h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.6 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.87 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, isReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The installed PWA opens straight to this page (its start_url) rather than the marketing
  // landing page — an already-signed-in visitor shouldn't have to look at a sign-in form (or tap
  // through it) to get back into the app they just installed, so this sends them straight on to
  // wherever they were headed, or the dashboard by default.
  useEffect(() => {
    if (!isReady || !session) return;
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
    navigate(from ?? "/dashboard", { replace: true });
  }, [isReady, session, location.state, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
      navigate(from ?? "/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-white grid-cols-1 lg:grid-cols-2">
      {/* Left: form */}
      <div className="flex flex-col items-center justify-center px-6 py-8 sm:px-12 lg:px-16 lg:py-10">
        <div className="mx-auto w-full max-w-[320px]">

        <Link to="/" className="flex items-center gap-2 mb-4">
          <img src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png" alt="Instay Manage" className="h-10 " />
          <p className="font-sans text-blue-700 text-xl font-bold leading-[1.08] tracking-[-0.09em]  ">Instay Manage</p>
        </Link>

          <h1 className="font-sans text-xl font-semibold tracking-tight">Welcome back👋🏼</h1>
          <p className="mt-1.5 text-[13px] text-muted">To continue, sign in to Instay.</p>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-paper py-2 text-[13px] font-medium text-ink opacity-50 transition-colors"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] text-muted">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form className="space-y-2.5" onSubmit={handleSubmit}>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">{error}</p>
            )}
            <div>
              <label htmlFor="email" className="mb-1 block text-[11px] font-medium text-muted">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@property.co"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="password" className="block text-[11px] font-medium text-muted">
                  Password
                </label>
                <Link to="/forgot-password" className="text-[11px] font-medium text-muted transition-colors hover:text-ink">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] outline-none transition-colors focus:border-brand"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand py-2 text-[13px] font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-muted">
           
            <Link to="/get-started" className="font-medium text-ink underline-offset-2 hover:underline">
              Create an account
            </Link>
          </p>

          <p className="mt-8 text-center text-[11px] text-muted">
            © {new Date().getFullYear()} Instay. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right: visual */}
      <div className="relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
        <img
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          alt="Modern residential building"
          className="absolute inset-0 h-full w-full object-cover"
        />

      </div>
    </div>
  );
}
