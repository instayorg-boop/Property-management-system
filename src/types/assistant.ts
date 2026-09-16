import type { Json } from "../lib/database.types";

export type AssistantRole = "user" | "assistant" | "tool";

/** One conversation thread — a fresh one is created each time the assistant panel opens (see
 * useAssistant), not resumed across sessions. */
export type AssistantConversation = {
  id: string;
  propertyId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A row in assistant_messages — either what the landlord typed, what the model answered, or a
 * record of one tool call the model made along the way (tool_name/tool_args/tool_result). */
export type AssistantMessage = {
  id: string;
  conversationId: string;
  role: AssistantRole;
  content: string;
  toolName: string | null;
  toolArgs: Json | null;
  toolResult: Json | null;
  createdAt: string;
};

/** One exchange rendered in the panel — the hook only ever appends "user" and "assistant" turns
 * locally (tool calls happen server-side and aren't shown as their own bubble in this UI). */
export type AssistantTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

// --- Read-only RPC result shapes (assistant_get_*, assistant_explain_tenant_balance) -----------

export type OverdueTenantSummary = {
  tenantId: string;
  name: string;
  phone: string | null;
  owedAmount: number;
  daysOverdue: number;
};

export type CollectionsSummary = {
  totalCollected: number;
  totalFees: number;
  successfulCount: number;
  failedCount: number;
};

export type VacancySummary = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
};

/** One ledger entry underlying a tenant's current balance — assistant_explain_tenant_balance
 * returns one row per entry, all sharing the same tenant/balance header fields. */
export type TenantBalanceEntry = {
  tenantId: string;
  name: string;
  owedAmount: number;
  daysOverdue: number;
  entryLabel: string;
  entryAmount: number;
  entryPaidAmount: number | null;
  entryStatus: string | null;
  entryPeriod: string | null;
  entryCreatedAt: string;
};

export type PayeBand = { upTo: number | null; rate: number };

export type StatutoryRates = {
  effectiveDate: string;
  napsaRate: number;
  napsaMonthlyCap: number;
  nhimaEmployeeRate: number;
  nhimaEmployerRate: number;
  sdlRate: number;
  payeBands: Json;
  notes: string | null;
};
