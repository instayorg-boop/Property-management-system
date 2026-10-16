// supabase/functions/assistant-chat/index.ts
//
// Runs the read-only tool loop server-side so the model API key never
// reaches the client. Logs every turn to assistant_messages for audit,
// same table the frontend reads from. Replays prior turns from that same
// table so follow-up questions ("categorize those by X") have context —
// earlier versions sent only the latest prompt, which is why follow-ups
// silently failed before.

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-flash-lite-latest"; // alias -> gemini-3.5-flash-lite currently, auto-upgrades
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 6; // raised from 4 after a real compound question (list paid tenants + contact each) exhausted the cap

// Mirrors the RPCs created across ai_assistant_v1 and the follow-up fix migration.
// Keep this list in sync if you add more assistant_get_*/assistant_explain_*/assistant_find_* functions.
const TOOLS = [
  {
    name: "get_overdue_tenants",
    description:
      "Tenants currently overdue or unpaid (matches the app's own Overdue Rent report — partial payers are NOT included), with the real amount owed including accrued late penalty.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_collected_rent",
    description: "Current total rent collected across active tenants right now (a live snapshot, not scoped to a specific month).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_vacancy_summary",
    description: "Total, occupied, and vacant room counts for this property, plus a by_room_type breakdown array included automatically in every response — always mention it, don't just report the top-line total.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_room_types_summary",
    description: "Room counts broken down by room type: total, occupied, and vacant per type.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_expenses_summary",
    description: "Expenses for one month, grouped by category with a total and item count per category.",
    parameters: {
      type: "object",
      properties: { period: { type: "string", description: "YYYY-MM, e.g. 2026-09" } },
      required: ["period"],
    },
  },
  {
    name: "find_tenant",
    description: "Look up a tenant by name, phone number, room, or id — returns contact info (phone, phones, emergency contacts), room, status, and deposit amount/status. phone can be null even when a real number exists in phones — always check phones[0] before saying no number is on file. Use this before explain_tenant_balance if you only have a name.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Tenant name, phone number, room number, or exact tenant id — partial match ok" } },
      required: ["query"],
    },
  },
  {
    name: "explain_tenant_balance",
    description: "Ledger entry breakdown for a single tenant's current balance, including an affects_balance flag per row (false = audit-only, e.g. a waived penalty).",
    parameters: {
      type: "object",
      properties: { tenantId: { type: "string" } },
      required: ["tenantId"],
    },
  },
  {
    name: "get_maintenance_requests",
    description: "Maintenance/repair requests for this property, most recent first. Optionally filter by status.",
    parameters: {
      type: "object",
      properties: { status: { type: "string", description: "One of: open, in-progress, resolved. Omit for all." } },
      required: [],
    },
  },
  {
    name: "get_invoices",
    description: "Invoices issued for this property, most recently due first. Optionally filter by status.",
    parameters: {
      type: "object",
      properties: { status: { type: "string", description: "e.g. draft, sent, paid, overdue" } },
      required: [],
    },
  },
  {
    name: "get_payouts_summary",
    description: "Landlord's available Lenco balance (ready to withdraw) and the 5 most recent payout attempts.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_partial_tenants",
    description: "Tenants with a partial payment specifically (excluded from get_overdue_tenants on purpose, since the app's own Overdue Rent report excludes them too). Use this for 'who has partial payments' specifically.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_paid_tenants",
    description: "Tenants currently fully paid up, with contact info (phone, phones, emergency contacts, room) already included — use this instead of get_collected_rent plus a separate find_tenant lookup per tenant when asked for a list of who's paid, e.g. 'who's paid this month, give me their contacts'.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_payments",
    description: "Cross-tenant payment history (real payments only, not charges/adjustments), optionally filtered by method and/or date. Use for questions like 'what has X paid recently' across the property, or 'show all cash payments today'.",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string", description: "e.g. cash, mobile-money, bank-transfer" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: [],
    },
  },
  {
    name: "get_room_occupant",
    description: "Who is in a given room, or confirms it's vacant. Query by room number/label.",
    parameters: {
      type: "object",
      properties: { room: { type: "string", description: "Room number or label, e.g. '8' or 'Room 8'" } },
      required: ["room"],
    },
  },
  {
    name: "get_billing_settings",
    description: "Rent due day and grace period for this property (or a specific tenant, which may override the property default). Note: grace_period_days is stored but not currently enforced by any automation in the app — say so if asked which tenants are 'past the grace period', since there's no live logic that determines that yet.",
    parameters: {
      type: "object",
      properties: { tenantId: { type: "string", description: "Optional — check a specific tenant's override" } },
      required: [],
    },
  },
  {
    name: "get_collected_rent_by_method",
    description: "Collected rent broken down by payment method (cash vs mobile money vs bank transfer). Totals match get_collected_rent exactly. Method will show as 'Not recorded' for entries where no method was logged.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_charges",
    description: "Real charges put on a tenant's account (damage, fees, etc.) — excludes waived penalties, which are a separate adjustment type, not a charge. Optionally filter by tenant name.",
    parameters: {
      type: "object",
      properties: { tenant: { type: "string", description: "Optional tenant name to filter to" } },
      required: [],
    },
  },
  {
    name: "query_data",
    description:
      "Generic filtered lookup for questions no other tool covers — filters are equality by default; append _like to a column name for a partial/fuzzy text match instead (e.g. {\"label_like\": \"broken\"} matches any label containing that text — use this for free-text fields like ledger labels rather than guessing the exact string). Prefer a dedicated tool when one exists; use this for ad hoc combinations. Views: " +
      "v_assistant_tenants (id, name, phone, phones, room, status, active, true_owed_amount, days_overdue, deposit_amount, deposit_status, emergency_contacts) — true_owed_amount already includes penalty, matches get_overdue_tenants logic. " +
      "v_assistant_ledger (id, tenant_id, tenant_name, label, amount, paid_amount, status, source, method, affects_balance, created_at) — amount is always positive; filter affects_balance=true to exclude audit-only rows like waived penalties. " +
      "v_assistant_expenses (id, name, category_name, amount, date, source). " +
      "v_assistant_maintenance (id, tenant, location, description, status, submitted_at). " +
      "v_assistant_rooms (id, number, room_type, occupant_name, occupant_status) — occupant_name is null when vacant.",
    parameters: {
      type: "object",
      properties: {
        view: {
          type: "string",
          description: "One of: v_assistant_tenants, v_assistant_ledger, v_assistant_expenses, v_assistant_maintenance, v_assistant_rooms",
        },
        filters: {
          type: "object",
          description: "Column-value pairs, equality match only, e.g. {\"status\": \"partial\"} or {\"method\": \"cash\"}",
        },
        limit: { type: "number", description: "Max rows, default 20, capped at 50" },
      },
      required: ["view"],
    },
  },
] as const;

