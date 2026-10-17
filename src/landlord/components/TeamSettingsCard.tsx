import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../AuthContext";
import { useAccess } from "../AccessContext";
import { useToast } from "../ToastContext";
import { PERMISSION_GROUPS, PAYOUT_PERMISSIONS, PAYOUT_PERMISSION_LABELS, PAYOUT_CONFIRM_PERMISSIONS, ALERT_PERMISSIONS, ALERT_PERMISSION_LABELS, ROLE_LABELS, type Permission } from "../permissions";
import Modal from "./Modal";
import PlatformButton from "./Button";
import PlatformSelect from "./Select";
import SearchInput from "./SearchInput";
import { TableCard, TableCardHeader, DataTable, DataTableHead, DataTableBody, Th, Td, StatusPill, TableEmptyState } from "./DataTable";
import { CaretDown, Copy, DotsThreeVertical, UsersThree } from "@phosphor-icons/react";

type MemberRow = {
  id: string;
  user_id: string | null;
  invited_email: string;
  invited_phone: string | null;
  notification_phone: string | null;
  role: string;
  permissions: string[];
  status: string;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  invite_expires_at: string | null;
  fullName: string | null;
};

type Seats = { plan: string; max: number | null; used: number };

type ListResponse = { ok: boolean; members: MemberRow[]; seats: Seats; isOwner: boolean };

/** Finance officer is owner-only to assign — the server also enforces this, this is just so a
 * delegated (non-owner) inviter never sees a role they can't actually grant. */
function assignableRoles(canAssignFinanceOfficer: boolean): { value: string; label: string; disabled?: boolean }[] {
  return [
    { value: "manager", label: "Manager" },
    { value: "viewer", label: "Viewer" },
    {
      value: "finance_officer",
      label: canAssignFinanceOfficer ? "Finance officer" : "Finance officer — owner only",
      disabled: !canAssignFinanceOfficer,
    },
  ];
}

const roleFilterOptions = [
  { value: "all", label: "Role: All" },
  { value: "manager", label: "Manager" },
  { value: "viewer", label: "Viewer" },
  { value: "finance_officer", label: "Finance officer" },
];

const fieldCls =
  "w-full rounded-lg border-none bg-mist px-3.5 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-brand/30";

function daysUntil(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const d = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (d <= 0) return "Expired";
  return `Expires in ${d} day${d === 1 ? "" : "s"}`;
}

