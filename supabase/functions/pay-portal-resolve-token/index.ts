// Resolves a tenant's short SMS link (/p/:token) directly into a portal session — no OTP round
// trip. The token itself is the proof of identity: it's a 6-character, server-generated,
// unguessable code (~30 bits of entropy, drawn from a 32-symbol alphabet) that only ever reaches a
// tenant via a link their landlord sent them, the same trust boundary an OTP code sent by SMS
// already relies on. Requiring a second OTP on top of a token that arrived the same way (by SMS)
// would just be asking the tenant to prove their phone number twice.
//
// Deploy:  supabase functions deploy pay-portal-resolve-token
// Invoke:  supabase.functions.invoke("pay-portal-resolve-token", { body: { token } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex, randomSessionToken } from "../_shared/otpCrypto.ts";

const SESSION_TTL_MINUTES = 30;

type ResolveTokenPayload = { token?: string };

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: ResolveTokenPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = payload.token?.trim().toUpperCase() ?? "";
  if (!token) {
    return new Response(JSON.stringify({ error: "token is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, phone, phones, property_id, active, rooms(number), properties(slug)")
    .eq("portal_token", token)
    .maybeSingle();

  if (!tenant || !tenant.active) {
    return new Response(JSON.stringify({ error: "This link isn't valid anymore." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const propertySlug = (tenant.properties as { slug: string } | null)?.slug;
  if (!propertySlug) {
    return new Response(JSON.stringify({ error: "This link isn't valid anymore." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sessionToken = randomSessionToken();
  const tokenHash = await sha256Hex(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: sessionError } = await supabase
    .from("portal_sessions")
    .insert({ tenant_id: tenant.id, property_id: tenant.property_id, token_hash: tokenHash, expires_at: expiresAt });

  if (sessionError) {
    return new Response(JSON.stringify({ error: "Couldn't start a session. Try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const room = (tenant.rooms as { number: string } | null)?.number ?? null;

  return new Response(
    JSON.stringify({
      ok: true,
      propertySlug,
      tenantId: tenant.id,
      sessionToken,
      expiresAt,
      tenantName: tenant.name,
      room,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
