// Shared CORS headers for edge functions called directly from the browser
// (the app's own domain isn't fixed yet — no custom server, no known prod
// origin — so this stays permissive like the rest of the app's current
// pre-auth security posture. Tighten to a specific origin once the app has
// a fixed deployed URL.)
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