const SYSTEM_PROMPT = `You are the assistant inside IPM, a property management platform for Zambian landlords.
Answer only from tool results, never from general knowledge about a specific tenant or property.
Tone: friendly and professional, like a capable property manager, not a chatbot. Plain conversational language, no exclamation points, no "Great question!" filler. Lead with the actual number or answer, then add context only if it helps. Keep it short — a landlord reading on a phone — but not curt.
Match tone to the content: stay matter-of-fact and sober when reporting something bad (overdue rent, a failed payout) rather than upbeat; a landlord checking who owes money isn't looking for enthusiasm.
Don't stop at a bare number when a more useful breakdown is one more tool call away — you have several tool calls available in one turn for exactly this. "19 vacant rooms" is a weak answer if get_room_types_summary can say which types those 19 are; "K4,450 collected" is weaker than knowing how many tenants that came from. Give the landlord what they'd naturally ask next rather than making them ask a follow-up for it, whenever a tool result you already have (or one more call) can supply it. This applies even when the breakdown is already sitting inside a tool result you called (e.g. get_collected_rent's paid_tenant_count/partial_tenant_count/unpaid_tenant_count, or get_vacancy_summary's by_room_type array) — use every relevant field in the result, don't just report the single headline number and ignore the rest. Don't overdo this: if the follow-up detail isn't available from any tool, or the question was already specific, don't pad the answer with unrelated data.
You cannot send messages, waive fees, or change any record. If asked to do one of those, say the landlord needs to do it directly in IPM.
Always prefer a dedicated tool (get_overdue_tenants, get_collected_rent, etc.) over query_data when one exists for the question — those tools encode correct business logic (like the penalty formula or the collected-rent rule) that query_data's views already have baked in, but a dedicated tool is still the more direct match when the question is a standard one. Reach for query_data only for combinations or filters no dedicated tool covers.
There is no automated tenant-reminder log in this system yet — if asked which tenants were sent a reminder, say that data isn't tracked yet rather than guessing.
There is no staff/payroll data available to you — if asked about payroll, staff pay, or tax deductions for employees, say that isn't available yet rather than guessing or estimating.
When explaining a tenant's ledger: never sum entry_amount across rows that share the same label — each installment's amount is "what was owed at that moment," not an incremental charge, so summing double-counts. Never include a row where affects_balance is false in any total — those are audit-only (e.g. a waived penalty), not real money. Trust the tenant's owed_amount field as the real current balance; the ledger rows are history, not a recomputation source.
A ledger row with source "adjustment" is a charge added to the balance (or, if affects_balance is false, a waiver) — it is never money the tenant paid. If asked "how much has X paid in total," only count rows with source "manual" or "lenco" and status "paid" or "partial" (using paid_amount for partial rows), and say plainly if the underlying data is ambiguous (e.g. a row with no status set) rather than guessing whether to include it. Use get_charges, not query_data with a guessed label, for "what charges were put on this tenant" — it's already scoped to real charges only.
Use the conversation history to resolve follow-up questions like "categorize those" or "break that down by X" against what you already found, without re-asking the landlord what they meant.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function findText(candidate: any): string | undefined {
  return candidate?.content?.parts?.find((p: any) => typeof p.text === "string")?.text;
}
function findFunctionCallPart(candidate: any): any {
  return candidate?.content?.parts?.find((p: any) => p.functionCall);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, propertyId, prompt, context } = await req.json();
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: ownedProperty, error: ownershipError } = await supabase
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (ownershipError || !ownedProperty) {
      return new Response(JSON.stringify({ error: "Not authorized for this property" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    async function runTool(name: string, args: Record<string, unknown>) {
      switch (name) {
        case "get_overdue_tenants": {
          const { data, error } = await supabase.rpc("assistant_get_overdue_tenants", { p_property_id: propertyId });
          if (error) throw error;
          return data;
        }
        case "get_collected_rent": {
          const { data, error } = await supabase.rpc("assistant_get_collected_rent", { p_property_id: propertyId });
          if (error) throw error;
          return data?.[0];
        }
        case "get_vacancy_summary": {
          const [summaryRes, byTypeRes] = await Promise.all([
            supabase.rpc("assistant_get_vacancy_summary", { p_property_id: propertyId }),
            supabase.rpc("assistant_get_room_types_summary", { p_property_id: propertyId }),
          ]);
          if (summaryRes.error) throw summaryRes.error;
          if (byTypeRes.error) throw byTypeRes.error;
          return { ...summaryRes.data?.[0], by_room_type: byTypeRes.data };
        }
        case "get_room_types_summary": {
          const { data, error } = await supabase.rpc("assistant_get_room_types_summary", { p_property_id: propertyId });
          if (error) throw error;
          return data;
        }
        case "get_expenses_summary": {
          const { data, error } = await supabase.rpc("assistant_get_expenses_summary", {
            p_property_id: propertyId,
            p_period: args.period,
          });
          if (error) throw error;
          return data;
        }
        case "find_tenant": {
          const { data, error } = await supabase.rpc("assistant_find_tenant", {
            p_property_id: propertyId,
            p_query: args.query,
          });
          if (error) throw error;
          return data;
        }
        case "explain_tenant_balance": {
          const tenantId = (args.tenantId as string) ?? context?.tenantId;
          if (!tenantId) throw new Error("No tenant specified");
          const { data: ownedTenant, error: tenantOwnershipError } = await supabase
            .from("tenants")
            .select("id")
            .eq("id", tenantId)
            .eq("property_id", propertyId)
            .maybeSingle();
          if (tenantOwnershipError || !ownedTenant) throw new Error("Tenant not found for this property");
          const { data, error } = await supabase.rpc("assistant_explain_tenant_balance", { p_tenant_id: tenantId });
          if (error) throw error;
          return data;
        }
        case "get_maintenance_requests": {
          const { data, error } = await supabase.rpc("assistant_get_maintenance_requests", {
            p_property_id: propertyId,
            p_status: args.status ?? null,
          });
          if (error) throw error;
          return data;
        }
        case "get_invoices": {
          const { data, error } = await supabase.rpc("assistant_get_invoices", {
            p_property_id: propertyId,
            p_status: args.status ?? null,
          });
          if (error) throw error;
          return data;
        }
        case "get_payouts_summary": {
          const { data, error } = await supabase.rpc("assistant_get_payouts_summary", { p_property_id: propertyId });
          if (error) throw error;
          return data?.[0];
        }
        case "get_partial_tenants": {
          const { data, error } = await supabase.rpc("assistant_get_partial_tenants", { p_property_id: propertyId });
          if (error) throw error;
          return data;
        }
        case "get_paid_tenants": {
          const { data, error } = await supabase.rpc("assistant_get_paid_tenants", { p_property_id: propertyId });
          if (error) throw error;
          return data;
        }
        case "get_payments": {
          const { data, error } = await supabase.rpc("assistant_get_payments", {
            p_property_id: propertyId,
            p_method: args.method ?? null,
            p_date: args.date ?? null,
          });
          if (error) throw error;
          return data;
        }
        case "get_room_occupant": {
          const { data, error } = await supabase.rpc("assistant_get_room_occupant", {
            p_property_id: propertyId,
            p_room_query: args.room,
          });
          if (error) throw error;
          return data;
        }
        case "get_billing_settings": {
          const { data, error } = await supabase.rpc("assistant_get_billing_settings", {
            p_property_id: propertyId,
            p_tenant_id: args.tenantId ?? null,
          });
          if (error) throw error;
          return data?.[0];
        }
        case "get_collected_rent_by_method": {
          const { data, error } = await supabase.rpc("assistant_get_collected_rent_by_method", { p_property_id: propertyId });
          if (error) throw error;
          return data;
        }
        case "get_charges": {
          const { data, error } = await supabase.rpc("assistant_get_charges", {
            p_property_id: propertyId,
            p_tenant_query: args.tenant ?? null,
          });
          if (error) throw error;
          return data;
        }
        case "query_data": {
          const { data, error } = await supabase.rpc("assistant_query", {
            p_property_id: propertyId,
            p_view: args.view,
            p_filters: args.filters ?? {},
            p_limit: args.limit ?? 20,
          });
          if (error) throw error;
          return data;
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    }

    // Replay prior turns so follow-ups have context. Only user/assistant text turns are
    // replayed as conversation history — tool call/result rows are how THIS request will
    // re-derive fresh data if needed, not replayed as stale function-call state.
    const { data: history } = await supabase
      .from("assistant_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORY_MESSAGES);

    const contents: any[] = (history ?? [])
      .filter((m) => m.content)
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    contents.push({ role: "user", parts: [{ text: prompt }] });

    let answer = "No response.";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            tools: [{ functionDeclarations: TOOLS }],
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        console.error("Gemini call failed", res.status, JSON.stringify(data));
        break;
      }

      const candidate = data.candidates?.[0];
      const functionCallPart = findFunctionCallPart(candidate);

      if (!functionCallPart) {
        answer = findText(candidate) ?? "No response.";
        break;
      }

      const functionCall = functionCallPart.functionCall;
      let toolResult: unknown;
      try {
        toolResult = await runTool(functionCall.name, functionCall.args ?? {});
      } catch (toolErr) {
        toolResult = { error: toolErr instanceof Error ? toolErr.message : "Tool failed" };
      }

      // Logged for audit, but nothing in this request reads it back, so it doesn't need to block
      // the next round. Each round was previously waiting out a full extra database round trip
      // (on top of the much slower Gemini call) before it could even start the next tool call or
      // reach the final answer — on a compound question with 2-3 tool calls that alone added up to
      // real, noticeable delay. EdgeRuntime.waitUntil lets it finish in the background instead.
      EdgeRuntime.waitUntil(
        supabase.from("assistant_messages").insert({
          conversation_id: conversationId,
          role: "tool",
          tool_name: functionCall.name,
          tool_args: functionCall.args ?? {},
          tool_result: toolResult,
        })
      );

      // Extend the running contents so the next round (or the final answer) sees this
      // tool's result, enabling more than one tool call per turn for compound questions.
      contents.push({ role: "model", parts: [functionCallPart] });
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: functionCall.name, response: { result: toolResult } } }],
      });

      if (round === MAX_TOOL_ROUNDS - 1) {
        answer = findText(candidate) ?? "I gathered the data but couldn't summarize it — try asking again.";
      }
    }

    // Same reasoning as the per-round tool log above: the landlord is waiting on this response,
    // and nothing about returning it depends on this write having finished yet.
    EdgeRuntime.waitUntil(
      supabase.from("assistant_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: answer,
      })
    );

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
