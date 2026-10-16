import { useEffect, useState } from "react";
import { Eye, EyeSlash, Check, LockKey } from "@phosphor-icons/react";
import Modal from "./Modal";
import Button from "./Button";
import { supabase } from "../../lib/supabaseClient";
import { sendPasswordReset, updatePassword } from "../../lib/auth";

const fieldCls =
  "w-full rounded-md border border-line bg-paper px-3 py-2.5 pr-10 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20";

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={fieldCls}
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
    </div>
  );
}

/** Change password from Settings: confirms the current password first (so an unattended, signed-in
 * laptop can't be used to take over the account), then sets the new one. */
export default function ChangePasswordModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const rules = [
    { ok: next.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(next) && /\d/.test(next), label: "Letters and numbers" },
    { ok: next.length > 0 && next !== current, label: "Different from your current one" },
  ];
  const matches = confirm.length > 0 && confirm === next;
  const canSave = current.length > 0 && rules.every((r) => r.ok) && matches && !saving;

  const submit = async () => {
    if (!canSave || !email) return;
    setSaving(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (authError) {
        setError("Your current password is incorrect.");
        return;
      }
      await updatePassword(next);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change your password. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const sendReset = async () => {
    if (!email) return;
    try {
      await sendPasswordReset(email);
      setResetSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the reset email.");
    }
  };

  return (
    <Modal
      onClose={onClose}
      title="Change password"
      description={email ? `For ${email}` : undefined}
      icon={<LockKey size={18} weight="duotone" />}
      maxWidth="xs"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!canSave}>
            {saving ? "Saving…" : "Update password"}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
          <div className="mt-1.5 text-right">
            {resetSent ? (
              <span className="text-xs text-emerald-600">Reset link sent to your email.</span>
            ) : (
              <button type="button" onClick={() => void sendReset()} className="text-xs font-medium text-brand hover:underline">
                Forgot it? Email me a reset link
              </button>
            )}
          </div>
        </div>

        <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <ul className="space-y-1">
          {rules.map((r) => (
            <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-emerald-600" : "text-muted"}`}>
              <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${r.ok ? "bg-emerald-100" : "bg-mist"}`}>
                {r.ok && <Check size={9} weight="bold" />}
              </span>
              {r.label}
            </li>
          ))}
        </ul>

        <div>
          <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {confirm.length > 0 && !matches && <p className="mt-1.5 text-xs text-red-600">Passwords don't match.</p>}
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
