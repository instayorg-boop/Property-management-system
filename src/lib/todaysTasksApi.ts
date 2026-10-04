import { supabase } from "./supabaseClient";

/**
 * Today's Tasks — the dashboard's task list.
 *
 * Unlike the old dashboard-tasks edge function this replaces, nothing here asks an LLM what the
 * landlord should do. The database's detectors decide which tasks exist, how they rank and when
 * they resolve (see sync_tasks); Gemini only ever rewrites the wording, and `aiWritten` says
 * whether it got to a given row yet. A task with no AI title still reads perfectly — it just uses
 * the plain SQL-built sentence.
 */

export type TaskPriority = "high" | "medium" | "low";

export type TaskType =
  | "overdue_rent"
  | "stale_maintenance"
  | "collections_below_target"
  | "partial_payment"
  | "deposit_unsettled"
  | "vacancy"
  | "payout_ready"
  | "data_gaps"
  | "manual";

export type TodayTask = {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  score: number;
  /** ai_title when one exists, otherwise the detector's fallback_title. Never empty. */
  title: string;
  aiWritten: boolean;
  /** The exact numbers behind the task — rendered as the muted line under the title. */
  facts: Record<string, unknown>;
  actionType: string | null;
  actionTargetId: string | null;
};

export type TodayTasksPayload = {
  top: TodayTask[];
  counts: { all: number; high: number; medium: number; low: number };
  doneToday: number;
  briefing: string | null;
  refreshedAt: string | null;
};

type RawTask = {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  score: number;
  title: string;
  ai_written: boolean;
  facts: Record<string, unknown>;
  action_type: string | null;
  action_target_id: string | null;
};

function toTask(raw: RawTask): TodayTask {
  return {
    id: raw.id,
    type: raw.type,
    priority: raw.priority,
    score: raw.score,
    title: raw.title,
    aiWritten: raw.ai_written,
    facts: raw.facts ?? {},
    actionType: raw.action_type,
    actionTargetId: raw.action_target_id,
  };
}

const CACHE_KEY = (propertyId: string) => `instay-today-tasks:${propertyId}`;

/** Last good payload, so a cold start offline (or a slow network) paints the real list instead of
 * a skeleton that never resolves. Same idea as the rest of the app's offline reads. */
export function readCachedTasks(propertyId: string): TodayTasksPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(propertyId));
    return raw ? (JSON.parse(raw) as TodayTasksPayload) : null;
  } catch {
    return null;
  }
}

function cacheTasks(propertyId: string, payload: TodayTasksPayload) {
  try {
    localStorage.setItem(CACHE_KEY(propertyId), JSON.stringify(payload));
  } catch {
    // Storage full or blocked — the list still works, it just won't survive a reload offline.
  }
}

export async function getTodayTasks(propertyId: string): Promise<TodayTasksPayload> {
  const { data, error } = await supabase.rpc("get_today_tasks", { p_property_id: propertyId });
  if (error) throw error;
  const raw = data as {
    top?: RawTask[];
    all_counts?: { all: number; high: number; medium: number; low: number };
    done_today?: number;
    briefing?: string | null;
    refreshed_at?: string | null;
  };
  const payload: TodayTasksPayload = {
    top: (raw?.top ?? []).map(toTask),
    counts: raw?.all_counts ?? { all: 0, high: 0, medium: 0, low: 0 },
    doneToday: raw?.done_today ?? 0,
    briefing: raw?.briefing ?? null,
    refreshedAt: raw?.refreshed_at ?? null,
  };
  cacheTasks(propertyId, payload);
  return payload;
}

export async function getAllOpenTasks(propertyId: string): Promise<TodayTask[]> {
  const { data, error } = await supabase.rpc("get_all_open_tasks", { p_property_id: propertyId });
  if (error) throw error;
  return ((data as RawTask[]) ?? []).map(toTask);
}

export async function setTaskStatus(
  taskId: string,
  status: "open" | "done" | "snoozed",
  snoozeDays = 3
): Promise<void> {
  const { error } = await supabase.rpc("set_task_status", {
    p_task_id: taskId,
    p_status: status,
    p_snooze_days: snoozeDays,
  });
  if (error) throw error;
}

// Score bands mirror public.task_priority(int) (20261003010000): >=70 high, >=40 medium, else low.
// A manual task has no detector run to re-score it, so this is picked once at creation, not derived.
const MANUAL_TASK_SCORE: Record<TaskPriority, number> = { high: 75, medium: 50, low: 20 };

/** A landlord's own to-do, alongside the auto-detected ones — "call the electrician", not a
 * situation any detector could raise. Inserted directly (RLS already scopes tasks_insert to the
 * caller's own property); see 20261005000000_manual_tasks.sql for why `source: "manual"` matters —
 * without it the daily sync would auto-resolve this the next time it runs. */
export async function addManualTask(
  propertyId: string,
  input: { title: string; priority: TaskPriority; dueDate?: string | null }
): Promise<void> {
  const facts = input.dueDate ? { due_date: input.dueDate } : {};
  const { error } = await supabase.from("tasks").insert({
    property_id: propertyId,
    key: `manual:${crypto.randomUUID()}`,
    type: "manual",
    priority: input.priority,
    score: MANUAL_TASK_SCORE[input.priority],
    facts,
    facts_hash: "manual",
    fallback_title: input.title,
    source: "manual",
  });
  if (error) throw error;
}
