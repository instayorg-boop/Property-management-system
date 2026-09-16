import { supabase } from "./supabaseClient";
import { edgeFunctionErrorMessage } from "./functionsError";
import type {
  AssistantConversation,
  AssistantMessage,
  AssistantRole,
  CollectionsSummary,
  OverdueTenantSummary,
  StatutoryRates,
  TenantBalanceEntry,
  VacancySummary,
} from "../types/assistant";
import type { Json } from "./database.types";

function toConversation(row: {
  id: string;
  property_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}): AssistantConversation {
  return {
    id: row.id,
    propertyId: row.property_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_name: string | null;
  tool_args: Json | null;
  tool_result: Json | null;
  created_at: string;
}): AssistantMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as AssistantRole,
    content: row.content,
    toolName: row.tool_name,
    toolArgs: row.tool_args,
    toolResult: row.tool_result,
    createdAt: row.created_at,
  };
}

/** Starts a new thread. The panel opens onto a fresh one each time it mounts, but past threads
 * are listable/resumable (see listConversations + the panel's history dropdown) — untitled here;
 * see setConversationTitle for how a thread gets named from its first message. */
export async function createConversation(propertyId: string, title?: string): Promise<AssistantConversation> {
  const { data, error } = await supabase
    .from("assistant_conversations")
    .insert({ property_id: propertyId, title: title ?? null })
    .select()
    .single();
  if (error) throw error;
  return toConversation(data);
}

/** Every past thread for this property, newest first — the panel's history dropdown. */
export async function listConversations(propertyId: string): Promise<AssistantConversation[]> {
  const { data, error } = await supabase
    .from("assistant_conversations")
    .select("*")
    .eq("property_id", propertyId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toConversation);
}

/** Names a thread after its first message (truncated) — called once, right after the first prompt
 * in a conversation is logged, so "New chat" in the history list turns into something recognizable
 * instead of every thread reading the same generic label. */
export async function setConversationTitle(conversationId: string, title: string): Promise<AssistantConversation> {
  const { data, error } = await supabase
    .from("assistant_conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .select()
    .single();
  if (error) throw error;
  return toConversation(data);
}

export async function listMessages(conversationId: string): Promise<AssistantMessage[]> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toMessage);
}

/** Logs one message against the thread — called for the landlord's own prompt before the edge
 * function runs; the function logs the assistant's reply (and any tool calls it made) itself, so
 * this is never called with role "assistant" from the client. */
export async function appendMessage(conversationId: string, role: AssistantRole, content: string): Promise<AssistantMessage> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .insert({ conversation_id: conversationId, role, content })
    .select()
    .single();
  if (error) throw error;
  return toMessage(data);
}

// --- Read-only report RPCs — same tools the assistant itself calls, exposed here in case the UI
// ever wants to show one of these directly (e.g. a "view the numbers yourself" link). --------------

export async function getOverdueTenants(propertyId: string): Promise<OverdueTenantSummary[]> {
  const { data, error } = await supabase.rpc("assistant_get_overdue_tenants", { p_property_id: propertyId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    tenantId: r.tenant_id,
    name: r.name,
    phone: r.phone,
    owedAmount: r.owed_amount,
    daysOverdue: r.days_overdue,
  }));
}

/** @param period YYYY-MM */
export async function getCollectionsSummary(propertyId: string, period: string): Promise<CollectionsSummary | null> {
  const { data, error } = await supabase.rpc("assistant_get_collections_summary", { p_property_id: propertyId, p_period: period });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    totalCollected: row.total_collected,
    totalFees: row.total_fees,
    successfulCount: row.successful_count,
    failedCount: row.failed_count,
  };
}

export async function getVacancySummary(propertyId: string): Promise<VacancySummary | null> {
  const { data, error } = await supabase.rpc("assistant_get_vacancy_summary", { p_property_id: propertyId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return { totalRooms: row.total_rooms, occupiedRooms: row.occupied_rooms, vacantRooms: row.vacant_rooms };
}

export async function explainTenantBalance(tenantId: string): Promise<TenantBalanceEntry[]> {
  const { data, error } = await supabase.rpc("assistant_explain_tenant_balance", { p_tenant_id: tenantId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    tenantId: r.tenant_id,
    name: r.name,
    owedAmount: r.owed_amount,
    daysOverdue: r.days_overdue,
    entryLabel: r.entry_label,
    entryAmount: r.entry_amount,
    entryPaidAmount: r.entry_paid_amount,
    entryStatus: r.entry_status,
    entryPeriod: r.entry_period,
    entryCreatedAt: r.entry_created_at,
  }));
}

export async function getCurrentStatutoryRates(asOf?: string): Promise<StatutoryRates | null> {
  const { data, error } = await supabase.rpc("assistant_get_current_statutory_rates", asOf ? { p_as_of: asOf } : {});
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    effectiveDate: row.effective_date,
    napsaRate: row.napsa_rate,
    napsaMonthlyCap: row.napsa_monthly_cap,
    nhimaEmployeeRate: row.nhima_employee_rate,
    nhimaEmployerRate: row.nhima_employer_rate,
    sdlRate: row.sdl_rate,
    payeBands: row.paye_bands,
    notes: row.notes,
  };
}

// --- The chat itself ------------------------------------------------------------------------------

/** Extra page-level context the edge function can use to ground its answer (e.g. which tenant's
 * page the panel was opened from) — best-effort, the function works fine without it. */
export type AssistantChatContext = { tenantId?: string };

/** Runs one turn: sends the prompt (plus conversation history the function reads back from
 * assistant_messages itself) to Gemini via the assistant-chat edge function, which runs the
 * read-only tool loop and logs everything (its own reply, any tool calls) to assistant_messages
 * before returning just the final answer text. Never mutates a tenant/property record — the
 * function's system prompt is what enforces that, not this client. */
export async function sendAssistantMessage(
  conversationId: string,
  propertyId: string,
  prompt: string,
  context?: AssistantChatContext
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ answer?: string; error?: string }>("assistant-chat", {
    body: { conversationId, propertyId, prompt, context },
  });
  if (error || !data?.answer) {
    throw new Error(await edgeFunctionErrorMessage(error, "The assistant couldn't answer that — try again."));
  }
  return data.answer;
}
