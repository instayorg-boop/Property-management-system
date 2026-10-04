// Receiving end of the trg_classify_new_maintenance_report trigger (see
// 20261009030000_maintenance_ai_priority.sql) — fires on every new maintenance report, landlord-
// or tenant-filed alike, since priority is deliberately never a field either of them fills in at
// submission time. Classifies location+description into low/medium/high/urgent and patches the
// row. Leaves the column-default 'medium' in place (rather than failing the request) if the model
// call errors or returns something we can't parse — a wrong/missing priority is just something a
// landlord corrects by hand, not worth surfacing as an error to whoever filed the report.
//
// Deploy:  supabase functions deploy classify-maintenance-priority
// Invoke:  POST with header x-cron-secret: <CRON_SECRET>, body { reportId, location, description }
// (invoked by the DB trigger, not directly by the frontend)

import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

const PROMPT = `You triage maintenance requests for a residential rental property. Classify the
urgency of the request below as exactly one word: low, medium, high, or urgent.

Guidance:
- urgent: immediate safety/habitability risk or active damage (e.g. gas leak, fire hazard, flooding,
  burst pipe, no power/water, broken lock/door making the unit unsecured).
- high: significantly affects daily living but isn't an emergency (e.g. no hot water, broken
  fridge/stove, AC/heating failure, major leak that isn't actively flooding).
- medium: a real problem that can wait a few days (e.g. a dripping tap, a broken cabinet, a pest
  sighting, minor appliance fault).
- low: cosmetic or convenience issues with no functional impact (e.g. a scuff mark, a squeaky
  door, a loose tile).

Respond with only the single word — no punctuation, no explanation.`;

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { reportId?: string; location?: string; description?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { reportId, location, description } = body;
  if (!reportId) {
    return new Response(JSON.stringify({ error: "reportId is required" }), { status: 400 });
  }

  const priority = await classify(location ?? "", description ?? "");
  if (!priority) {
    // Model call failed or returned junk — the row keeps its 'medium' default, nothing to patch.
    return new Response(JSON.stringify({ ok: true, skipped: "classification_failed" }), { status: 200 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supabase.from("maintenance_reports").update({ priority }).eq("id", reportId);
  if (error) {
    console.error("Failed to patch maintenance_reports.priority", error);
    return new Response(JSON.stringify({ error: "Failed to save priority" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, priority }), { status: 200 });
});

async function classify(location: string, description: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: PROMPT }] },
          contents: [{ role: "user", parts: [{ text: `Location: ${location}\nDescription: ${description}` }] }],
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error("Gemini call failed", res.status, JSON.stringify(data));
      return null;
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
    const word = text?.trim().toLowerCase().replace(/[^a-z]/g, "");
    return word && VALID_PRIORITIES.has(word) ? word : null;
  } catch (e) {
    console.error("classify() threw", e);
    return null;
  }
}
