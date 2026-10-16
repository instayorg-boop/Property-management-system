import { useState } from "react";
import { Link } from "react-router-dom";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { sendPasswordReset } from "../lib/auth";
import AuthShell from "../components/AuthShell";
import Button from "../landlord/components/Button";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the reset link. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <>
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-brand-soft text-brand">
            <EnvelopeSimple size={22} weight="duotone" />
          </span>
          <h1 className="mb-1 font-sans text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="text-[14px] text-muted">
            If an account exists for <span className="font-medium text-ink">{email}</span>, we've sent a link to choose a new
            password. It may take a minute, and check your spam folder too.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={() => void handleSubmit()} disabled={loading}>
              {loading ? "Sending…" : "Send it again"}
            </Button>
            <Link
              to="/sign-in"
              className="inline-flex items-center rounded-md px-3 text-[14px] font-medium text-brand underline-offset-2 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="mb-1 font-sans text-2xl font-semibold tracking-tight">Forgot your password?</h1>
          <p className="mb-6 text-[14px] text-muted">Enter your email and we'll send you a link to set a new one.</p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-600">{error}</p>}
            <div>
              <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-muted">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@property.co"
                className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
              />
            </div>
            <Button type="submit" variant="primary" size="md" disabled={loading} className="w-full rounded-md py-2 text-[14px]">
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>

          <p className="mt-5 text-center text-[13px] text-muted">
            Remembered it?{" "}
            <Link to="/sign-in" className="font-medium text-brand underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
