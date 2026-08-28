import { Link } from "react-router-dom";

export default function ForgotPassword() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-8">
      <div className="mx-auto w-full max-w-[320px]">
        <Link to="/" className="flex w-fit items-center gap-1.5 mb-5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-ink">
            <span className="font-display text-[10px] font-bold text-paper">I</span>
          </div>
          <span className="font-display text-[13px] font-semibold tracking-tight">Instay</span>
        </Link>

        <h1 className="font-display text-xl font-semibold tracking-tight">Reset your password.</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        <form className="mt-5 space-y-2.5">
          <div>
            <label htmlFor="email" className="mb-1 block text-[11px] font-medium text-muted">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="you@property.co"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-brand py-2 text-[13px] font-medium text-paper transition-transform hover:scale-[1.01]"
          >
            Send reset link
          </button>
        </form>

        <p className="mt-5 text-center text-[13px] text-muted">
          <Link to="/sign-in" className="font-medium text-ink underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
