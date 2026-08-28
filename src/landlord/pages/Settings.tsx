import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "../components/PageHeader";

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M3 10.5V3.5A1.5 1.5 0 0 1 4.5 2h7" strokeLinecap="round" />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <rect x="2" y="2" width="4.5" height="4.5" rx="0.5" />
      <rect x="9.5" y="2" width="4.5" height="4.5" rx="0.5" />
      <rect x="2" y="9.5" width="4.5" height="4.5" rx="0.5" />
      <path d="M9.5 9.5h2v2h-2v-2Zm2.5 2.5h2v2h-2v-2Zm0-5h2v2h-2v-2Z" />
    </svg>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-line"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper shadow transition-transform ${
          checked ? "translate-x-5.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** One horizontal label/description + control row — the space-efficient pattern, no boxed card per field. */
function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="py-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-3xl">
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          {desc && <p className="mt-1 max-w-sm text-xs text-muted">{desc}</p>}
        </div>
        <div className="flex items-center">{children}</div>
      </div>
    </div>
  );
}

function Input({ defaultValue, type = "text" }: { defaultValue?: string; type?: string }) {
  return (
    <input
      type={type}
      defaultValue={defaultValue}
      className="w-full max-w-xs rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
    />
  );
}

const tabs = ["Property", "Billing", "Reminders", "Payment link", "Lenco payout", "Subscription", "Account"] as const;
type Tab = (typeof tabs)[number];

export default function Settings() {
  const [tab, setTab] = useState<Tab>("Property");
  const [invoicesOn, setInvoicesOn] = useState(false);
  const [contactOrder, setContactOrder] = useState<"student" | "guardian">("student");
  const [linkCopied, setLinkCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <PageHeader title="Settings" />

      <div className="px-8 pb-10">
        {/* Top tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line">
          <div className="flex flex-wrap gap-5">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`relative shrink-0 pb-3 text-sm font-medium transition-colors ${
                  tab === t ? "text-brand" : "text-muted hover:text-ink"
                }`}
              >
                {t}
                {tab === t && (
                  <motion.span
                    layoutId="settings-tab-underline"
                    className="absolute right-0 -bottom-px left-0 h-0.5 rounded-full bg-brand"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>

          <motion.button
            type="button"
            onClick={save}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className={`mb-2 shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper ${
              tab === "Property" || tab === "Billing" || tab === "Reminders" ? "visible" : "invisible"
            }`}
          >
            {saved ? "Saved" : "Save changes"}
          </motion.button>
        </div>

        <div>
          {tab === "Property" && (
            <>
              <Row label="Property name">
                <Input defaultValue="Kabulonga House" />
              </Row>
              <Row label="Address">
                <Input defaultValue="Plot 14, Kabulonga, Lusaka" />
              </Row>
              <Row label="Property type">
                <Input defaultValue="Student accommodation" />
              </Row>
            </>
          )}

          {tab === "Billing" && (
            <>
              <Row label="Billing period">
                <Input defaultValue="Monthly" />
              </Row>
              <Row label="Due date">
                <Input defaultValue="30th" />
              </Row>
              <Row label="Grace period" desc="Days after the due date before rent is marked overdue.">
                <Input defaultValue="5" type="number" />
              </Row>
              <Row label="Daily penalty rate (K)" desc="Charged per day once the grace period ends.">
                <Input defaultValue="15" type="number" />
              </Row>
              <Row
                label="Generate invoices"
                desc="Lets you pre-fill and send invoices for every tenant from the Rent page, including carried-over balances."
              >
                <Toggle checked={invoicesOn} onChange={setInvoicesOn} />
              </Row>
            </>
          )}

          {tab === "Reminders" && (
            <>
              <Row label="Days before due date" desc="When the first pre-due reminder goes out.">
                <Input defaultValue="3" type="number" />
              </Row>
              <Row label="Days overdue before escalation" desc="When a guardian gets contacted automatically.">
                <Input defaultValue="7" type="number" />
              </Row>
              <Row label="Contact order" desc="Who gets reminded first when rent is due.">
                <div className="flex gap-2">
                  {(["student", "guardian"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setContactOrder(o)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        contactOrder === o ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                      }`}
                    >
                      {o === "student" ? "Student first" : "Guardian first"}
                    </button>
                  ))}
                </div>
              </Row>
            </>
          )}

          {tab === "Payment link" && (
            <Row label="Your payment link" desc="Share this with tenants directly, or display the QR code at the property office.">
              <div className="flex w-full max-w-md items-center gap-2 rounded-lg border border-line bg-mist px-3 py-2">
                <span className="flex-1 truncate text-sm text-muted">pay.instay.co/kabulonga-house</span>
                <button
                  type="button"
                  onClick={() => {
                    setLinkCopied(true);
                    window.setTimeout(() => setLinkCopied(false), 1500);
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-mist"
                >
                  <CopyIcon />
                  {linkCopied ? "Copied" : "Copy"}
                </button>
                <button type="button" className="flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-mist">
                  <QrIcon />
                  QR code
                </button>
              </div>
            </Row>
          )}

          {tab === "Lenco payout" && (
            <>
              <Row label="Bank account">
                <Input defaultValue="Zanaco · •••• 4821" />
              </Row>
              <Row label="Scheduled payout day">
                <span className="text-sm font-medium text-ink">Every Friday</span>
              </Row>
              <Row label="Payout details">
                <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
                  Edit payout details
                </button>
              </Row>
            </>
          )}

          {tab === "Subscription" && (
            <Row label="Current plan" desc="Renews 1 Sep 2026.">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-ink">Starter</span>
                <button type="button" className="rounded-lg bg-brand px-4 py-2 text-xs font-medium text-paper">
                  Upgrade
                </button>
              </div>
            </Row>
          )}

          {tab === "Account" && (
            <>
              <Row label="Email address">
                <Input defaultValue="landlord@kabulongahouse.co.zm" type="email" />
              </Row>
              <Row label="Password">
                <button type="button" className="text-sm font-medium text-brand hover:underline">
                  Change password
                </button>
              </Row>
              <Row label="Sign out" desc="You'll need to sign in again on this device.">
                <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
                  Sign out
                </button>
              </Row>
            </>
          )}
        </div>
      </div>
    </>
  );
}
