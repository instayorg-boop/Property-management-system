import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, CheckCircle, Eye, EyeSlash, WarningCircle } from "@phosphor-icons/react";
import { updatePassword } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import AuthShell from "../components/AuthShell";
import Button from "../landlord/components/Button";

const inputCls =
  "w-full rounded-md border border-line bg-paper px-3 py-2 pr-10 text-[14px] outline-none transition-colors placeholder:text-muted/60 focus:border-brand";

function PasswordInput({ id, value, onChange, autoFocus }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        autoFocus={autoFocus}
        autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
        placeholder="••••••••"
        className={inputCls}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink"
      >
        {show ? <EyeSlash size={16} weight="bold" /> : <Eye size={16} weight="bold" />}
      </button>
    </div>
  );
}

/** Landing page for the link in the password-reset email. Supabase turns the link into a recovery
 * session; if there isn't one (old or already-used link), the page says so instead of failing on save. */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [linkState, setLinkState] = useState<"checking" | "ok" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let settled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        settled = true;
        setLinkState("ok");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setLinkState("ok");
      }
    });
    const timer = window.setTimeout(() => {
      if (!settled) setLinkState("expired");
    }, 2500);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const rules = [
    { ok: password.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), label: "Letters and numbers" },
  ];
  const matches = confirm.length > 0 && confirm === password;
  const canSave = rules.every((r) => r.ok) && matches && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
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
    <AuthShell>
      {done ? (
        <>
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
            <CheckCircle size={22} weight="duotone" />
          </span>
          <h1 className="mb-1 font-sans text-2xl font-semibold tracking-tight">Password updated</h1>
          <p className="text-[14px] text-muted">Taking you to your dashboard…</p>
        </>
      ) : linkState === "expired" ? (
        <>
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-amber-50 text-amber-600">
            <WarningCircle size={22} weight="duotone" />
          </span>
          <h1 className="mb-1 font-sans text-2xl font-semibold tracking-tight">This link has expired</h1>
          <p className="text-[14px] text-muted">Reset links only work once and for a limited time. Request a new one and use it straight away.</p>
          <Link
            to="/forgot-password"
            className="mt-6 inline-flex h-10 items-center rounded-md bg-brand px-4 text-[14px] font-medium text-paper transition-colors hover:bg-brand/90"
          >
            Send a new link
          </Link>
        </>
      ) : (
        <>
          <h1 className="mb-1 font-sans text-2xl font-semibold tracking-tight">Choose a new password</h1>
          <p className="mb-6 text-[14px] text-muted">You'll use it next time you sign in.</p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-600">{error}</p>}
            <div>
              <label htmlFor="password" className="mb-1 block text-[12px] font-medium text-muted">
                New password
              </label>
              <PasswordInput id="password" value={password} onChange={setPassword} autoFocus />
              <ul className="mt-2 space-y-1">
                {rules.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1.5 text-[12px] ${r.ok ? "text-emerald-600" : "text-muted"}`}>
                    <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${r.ok ? "bg-emerald-100" : "bg-mist"}`}>
                      {r.ok && <Check size={9} weight="bold" />}
                    </span>
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label htmlFor="confirm" className="mb-1 block text-[12px] font-medium text-muted">
                Confirm new password
              </label>
              <PasswordInput id="confirm" value={confirm} onChange={setConfirm} />
              {confirm.length > 0 && !matches && <p className="mt-1.5 text-[12px] text-red-600">Passwords don't match.</p>}
            </div>
            <Button type="submit" variant="primary" size="md" disabled={!canSave || linkState !== "ok"} className="w-full rounded-md py-2 text-[14px]">
              {linkState === "checking" ? "Checking your link…" : loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
