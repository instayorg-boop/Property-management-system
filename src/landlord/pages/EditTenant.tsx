import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { DeviceMobile, Money, Bank, X, Plus } from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";
import {
  useTenants,
  formatCurrency,
  RELATION_OPTIONS,
  type DepositMethod,
  type EmergencyContact,
  type RelationType,
} from "../TenantsContext";

/** A working copy of an emergency contact while the form is open — `relationOther` is always a
 * string here (never undefined) so the "Other" text input can stay a controlled input. */
type ContactDraft = {
  id: string;
  name: string;
  relation: RelationType;
  relationOther: string;
  phones: string[];
};

function newContactId() {
  return `ec${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

function newContactDraft(): ContactDraft {
  return { id: newContactId(), name: "", relation: "Guardian", relationOther: "", phones: [""] };
}

function toContactDrafts(contacts: EmergencyContact[]): ContactDraft[] {
  return contacts.map((c) => ({ ...c, relationOther: c.relationOther ?? "", phones: c.phones.length ? c.phones : [""] }));
}

function cleanContacts(drafts: ContactDraft[]): EmergencyContact[] {
  return drafts
    .map((c) => ({
      id: c.id,
      name: c.name.trim(),
      relation: c.relation,
      relationOther: c.relation === "Other" ? c.relationOther.trim() : undefined,
      phones: c.phones.map((p) => p.trim()).filter(Boolean),
    }))
    .filter((c) => c.name || c.phones.length > 0);
}

// Same visual language as AddTenant.tsx — rounded-lg bordered inputs, brand-blue focus rings,
// thin gray dividers.
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
    </div>
  );
}

function Divider() {
  return <hr className="my-8 border-t border-line" />;
}

const inputCls =
  "w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink placeholder-muted/70 outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const labelCls = "mb-1.5 block text-xs font-medium text-muted";

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        selected ? "bg-brand text-white" : "bg-mist text-muted hover:bg-line hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function PhoneListEditor({ phones, onChange }: { phones: string[]; onChange: (phones: string[]) => void }) {
  return (
    <div className="space-y-2">
      {phones.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={p}
            onChange={(e) => {
              const next = [...phones];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder="e.g. 0977 123 456"
            className={`flex-1 ${inputCls}`}
          />
          {phones.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(phones.filter((_, idx) => idx !== i))}
              aria-label="Remove number"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-red-600"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...phones, ""])}
        className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <Plus size={14} weight="bold" />
        Add another number
      </button>
    </div>
  );
}

const depositMethods: { id: DepositMethod; label: string; Icon: typeof Money }[] = [
  { id: "mobile", label: "Mobile money", Icon: DeviceMobile },
  { id: "cash", label: "Cash", Icon: Money },
  { id: "bank", label: "Bank transfer", Icon: Bank },
];

/** Full-page "Edit tenant" form — the same reading order and visual language as Add Tenant, but
 * scoped to what an existing tenant record actually needs correcting (room/deposit terms,
 * personal info, emergency contacts, notes). Room assignment itself isn't editable here — that's
 * a move, not an edit, and goes through the Rooms page instead. */
export default function EditTenant() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenants, updateTenant, isReady } = useTenants();
  const tenant = tenants.find((t) => t.id === id) ?? null;

  const [name, setName] = useState(tenant?.name ?? "");
  const [phones, setPhones] = useState<string[]>(tenant?.phones.length ? tenant.phones : [""]);
  const [contacts, setContacts] = useState<ContactDraft[]>(toContactDrafts(tenant?.emergencyContacts ?? []));
  const [depositAmount, setDepositAmount] = useState(tenant?.depositAmount ?? 0);
  const [depositDate, setDepositDate] = useState(tenant?.depositDate ?? "");
  const [depositMethod, setDepositMethod] = useState<DepositMethod>(tenant?.depositMethod ?? "mobile");
  const [notes, setNotes] = useState(tenant?.notes ?? "");

  const updateContact = (index: number, patch: Partial<ContactDraft>) => {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };
  const removeContact = (index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isReady) return null;

  if (!tenant) {
    return (
      <>
        <PageHeader title="Tenant not found" />
        <div className="px-4 sm:px-8">
          <p className="text-sm text-muted">They may have been deleted, or the link is out of date.</p>
          <Link to="/tenants" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
            Back to tenants
          </Link>
        </div>
      </>
    );
  }

  const canSubmit = name.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    updateTenant(tenant.id, {
      name,
      phones: phones.map((p) => p.trim()).filter(Boolean),
      emergencyContacts: cleanContacts(contacts),
      depositAmount,
      depositDate,
      depositMethod,
      notes,
    });
    navigate(`/tenants/${tenant.id}`);
  };

  return (
    <>
      <PageHeader title="Edit tenant" description={`${tenant.name} · ${tenant.room || "Unassigned"}`} />

      <div className="mx-auto max-w-2xl px-4 pb-28 sm:px-8">
        <section>
          <SectionTitle title="Room & rent" subtitle="Room assignment is changed from the Rooms page, not here." />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-mist px-3.5 py-2.5 text-sm sm:col-span-2">
              <span className="text-muted">
                Room: <span className="font-medium text-ink">{tenant.room || "Unassigned"}</span> ({tenant.roomType || "—"})
              </span>
              <Link to="/rooms" className="shrink-0 text-xs font-medium text-brand hover:underline">
                Change room →
              </Link>
            </div>
            <div>
              <label className={labelCls}>Agreed rent</label>
              <div className="flex h-10.5 items-center rounded-lg bg-mist px-3 text-sm text-muted">
                {formatCurrency(tenant.rentAmount)}/mo
              </div>
            </div>
            <div>
              <label className={labelCls}>Security deposit (K)</label>
              <input
                type="number"
                min={0}
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Security deposit date</label>
              <DatePicker value={depositDate} onChange={setDepositDate} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Security deposit method</label>
              <div className="flex gap-2">
                {depositMethods.map(({ id: methodId, label, Icon }) => (
                  <Chip key={methodId} selected={depositMethod === methodId} onClick={() => setDepositMethod(methodId)}>
                    <Icon size={14} weight="duotone" />
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </section>

        <Divider />

        <section>
          <SectionTitle title="Personal information" />
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelCls}>Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone number(s)</label>
              <PhoneListEditor phones={phones} onChange={setPhones} />
            </div>
          </div>
        </section>

        <Divider />

        <section>
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">Emergency contact information</h3>
            <span className="text-xs text-muted">— optional</span>
          </div>
          {contacts.length === 0 ? (
            <button
              type="button"
              onClick={() => setContacts([newContactDraft()])}
              className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <Plus size={14} weight="bold" />
              Add emergency contact
            </button>
          ) : (
            <>
              <div className="divide-y divide-line">
                {contacts.map((contact, i) => (
                  <div key={contact.id} className={`space-y-3 py-4 ${i === 0 ? "pt-0" : ""}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted">{i === 0 ? "Primary contact" : `Contact ${i + 1}`}</p>
                      <button
                        type="button"
                        onClick={() => removeContact(i)}
                        aria-label="Remove contact"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-red-600"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelCls}>Name</label>
                        <input
                          value={contact.name}
                          onChange={(e) => updateContact(i, { name: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Relation to tenant</label>
                        <Select
                          value={contact.relation}
                          onChange={(v) => updateContact(i, { relation: v as RelationType })}
                          options={RELATION_OPTIONS.map((r) => ({ value: r, label: r }))}
                          className="w-full"
                        />
                        <AnimatePresence initial={false}>
                          {contact.relation === "Other" && (
                            <motion.div
                              key="other-relation"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                              className="overflow-hidden"
                            >
                              <input
                                value={contact.relationOther}
                                onChange={(e) => updateContact(i, { relationOther: e.target.value })}
                                placeholder="Specify relation"
                                className={`mt-2 ${inputCls}`}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Phone number(s)</label>
                      <PhoneListEditor phones={contact.phones} onChange={(next) => updateContact(i, { phones: next })} />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setContacts((prev) => [...prev, newContactDraft()])}
                className="mt-3 flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                <Plus size={14} weight="bold" />
                Add another emergency contact
              </button>
            </>
          )}
        </section>

        <Divider />

        <section>
          <h3 className="mb-3 text-base font-semibold text-ink">Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Payment arrangements, special circumstances, anything worth remembering about this tenant. Landlord-only."
            className={`resize-none ${inputCls}`}
          />
        </section>

        <div className="sticky bottom-0 z-30 -mx-4 mt-10 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)} className="flex-1 py-3 sm:flex-none sm:px-8">
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!canSubmit} className="flex-1 py-3">
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
