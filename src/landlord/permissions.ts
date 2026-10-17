/** Permission keys as defined by role_permissions / team_members.permissions in the database.
 * Keep in sync with supabase/migrations/20261017024515_team_members_phase1.sql. */
export type Permission =
  | "tenants.view" | "tenants.manage"
  | "rent.view" | "rent.collect"
  | "maintenance.view" | "maintenance.manage"
  | "reports.view"
  | "expenses.view" | "expenses.manage"
  | "tasks.manage"
  | "assistant.use"
  | "notifications.view"
  | "payroll.manage"
  | "audit.view"
  | "team.invite"
  | "payouts.view" | "payouts.request" | "payout_methods.manage" | "alerts.receive" | "alerts.operations";

/** The money permissions. Four independent ticks (not a view/manage pair), rendered as their own
 * "Payouts" group in the invite/edit checklist. Ticking `payouts.request` or `payout_methods.manage`
 * prompts a confirm first — see TeamSettingsCard.tsx. */
export const PAYOUT_PERMISSIONS = ["payouts.view", "payouts.request", "payout_methods.manage", "alerts.receive"] as const;

export const PAYOUT_PERMISSION_LABELS: Record<(typeof PAYOUT_PERMISSIONS)[number], string> = {
  "payouts.view": "See payouts and balance",
  "payouts.request": "Request payouts (code goes to their own email)",
  "payout_methods.manage": "Add, change and remove payout methods",
  "alerts.receive": "Get an email when money moves",
};

/** Ticking either of these moves money or changes where money goes — the invite/edit checklist
 * confirms before turning them on. */
export const PAYOUT_CONFIRM_PERMISSIONS = new Set<Permission>(["payouts.request", "payout_methods.manage"]);

/** Single-tick alert permission, rendered in its own "Alerts" group below the payout block.
 * Manager's role_permissions default already includes this — this just renders it from the
 * same `checked` set like the other ticks, same as PAYOUT_PERMISSIONS. */
export const ALERT_PERMISSIONS = ["alerts.operations"] as const;

export const ALERT_PERMISSION_LABELS: Record<(typeof ALERT_PERMISSIONS)[number], { label: string; helper: string }> = {
  "alerts.operations": {
    label: "Get texts for day-to-day work",
    helper: "Maintenance and tenant requests are texted to this person straight away.",
  },
};

export type PermissionGroup = {
  label: string;
  view: Permission;
  manage: Permission | null;
};

/** View/manage pairing used to build the invite/edit checklist and to gate nav + buttons. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  { label: "Tenants, rooms, room types, institutions, documents", view: "tenants.view", manage: "tenants.manage" },
  { label: "Rent, ledger, invoices, collections, reminders", view: "rent.view", manage: "rent.collect" },
  { label: "Maintenance", view: "maintenance.view", manage: "maintenance.manage" },
  { label: "Reports", view: "reports.view", manage: null },
  { label: "Expenses and categories", view: "expenses.view", manage: "expenses.manage" },
  { label: "Dashboard tasks and briefing", view: "tasks.manage", manage: null },
  { label: "AI assistant", view: "assistant.use", manage: null },
  { label: "Notification feed", view: "notifications.view", manage: null },
  { label: "Employees, clock entries, payroll", view: "payroll.manage", manage: null },
  { label: "Activity log", view: "audit.view", manage: null },
];

export const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  finance_officer: "Finance officer",
  viewer: "Viewer",
  owner: "Owner",
};
