// Shared helpers for the team functions: caller + property access, permission validation, seats,
// invite tokens, audit log. Every write to team_members goes through the service role from here.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import { sha256Hex, randomSessionToken } from './otpCrypto.ts';

export const ROLES = ['manager', 'finance_officer', 'viewer'];
export const ROLE_LABELS: Record<string, string> = {
  manager: 'Manager', finance_officer: 'Finance officer', viewer: 'Viewer',
};
export const INVITE_TTL_DAYS = 7;
export const EMAIL_RE = /^[^ @]+@[^ @]+[.][^ @]+$/;

// What an owner may tick. team.manage and billing.manage can never be granted (also enforced by a CHECK constraint).
export const GRANTABLE_PERMISSIONS = [
  'tenants.view', 'tenants.manage', 'rent.view', 'rent.collect', 'maintenance.view', 'maintenance.manage',
  'reports.view', 'expenses.view', 'expenses.manage', 'tasks.manage', 'assistant.use', 'notifications.view',
  'payroll.manage', 'audit.view', 'team.invite',
  'payouts.view', 'payouts.request', 'payout_methods.manage', 'alerts.receive', 'alerts.operations',
];
const NEVER_GRANTABLE = ['team.manage', 'billing.manage'];

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

// deno-lint-ignore no-explicit-any
export async function getCaller(req: Request, admin: any) {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user as { id: string; email?: string; user_metadata?: Record<string, unknown> };
}

export type Access = {
  prop: { id: string; name: string; owner_id: string };
  isOwner: boolean;
  perms: string[];
  // deno-lint-ignore no-explicit-any
  member: any;
};

// The caller's standing on a property, read live from the database (never from the token).
// deno-lint-ignore no-explicit-any
export async function getAccess(admin: any, propertyId: string, user: { id: string }): Promise<Access | null> {
  const { data: prop } = await admin.from('properties').select('id,name,owner_id').eq('id', propertyId).maybeSingle();
  if (!prop) return null;
  if (prop.owner_id === user.id) return { prop, isOwner: true, perms: [], member: null };
  const { data: member } = await admin.from('team_members').select('*')
    .eq('property_id', propertyId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (!member) return null;
  return { prop, isOwner: false, perms: member.permissions ?? [], member };
}

export function cleanPermissions(input: unknown): { ok: true; perms: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'permissions must be a list.' };
  const uniq = [...new Set(input.map(String))];
  for (const p of uniq) {
    if (NEVER_GRANTABLE.includes(p)) return { ok: false, error: `${p} can never be granted.` };
    if (!GRANTABLE_PERMISSIONS.includes(p)) return { ok: false, error: `Unknown permission: ${p}.` };
  }
  return { ok: true, perms: uniq };
}

// deno-lint-ignore no-explicit-any
export async function roleTemplate(admin: any, role: string): Promise<string[]> {
  const { data } = await admin.from('role_permissions').select('permission').eq('role', role);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => r.permission as string);
}

// Seats in use = invited + active non-viewers. max null = no limit configured for the plan.
// deno-lint-ignore no-explicit-any
export async function seatsInfo(admin: any, propertyId: string, excludeMemberId?: string) {
  const { data: settings } = await admin.from('settings').select('subscription_plan').eq('property_id', propertyId).maybeSingle();
  const plan: string = settings?.subscription_plan ?? 'Pro';
  const { data: limit } = await admin.from('plan_limits').select('max_team_seats').eq('plan', plan).maybeSingle();
  let q = admin.from('team_members').select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId).in('status', ['invited', 'active']).neq('role', 'viewer');
  if (excludeMemberId) q = q.neq('id', excludeMemberId);
  const { count } = await q;
  return { plan, max: (limit?.max_team_seats ?? null) as number | null, used: count ?? 0 };
}

export async function hashInviteToken(token: string): Promise<string> {
  return await sha256Hex(`invite:${token}`);
}

export async function newInviteToken(): Promise<{ token: string; hash: string }> {
  const token = randomSessionToken();
  return { token, hash: await hashInviteToken(token) };
}

export function inviteLink(token: string): string {
  const base = Deno.env.get('APP_URL') || 'https://portal.instayhomes.com';
  return `${base.replace(/[/]$/, '')}/accept-invite?token=${token}`;
}

export function personName(user: { email?: string; user_metadata?: Record<string, unknown> }, fallback?: string): string {
  const meta = user.user_metadata?.full_name;
  if (typeof meta === 'string' && meta.trim()) return meta.trim();
  if (fallback && fallback.trim()) return fallback.trim();
  return user.email ?? 'A teammate';
}

// deno-lint-ignore no-explicit-any
export async function writeAudit(admin: any, entry: Record<string, unknown>) {
  const { error } = await admin.from('audit_log').insert(entry);
  if (error) console.error('[audit_log] insert failed', error.message);
}
