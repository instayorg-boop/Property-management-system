import { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordReset } from "../lib/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the reset link. Try again.");
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

        {sent ? (
          <>
            <h1 className="font-display text-xl font-semibold tracking-tight">Check your email.</h1>
            <p className="mt-1.5 text-[13px] text-muted">
              If an account exists for <span className="font-medium text-ink">{email}</span>, a reset link is on its way.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl font-semibold tracking-tight">Reset your password.</h1>
            <p className="mt-1.5 text-[13px] text-muted">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form className="mt-5 space-y-2.5" onSubmit={handleSubmit}>
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

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-brand py-2 text-[13px] font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="mt-5 text-center text-[13px] text-muted">
          <Link to="/sign-in" className="font-medium text-ink underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
