// Lets a tenant see their own documents (tenancy agreement, ID, acceptance letter, etc.) on the
// payment portal — read-only. This has to be an edge function rather than a plain SQL RPC because
// the tenant-documents bucket is private (see the tenant_documents migration): reading a file
// needs a signed URL minted with the service-role key, which only runs server-side here.
//
// Same trust boundary as everything else in the portal: pay_portal_verify_session checks the
// caller's portal_token (see the durable-token-session migration) before anything is returned.
//
// Deploy:  supabase functions deploy pay-portal-get-documents
// Invoke:  supabase.functions.invoke("pay-portal-get-documents", { body: { tenantId, sessionToken } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "./_shared/cors.ts";

const BUCKET = "tenant-documents";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type Payload = { tenantId?: string; sessionToken?: string };

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tenantId = payload.tenantId?.trim() ?? "";
  const sessionToken = payload.sessionToken?.trim() ?? "";
  if (!tenantId || !sessionToken) {
    return new Response(JSON.stringify({ error: "tenantId and sessionToken are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: verified, error: verifyError } = await supabase.rpc("pay_portal_verify_session", {
    p_tenant_id: tenantId,
    p_session_token: sessionToken,
  });
  if (verifyError || !verified) {
    return new Response(JSON.stringify({ error: "invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: docs, error: docsError } = await supabase
    .from("tenant_documents")
    .select("id, name, file_path, content_type, size_bytes, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (docsError) {
    return new Response(JSON.stringify({ error: "Failed to load documents" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!docs || docs.length === 0) {
    return new Response(JSON.stringify({ ok: true, documents: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      docs.map((d) => d.file_path),
      SIGNED_URL_TTL_SECONDS
    );
  if (signError) {
    return new Response(JSON.stringify({ error: "Failed to sign document URLs" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return new Response(
    JSON.stringify({
      ok: true,
      documents: docs.map((d) => ({
        id: d.id,
        name: d.name,
        contentType: d.content_type,
        sizeBytes: d.size_bytes,
        createdAt: d.created_at,
        url: urlByPath.get(d.file_path) ?? null,
      })),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