function initials(name: string): string {
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

async function readFunctionError(error: unknown): Promise<string> {
  // supabase-js throws FunctionsHttpError whose `.context` is the raw Response.
  const err = error as { context?: Response; message?: string } | null;
  if (err?.context && typeof err.context.json === "function") {
    try {
      const body = await err.context.json();
      if (body?.error) return body.error as string;
    } catch {
      // fall through
    }
  }
  return err?.message || "Something went wrong, please try again.";
}

/** Plain checkbox matching the native-checkbox convention used elsewhere in the dashboard
 * (e.g. StaffEmployees.tsx's "Show inactive" toggle) rather than a component-library control. */
function PlainCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-line text-brand accent-(--brand) disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

/** Shared role and permission checklist used by both the invite and edit access modes. */
function PermissionChecklist({
  role,
  checked,
  onToggle,
  canInvite,
  onToggleCanInvite,
  showCanInvite,
  restrictTo,
}: {
  role: string;
  checked: Set<Permission>;
  onToggle: (p: Permission, v: boolean) => void;
  canInvite: boolean;
  onToggleCanInvite: (v: boolean) => void;
  showCanInvite: boolean;
  /** When set (delegated, non-owner inviter), only these permissions can be ticked at all. */
  restrictTo: Set<string> | null;
}) {
  return (
    <div className="space-y-3">
      <div className="divide-y divide-line/60 rounded-lg border border-line">
        {PERMISSION_GROUPS.map((g) => {
          const viewLocked = !!restrictTo && !restrictTo.has(g.view);
          const manageLocked = !!restrictTo && g.manage && !restrictTo.has(g.manage);
          return (
            <div key={g.view} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <p className="min-w-0 flex-1 text-[13px] text-ink">{g.label}</p>
              <div className="flex shrink-0 items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <PlainCheckbox checked={checked.has(g.view)} disabled={viewLocked} onChange={(v) => onToggle(g.view, v)} />
                  View
                </label>
                {g.manage ? (
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <PlainCheckbox
                      checked={checked.has(g.manage)}
                      disabled={!!manageLocked}
                      onChange={(v) => onToggle(g.manage as Permission, v)}
                    />
                    Manage
                  </label>
                ) : (
                  <span className="w-[62px]" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showCanInvite && (
        <label className="flex items-center gap-2 rounded-lg bg-mist px-3.5 py-2.5 text-[13px] text-ink">
          <PlainCheckbox checked={canInvite} onChange={onToggleCanInvite} />
          Can invite others
        </label>
      )}

      <div className="space-y-1.5 rounded-lg border border-line px-3.5 py-2.5">
        <p className="text-[12px] font-medium text-ink">Payouts</p>
        <div className="space-y-2">
          {PAYOUT_PERMISSIONS.map((p) => {
            const locked = !!restrictTo && !restrictTo.has(p);
            return (
              <label key={p} className="flex items-start gap-2 text-xs text-muted">
                <PlainCheckbox checked={checked.has(p)} disabled={locked} onChange={(v) => onToggle(p, v)} />
                <span>{PAYOUT_PERMISSION_LABELS[p]}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5 rounded-lg border border-line px-3.5 py-2.5">
        <p className="text-[12px] font-medium text-ink">Alerts</p>
        <div className="space-y-2">
          {ALERT_PERMISSIONS.map((p) => {
            const locked = !!restrictTo && !restrictTo.has(p);
            const info = ALERT_PERMISSION_LABELS[p];
            return (
              <label key={p} className="flex items-start gap-2 text-xs text-muted">
                <PlainCheckbox checked={checked.has(p)} disabled={locked} onChange={(v) => onToggle(p, v)} />
                <span>
                  <span className="text-ink">{info.label}</span>
                  <br />
                  {info.helper}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted">Role: {ROLE_LABELS[role] ?? role}</p>
    </div>
  );
}

function DevLinkBox({ link }: { link: string }) {
  const { showToast } = useToast();
  return (
    <div className="flex items-center gap-2 rounded-lg bg-mist px-3 py-2">
      <p className="min-w-0 flex-1 truncate text-xs text-muted">{link}</p>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(link).catch(() => {});
          showToast("Link copied", "success");
        }}
        aria-label="Copy link"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
      >
        <Copy size={14} />
      </button>
    </div>
  );
}

/** "Phone for texts" field shown on a member row or in the edit-access panel. Saves through the
 * `set-notification-phone` edge function, which is the only way this column may be written.
 * Owner may pass any `memberId`; a member may only pass their own (or omit it to mean "myself").
 * Omitting `memberId` entirely (owner editing their OWN alert number) updates the existing
 * `settings.notification_phone` instead — see TeamSettingsCard usage below for that case. */
function PhoneForTextsField({
  propertyId,
  memberId,
  phone,
  hasAlertsOperations,
  onSaved,
}: {
  propertyId: string;
  memberId: string | null;
  phone: string | null;
  hasAlertsOperations: boolean;
  onSaved: (phone: string | null) => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { propertyId, phone: value.trim() };
      if (memberId) body.memberId = memberId;
      const { data, error } = await supabase.functions.invoke("set-notification-phone", { body });
      if (error) throw error;
      const resp = data as { ok?: boolean; testSent?: boolean; error?: string };
      if (resp?.error) {
        showToast(resp.error, "error");
        return;
      }
      onSaved(value.trim() || null);
      setEditing(false);
      if (!value.trim()) {
        showToast("Saved", "success");
      } else if (resp?.testSent === false) {
        showToast("Saved, but the test text did not send. Check the number.", "error");
      } else {
        showToast(`Saved. We sent a test text to ${value.trim()}`, "success");
      }
    } catch (e) {
      showToast(await readFunctionError(e), "error");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="097 123 4567"
          autoFocus
          className="w-32 rounded-md border-none bg-mist px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-brand/30"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="text-[11px] font-medium text-brand hover:underline disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(phone ?? "");
          }}
          disabled={saving}
          className="text-[11px] text-muted hover:underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button type="button" onClick={() => setEditing(true)} className="text-left text-[12px] text-ink hover:underline">
        {phone || <span className="text-muted">Not set</span>}
      </button>
      {hasAlertsOperations && !phone && (
        <span className="text-[11px] text-amber-700">No phone yet, so they will not get texts.</span>
      )}
    </div>
  );
}

/** Invite / edit-access modal — same shared Modal every other dialog in the app is built on. */
function InviteOrEditModal({
  mode,
  member,
  onClose,
  onDone,
  isOwner,
  myPermissions,
}: {
  mode: "invite" | "edit";
  member: MemberRow | null;
  onClose: () => void;
  onDone: () => void;
  isOwner: boolean;
  myPermissions: string[];
}) {
  const { active } = useAccess();
  const { showToast } = useToast();
  const [email, setEmail] = useState(member?.invited_email ?? "");
  const [phone, setPhone] = useState(member?.invited_phone ?? "");
  const [role, setRole] = useState(member?.role ?? "manager");
  const [checked, setChecked] = useState<Set<Permission>>(
    new Set((member?.permissions ?? []).filter((p) => p !== "team.invite") as Permission[]),
  );
  const [canInvite, setCanInvite] = useState<boolean>((member?.permissions ?? []).includes("team.invite"));
  const [submitting, setSubmitting] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<{ nextRole: string } | null>(null);
  const [confirmMoneyPerm, setConfirmMoneyPerm] = useState<Permission | null>(null);

  const restrictTo = isOwner ? null : new Set(myPermissions);

  const applyRoleDefaults = useCallback(async (r: string) => {
    // `role_permissions` isn't in the generated Supabase types yet (new table), so cast through `any`.
    const { data, error } = await (supabase as any)
      .from("role_permissions")
      .select("role, permission")
      .eq("role", r);
    if (error) {
      console.error("[TeamSettingsCard] role_permissions fetch failed", error.message);
      return;
    }
    const next = new Set<Permission>((data ?? []).map((row: { permission: string }) => row.permission as Permission));
    setChecked(next);
  }, []);

  // Invite mode: ticks follow the role's defaults. Edit mode: keep the member's saved ticks
  // and only reset when the owner confirms (see onRoleChange).
  useEffect(() => {
    if (mode === "invite") void applyRoleDefaults(role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, mode]);

  const applyToggle = (p: Permission, v: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (v) next.add(p);
      else next.delete(p);
      return next;
    });
  };

  // Ticking on either money permission moves money or changes where it goes — confirm first.
  // Unticking, or ticking any other permission, applies immediately.
  const toggle = (p: Permission, v: boolean) => {
    if (v && PAYOUT_CONFIRM_PERMISSIONS.has(p)) {
      setConfirmMoneyPerm(p);
      return;
    }
    applyToggle(p, v);
  };

  const permissionsArray = useCallback((): string[] => {
    const arr = Array.from(checked) as string[];
    if (canInvite) arr.push("team.invite");
    return Array.from(new Set(arr));
  }, [checked, canInvite]);

  const submit = async () => {
    if (!active) return;
    setSubmitting(true);
    try {
      if (mode === "invite") {
        const { data, error } = await supabase.functions.invoke("invite-team-member", {
          body: { propertyId: active.property_id, email: email.trim(), phone: phone.trim() || undefined, role, permissions: permissionsArray() },
        });
        if (error) throw error;
        const resp = data as { ok: boolean; memberId: string; devLink?: string };
        if (resp.devLink) {
          setDevLink(resp.devLink);
          showToast("Invite created", "success");
          return;
        }
        showToast("Invite sent", "success");
        onDone();
      } else if (member) {
        const body: Record<string, unknown> = {
          action: "update",
          propertyId: active.property_id,
          memberId: member.id,
          permissions: permissionsArray(),
        };
        if (role !== member.role) body.role = role;
        const { error } = await supabase.functions.invoke("manage-team-member", { body });
        if (error) throw error;
        showToast("Access updated", "success");
        onDone();
      }
    } catch (e) {
      showToast(await readFunctionError(e), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const onRoleChange = (next: string) => {
    setRole(next);
    if (mode === "edit" && member && next !== member.role) {
      setConfirmReset({ nextRole: next });
    } else {
      setConfirmReset(null);
    }
  };

  return (
    <Modal
      onClose={() => !submitting && onClose()}
      title={mode === "invite" ? "Invite a team member" : "Edit access"}
      description={
        mode === "invite"
          ? "They'll get a link to join this property with the role and permissions below."
          : `Change ${member?.fullName ?? member?.invited_email}'s role or permissions.`
      }
      maxWidth="lg"
      footer={
        devLink ? (
          <div className="flex justify-end">
            <PlatformButton type="button" variant="primary" onClick={onDone}>
              Done
            </PlatformButton>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <PlatformButton type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </PlatformButton>
            <PlatformButton
              type="button"
              variant="primary"
              onClick={() => void submit()}
              disabled={submitting || (mode === "invite" && !email.trim())}
            >
              {submitting ? "Saving…" : mode === "invite" ? "Send invite" : "Save changes"}
            </PlatformButton>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {mode === "invite" && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={fieldCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Phone number (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="097 xxx xxxx"
                className={fieldCls}
              />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted">Role</label>
          <PlatformSelect value={role} onChange={onRoleChange} options={assignableRoles(isOwner)} className="w-full" />
        </div>

        {confirmMoneyPerm && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
            <p className="font-medium">
              This person will be able to move money out of {active?.property_name ?? "this property"}. You will be emailed every payout. Continue?
            </p>
            <div className="mt-2 flex gap-2">
              <PlatformButton type="button" size="sm" variant="outline" onClick={() => setConfirmMoneyPerm(null)}>
                Cancel
              </PlatformButton>
              <PlatformButton
                type="button"
                size="sm"
                variant="primary"
                onClick={() => {
                  applyToggle(confirmMoneyPerm, true);
                  setConfirmMoneyPerm(null);
                }}
              >
                Continue
              </PlatformButton>
            </div>
          </div>
        )}

        {confirmReset && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
            <p className="font-medium">
              Reset access to {ROLE_LABELS[confirmReset.nextRole] ?? confirmReset.nextRole} defaults?
            </p>
            <div className="mt-2 flex gap-2">
              <PlatformButton type="button" size="sm" variant="outline" onClick={() => setConfirmReset(null)}>
                No, keep current ticks
              </PlatformButton>
              <PlatformButton
                type="button"
                size="sm"
                variant="primary"
                onClick={() => {
                  void applyRoleDefaults(confirmReset.nextRole);
                  setConfirmReset(null);
                }}
              >
                Yes, reset
              </PlatformButton>
            </div>
          </div>
        )}

        <PermissionChecklist
          role={role}
          checked={checked}
          onToggle={toggle}
          canInvite={canInvite}
          onToggleCanInvite={setCanInvite}
          showCanInvite={isOwner}
          restrictTo={restrictTo}
        />

        {mode === "edit" && member && checked.has("alerts.operations") && active && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Phone for texts</label>
            <PhoneForTextsField
              propertyId={active.property_id}
              memberId={member.id}
              phone={member.notification_phone}
              hasAlertsOperations
              onSaved={() => {}}
            />
          </div>
        )}

        {devLink && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted">Email isn't configured yet. Share this link directly.</p>
            <DevLinkBox link={devLink} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      onClose={() => !busy && onClose()}
      title={title}
      maxWidth="xs"
      footer={
        <div className="flex justify-end gap-2">
          <PlatformButton type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </PlatformButton>
          <PlatformButton
            type="button"
            variant={destructive ? "dangerSolid" : "primary"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </PlatformButton>
        </div>
      }
    >
      <p className="text-sm text-muted">{description}</p>
    </Modal>
  );
}

/** The Team page body: toolbar, member list, invite modal, and per-row actions.
 * Visible to the owner or anyone holding `team.invite`; gated by the caller. */
export default function TeamSettingsCard() {
  const { active, isOwner } = useAccess();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [seats, setSeats] = useState<Seats | null>(null);
  const [showFormer, setShowFormer] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMember, setEditMember] = useState<MemberRow | null>(null);
  const [resendTarget, setResendTarget] = useState<MemberRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
  const [resendDevLink, setResendDevLink] = useState<string | null>(null);

  const myPermissions = active?.permissions ?? [];
  const canInvite = isOwner || myPermissions.includes("team.invite") || myPermissions.includes("*");

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-team-member", {
        body: { action: "list", propertyId: active.property_id },
      });
      if (error) throw error;
      const resp = data as ListResponse;
      setMembers(resp.members ?? []);
      setSeats(resp.seats ?? null);
    } catch (e) {
      showToast(await readFunctionError(e), "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.property_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeMembers = useMemo(() => members.filter((m) => m.status !== "revoked"), [members]);
  const formerMembers = useMemo(() => members.filter((m) => m.status === "revoked"), [members]);

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeMembers.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (!q) return true;
      return `${m.fullName ?? ""} ${m.invited_email}`.toLowerCase().includes(q);
    });
  }, [activeMembers, query, roleFilter]);

  const canActOn = (m: MemberRow) => isOwner || m.invited_by === user?.id;

  const doResend = async (m: MemberRow) => {
    if (!active) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-team-member", {
        body: { action: "resend", propertyId: active.property_id, memberId: m.id },
      });
      if (error) throw error;
      const resp = data as { ok: boolean; devLink?: string };
      if (resp.devLink) {
        setResendDevLink(resp.devLink);
      } else {
        showToast("Invite resent", "success");
        setResendTarget(null);
      }
    } catch (e) {
      showToast(await readFunctionError(e), "error");
      setResendTarget(null);
    }
  };

  const doRevoke = async (m: MemberRow) => {
    if (!active) return;
    try {
      const { error } = await supabase.functions.invoke("manage-team-member", {
        body: { action: "revoke", propertyId: active.property_id, memberId: m.id },
      });
      if (error) throw error;
      showToast("Member removed", "success");
      setRemoveTarget(null);
      void load();
    } catch (e) {
      showToast(await readFunctionError(e), "error");
      setRemoveTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <TableCard>
        <TableCardHeader>
          <p className="text-sm font-semibold text-ink">
            Members
            {!loading && <span className="ml-2 text-xs font-medium text-muted">{activeMembers.length}</span>}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search members" className="w-full sm:w-64" />
            <PlatformSelect value={roleFilter} onChange={setRoleFilter} options={roleFilterOptions} className="min-w-37.5" />
            {canInvite && (
              <PlatformButton type="button" variant="primary" onClick={() => setInviteOpen(true)}>
                Add team member
              </PlatformButton>
            )}
          </div>
        </TableCardHeader>

        {seats?.max != null && (
          <p className="border-b border-line px-4 py-2 text-xs text-muted">
            {seats.used} of {seats.max} seats used · Viewers are free
          </p>
        )}

        <div className="hidden md:block">
          <DataTable>
            <DataTableHead>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Phone for texts</Th>
              <Th align="right" className="w-14">
                Actions
              </Th>
            </DataTableHead>
            <DataTableBody>
              {loading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <Td colSpan={5}>
                      <div className="h-4 w-full animate-pulse rounded bg-mist" />
                    </Td>
                  </tr>
                ))}

              {!loading &&
                visibleMembers.map((m) => {
                  const label = m.fullName ?? m.invited_email;
                  const expiry = m.status === "invited" ? daysUntil(m.invite_expires_at) : null;
                  const isMe = !!m.user_id && m.user_id === user?.id;
                  return (
                    <tr key={m.id} className="relative">
                      <Td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist text-xs font-medium text-ink">
                            {initials(label)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[13px] font-medium text-ink">{label}</p>
                              {isMe && <StatusPill tone="neutral">You</StatusPill>}
                              {expiry && <span className="text-[11px] text-muted">{expiry}</span>}
                            </div>
                            {m.fullName && <p className="mt-0.5 truncate text-xs text-muted">{m.invited_email}</p>}
                            {m.invited_phone && <p className="mt-0.5 truncate text-xs text-muted">{m.invited_phone}</p>}
                          </div>
                        </div>
                      </Td>
                      <Td>{ROLE_LABELS[m.role] ?? m.role}</Td>
                      <Td>
                        <StatusPill tone={m.status === "invited" ? "warning" : "success"}>
                          {m.status === "invited" ? "Invited" : "Active"}
                        </StatusPill>
                      </Td>
                      <Td>
                        {active && (isOwner || isMe) ? (
                          <PhoneForTextsField
                            propertyId={active.property_id}
                            memberId={m.id}
                            phone={m.notification_phone}
                            hasAlertsOperations={m.permissions.includes("alerts.operations")}
                            onSaved={(phone) =>
                              setMembers((prev) => prev.map((row) => (row.id === m.id ? { ...row, notification_phone: phone } : row)))
                            }
                          />
                        ) : (
                          <span className="text-[12px] text-muted">{m.notification_phone || "Not set"}</span>
                        )}
                      </Td>
                      <Td align="right" className="relative">
                        {canActOn(m) && !isMe && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionId((id) => (id === m.id ? null : m.id));
                              }}
                              aria-label="Member actions"
                              className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
                            >
                              <DotsThreeVertical size={18} weight="bold" />
                            </button>
                            {openActionId === m.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-4 top-10 z-20 w-44 rounded-lg border border-line bg-paper p-1.5 text-left shadow-card"
                              >
                                {isOwner && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionId(null);
                                      setEditMember(m);
                                    }}
                                    className="w-full rounded-md px-2.5 py-2 text-left text-xs text-ink hover:bg-mist"
                                  >
                                    Edit access
                                  </button>
                                )}
                                {m.status === "invited" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionId(null);
                                      setResendTarget(m);
                                    }}
                                    className="w-full rounded-md px-2.5 py-2 text-left text-xs text-ink hover:bg-mist"
                                  >
                                    Resend
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    setRemoveTarget(m);
                                  }}
                                  className="w-full rounded-md px-2.5 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </Td>
                    </tr>
                  );
                })}

              {!loading && visibleMembers.length === 0 && (
                <TableEmptyState
                  colSpan={5}
                  icon={<UsersThree size={18} weight="duotone" />}
                  title={activeMembers.length === 0 ? "No team members yet" : "No members match your search"}
                  description={activeMembers.length === 0 ? "Add your first teammate to get started." : "Try a different search or filter."}
                />
              )}
            </DataTableBody>
          </DataTable>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-line md:hidden">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-mist" />
              </div>
            ))}
          {!loading &&
            visibleMembers.map((m) => {
              const label = m.fullName ?? m.invited_email;
              const isMe = !!m.user_id && m.user_id === user?.id;
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-xs font-medium text-ink">
                    {initials(label)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {label} {isMe && <span className="text-xs text-muted">(You)</span>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {ROLE_LABELS[m.role] ?? m.role}
                      {m.invited_phone ? ` · ${m.invited_phone}` : ""}
                    </p>
                    {active && (isOwner || isMe) ? (
                      <div className="mt-1">
                        <PhoneForTextsField
                          propertyId={active.property_id}
                          memberId={m.id}
                          phone={m.notification_phone}
                          hasAlertsOperations={m.permissions.includes("alerts.operations")}
                          onSaved={(phone) =>
                            setMembers((prev) => prev.map((row) => (row.id === m.id ? { ...row, notification_phone: phone } : row)))
                          }
                        />
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-muted">Texts: {m.notification_phone || "Not set"}</p>
                    )}
                  </div>
                  <StatusPill tone={m.status === "invited" ? "warning" : "success"}>
                    {m.status === "invited" ? "Invited" : "Active"}
                  </StatusPill>
                  {canActOn(m) && !isMe && (
                    <button
                      type="button"
                      onClick={() => setOpenActionId((id) => (id === m.id ? null : m.id))}
                      aria-label="Member actions"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink"
                    >
                      <DotsThreeVertical size={18} weight="bold" />
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </TableCard>

      {formerMembers.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowFormer((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            <CaretDown size={12} weight="bold" className={`transition-transform ${showFormer ? "rotate-180" : ""}`} />
            Former members ({formerMembers.length})
          </button>
          {showFormer && (
            <div className="mt-2 divide-y divide-line/60 rounded-lg border border-line opacity-70">
              {formerMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <p className="truncate text-[13px] text-ink">{m.fullName ?? m.invited_email}</p>
                  <StatusPill tone="neutral">Removed</StatusPill>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {inviteOpen && (
        <InviteOrEditModal
          mode="invite"
          member={null}
          isOwner={isOwner}
          myPermissions={myPermissions}
          onClose={() => setInviteOpen(false)}
          onDone={() => {
            setInviteOpen(false);
            void load();
          }}
        />
      )}

      {editMember && (
        <InviteOrEditModal
          mode="edit"
          member={editMember}
          isOwner={isOwner}
          myPermissions={myPermissions}
          onClose={() => setEditMember(null)}
          onDone={() => {
            setEditMember(null);
            void load();
          }}
        />
      )}

      {resendTarget && !resendDevLink && (
        <ConfirmModal
          title="Resend invite?"
          description={`Send a new invite link to ${resendTarget.invited_email}.`}
          confirmLabel="Resend"
          onConfirm={() => doResend(resendTarget)}
          onClose={() => setResendTarget(null)}
        />
      )}

      {resendTarget && resendDevLink && (
        <Modal
          onClose={() => {
            setResendTarget(null);
            setResendDevLink(null);
          }}
          title="Invite resent"
          description="Email isn't configured yet. Share this link directly."
          maxWidth="xs"
          footer={
            <div className="flex justify-end">
              <PlatformButton
                type="button"
                variant="primary"
                onClick={() => {
                  setResendTarget(null);
                  setResendDevLink(null);
                }}
              >
                Done
              </PlatformButton>
            </div>
          }
        >
          <DevLinkBox link={resendDevLink} />
        </Modal>
      )}

      {removeTarget && (
        <ConfirmModal
          title="Remove team member?"
          description={`${removeTarget.fullName ?? removeTarget.invited_email} will lose access to this property immediately.`}
          confirmLabel="Remove"
          destructive
          onConfirm={() => doRevoke(removeTarget)}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
