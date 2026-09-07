import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { updatePassword } from "../lib/auth";

/** Landing page for the link in the password-reset email. Supabase's redirect already exchanges
 * the recovery token for a session before this mounts, so this just collects the new password. */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      window.setTimeout(() => navigate("/dashboard", { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update your password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-8">
      <div className="mx-auto w-full max-w-[320px]">
        <Link to="/" className="flex w-fit items-center gap-1.5 mb-5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-ink">
            <span className="font-display text-[10px] font-bold text-paper">I</span>
          </div>
          <span className="font-display text-[13px] font-semibold tracking-tight">Instay</span>
        </Link>

        {done ? (
          <>
            <h1 className="font-display text-xl font-semibold tracking-tight">Password updated.</h1>
            <p className="mt-1.5 text-[13px] text-muted">Taking you to your dashboard…</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl font-semibold tracking-tight">Choose a new password.</h1>
            <p className="mt-1.5 text-[13px] text-muted">Make it at least 8 characters.</p>

            <form className="mt-5 space-y-2.5" onSubmit={handleSubmit}>
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">{error}</p>
              )}
              <div>
                <label htmlFor="password" className="mb-1 block text-[11px] font-medium text-muted">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
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
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
