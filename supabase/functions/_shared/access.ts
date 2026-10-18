import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

export type Caller = { id: string; email?: string; user_metadata?: Record<string, unknown> };

// deno-lint-ignore no-explicit-any
export async function getCaller(req: Request, admin: any): Promise<Caller | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user as Caller;
}

export type PayoutAccess = {
  prop: { id: string; name: string; owner_id: string };
  isOwner: boolean;
  allowed: boolean;
  perms: string[];
};

// deno-lint-ignore no-explicit-any
export async function getPayoutAccess(admin: any, propertyId: string, user: { id: string }, anyOf: string[]): Promise<PayoutAccess | null> {
  const { data: prop } = await admin.from('properties').select('id,name,owner_id').eq('id', propertyId).maybeSingle();
  if (!prop) return null;
  if (prop.owner_id === user.id) return { prop, isOwner: true, allowed: true, perms: [] };
  const { data: member } = await admin.from('team_members').select('permissions')
    .eq('property_id', propertyId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (!member) return null;
  const perms: string[] = member.permissions ?? [];
  return { prop, isOwner: false, allowed: anyOf.some((p) => perms.includes(p)), perms };
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
