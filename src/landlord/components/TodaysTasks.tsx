import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowCounterClockwise,
  CaretRight,
  CoffeeIcon,
} from "@phosphor-icons/react";

import {
  getTodayTasks,
  setTaskStatus,
  readCachedTasks,
  type TodayTask,
  type TodayTasksPayload,
  type TaskPriority,
} from "../../lib/todaysTasksApi";

import { Skeleton } from "./Skeleton";
import { useTenants } from "../TenantsContext";
import { resolveTaskLink } from "../linkResolver";
import { Checkbox } from "../../components/ui/checkbox";
import { StatusPill, type StatusTone } from "./DataTable";
import AutopilotBadge from "./AutopilotBadge";

/**
 * Today's Tasks
 *
 * To-do-list style: a leading checkbox marks a row done, priority is a small colored badge under
 * the title, and the row's contextual action (chase payment, view report, ...) plus snooze reveal
 * on hover, same as before.
 */

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Unlike Maintenance.tsx's four-level scale (low/medium/high/urgent), this page's priority
// tops out at "high" with nothing above it, so High gets the most severe tone (danger/red)
// here rather than the warning/amber Maintenance.tsx gives its own "high" (one step below
// "urgent" there).
const PRIORITY_TONE: Record<TaskPriority, StatusTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export const SNOOZE_DAYS = 3;

function kwacha(value: unknown): string {
  const n = Number(value);

  if (!Number.isFinite(n)) return "";

  return `K${n.toLocaleString("en-US")}`;
}

export function factsLine(task: TodayTask): string {
  const f = task.facts as Record<string, string | number | boolean | null>;

  switch (task.type) {
    case "overdue_rent":
      return [
        kwacha(f.amount),
        f.period ? `${f.period}` : null,
        f.room ? `Room ${f.room}` : null,
        f.has_guardian ? "guardian number on file" : null,
      ]
        .filter(Boolean)
        .join(" · ");

    case "stale_maintenance":
      return [
        f.location,
        `status: ${f.status}`,
        `${f.days_open} days open`,
      ]
        .filter(Boolean)
        .join(" · ");

    case "collections_below_target":
      return `${f.paid_up} of ${f.active_tenants} tenants paid · ${f.collected_pct}% against ${f.target_pct}%`;

    case "partial_payment":
      return [kwacha(f.outstanding), f.period]
        .filter(Boolean)
        .join(" · ");

    case "vacancy":
      return `${f.vacant} of ${f.total} rooms empty`;

    case "payout_ready":
      return `${kwacha(f.available_balance)} available`;

    case "deposit_unsettled":
      return [f.tenant_name, `deposit ${f.deposit_status}`]
        .filter(Boolean)
        .join(" · ");

    case "manual":
      return f.due_date ? `Due ${new Date(String(f.due_date)).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "";

    default:
      return Object.entries(f)
        .filter(([, v]) => v !== null && v !== "")
        .slice(0, 3)
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join(" · ");
  }
}

// Route resolution lives in linkResolver.ts (shared with notifications) — this only owns the
// label text, since that's presentation specific to a task row's button.
export function labelFor(task: TodayTask): string {
  switch (task.type) {
    case "overdue_rent":
      return "Chase payment";
    case "stale_maintenance":
      return "View report";
    case "collections_below_target":
      return "See who owes";
    case "partial_payment":
      return "Send reminder";
    case "deposit_unsettled":
      return "Settle deposit";
    case "vacancy":
      return "View rooms";
    case "payout_ready":
      return "Withdraw";
    case "data_gaps":
      return "Fix details";
    case "manual":
      // Nothing to view — this is the landlord's own to-do, not a record anywhere else in the app.
      return "";
    default:
      return "Open";
  }
}

export function TaskRow({
  task,
  onDone,
  busy,
}: {
  task: TodayTask;
  onDone: () => void;
  busy: boolean;
}) {
  const navigate = useNavigate();
  const { tenants } = useTenants();
  const route = resolveTaskLink(task, tenants);
  const label = labelFor(task);

  // The checkbox's `checked` prop was hardcoded to false, so clicking it never actually looked
  // checked — it just sat there until the row disappeared once the async "mark done" round trip
  // finished, which read as broken/unresponsive. This ticks the box and strikes the title through
  // immediately, then holds for a beat before telling the parent to remove the row — same
  // "checked, then it goes away" pause a real to-do list gives you, rather than either nothing
  // happening or the row vanishing the instant the network call resolves.
  const [justChecked, setJustChecked] = useState(false);
  const handleDone = () => {
    setJustChecked(true);
    setTimeout(onDone, 500);
  };

  // Row navigates only when there's somewhere real to send it — a manual to-do has no record
  // anywhere else in the app, so its row stays inert and only the checkbox does anything.
  const clickable = Boolean(label);

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => navigate(route) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(route);
              }
            }
          : undefined
      }
      className={`group flex items-start gap-3 border-b border-line/70 py-3.5 transition-colors last:border-b-0 ${
        clickable ? "cursor-pointer hover:bg-mist/30" : ""
      }`}
    >
      {/* Checkbox leads the row, todo-list style. Its own click is stopped from bubbling up so
          checking a task off never also fires the row's navigation. */}
      <span onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0">
        <Checkbox
          checked={justChecked}
          onCheckedChange={handleDone}
          disabled={busy}
          aria-label={`Mark "${task.title}" as done`}
        />
      </span>

      {/* Task content, the title wraps instead of cutting off mid-word in a narrow card. Only
          underlines on hover when the row actually goes somewhere, the same link affordance
          Maintenance.tsx's report rows use, rather than putting the underline on the badge. */}
      <div className="min-w-0 flex-1">
        <p
          className={`line-clamp-2 text-[13px] font-medium leading-5 transition-colors ${
            justChecked ? "text-muted line-through" : "text-ink"
          } ${clickable ? "group-hover:underline" : ""}`}
        >
          {task.title}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted">{factsLine(task)}</p>
      </div>

      {/* Priority, in the corner the snooze button and chevron used to occupy: StatusPill, the
          same pill (reduced roundness, tinted background matching the text) Maintenance.tsx's
          own Priority/Status columns use everywhere else in the app. */}
      <span className="shrink-0 self-start">
        <StatusPill tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</StatusPill>
      </span>
    </div>
  );
}

export function PriorityTabs({
  tab,
  counts,
  onChange,
}: {
  tab: "all" | TaskPriority;
  counts: {
    all: number;
    high: number;
    medium: number;
    low: number;
  };
  onChange: (tab: "all" | TaskPriority) => void;
}) {
  const tabs = ["all", "high", "medium", "low"] as const;

  return (
    <div
      className="
        inline-flex
        items-center
        rounded-lg
        border
        border-line
        bg-mist/40
        p-0.5
      "
      role="tablist"
      aria-label="Filter tasks by priority"
    >
      {tabs.map((key) => {
        const active = tab === key;

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`
              rounded-md
              px-2.5
              py-1.5
              text-[11px]
              font-medium
              transition-all
              ${
                active
                  ? "border border-line bg-paper text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }
            `}
          >
            {key === "all" ? "All" : PRIORITY_LABEL[key]}

            <span
              className={`
                ml-1
                ${
                  active
                    ? "text-muted"
                    : "text-muted/70"
                }
              `}
            >
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function TodaysTasks({
  propertyId,
}: {
  propertyId: string | null | undefined;
}) {
  const [payload, setPayload] =
    useState<TodayTasksPayload | null>(() =>
      propertyId ? readCachedTasks(propertyId) : null
    );

  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [undo, setUndo] = useState<{
    task: TodayTask;
    what: "done" | "snoozed";
  } | null>(null);

  useEffect(() => {
    if (!propertyId) return;

    let cancelled = false;

    setLoading(true);

    getTodayTasks(propertyId)
      .then((p) => {
        if (!cancelled) {
          setPayload(p);
        }
      })
      .catch((e) =>
        console.error("Failed to load today's tasks", e)
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const refresh = async () => {
    if (!propertyId) return;
    setPayload(await getTodayTasks(propertyId));
  };

  const updateStatus = async (
    task: TodayTask,
    status: "done" | "snoozed" | "open"
  ) => {
    setBusyId(task.id);

    const previous = payload;

    if (payload) {
      setPayload({
        ...payload,
        top: payload.top.filter(
          (t) => t.id !== task.id
        ),
        counts: {
          ...payload.counts,
          all: Math.max(payload.counts.all - 1, 0),
        },
        doneToday:
          status === "done"
            ? payload.doneToday + 1
            : payload.doneToday,
      });
    }

    try {
      await setTaskStatus(
        task.id,
        status,
        SNOOZE_DAYS
      );

      if (status !== "open") {
        setUndo({
          task,
          what: status,
        });
      } else {
        setUndo(null);
      }

      await refresh();
    } catch (e) {
      console.error(
        "Failed to update task",
        e
      );

      setPayload(previous);
    } finally {
      setBusyId(null);
    }
  };

  const counts = payload?.counts ?? {
    all: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  // Only the first 5 show inline — the rest are a tap away via the "See all" button below, rather
  // than everything the API hands back (which could run well past a glance-able list).
  const rows = (payload?.top ?? []).slice(0, 5);
  const hasMore = counts.all > rows.length;

  return (
    <section className="w-full">
      {/* Header */}
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          Needs your attention
        </h2>

        <AutopilotBadge />

        {counts.all > 0 && (
          <span className="rounded-md bg-mist px-1.5 py-0.5 text-[10px] font-medium text-muted">
            {counts.all}
          </span>
        )}
      </div>

      {/* AI briefing */}
      {payload?.briefing && (
        <div
          className="
            mt-5
            flex
            gap-3
            rounded-r-md
            bg-mist/50
            px-3.5
            border-l-2
            border-l-brand
            border
            border-gray-200
            py-3
            
          "
        >
         

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                AI briefing
              </p>

              {payload.refreshedAt && (
                <>
                  <span className="text-[10px] text-muted/50">
                    ·
                  </span>

                  <span className="text-[10px] text-muted">
                    {new Date(
                      payload.refreshedAt
                    ).toLocaleTimeString(
                      "en-GB",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </span>
                </>
              )}
            </div>

            <p className="mt-1 text-xs leading-5 text-ink">
              {payload.briefing}
            </p>
          </div>
        </div>
      )}

      {/* Undo */}
      {undo && (
        <div
          className="
            mt-4
            flex
            items-center
            justify-between
            gap-3
            border-y
            border-line
            py-2.5
          "
        >
          <p className="min-w-0 truncate text-[11px] text-muted">
            {undo.what === "done"
              ? "Marked done"
              : `Snoozed for ${SNOOZE_DAYS} days`}
            {" — "}
            <span className="text-ink">
              {undo.task.title}
            </span>
          </p>

          <button
            type="button"
            onClick={() => {
              const task = undo.task;

              setUndo(null);

              void updateStatus(
                task,
                "open"
              );
            }}
            className="
              flex
              shrink-0
              items-center
              gap-1
              text-[11px]
              font-medium
              text-brand
              transition-opacity
              hover:opacity-70
            "
          >
            <ArrowCounterClockwise
              size={13}
            />
            Undo
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && !payload ? (
        <div className="mt-4 divide-y divide-line/70">
          {Array.from({
            length: 3,
          }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-4"
            >
              <Skeleton className="h-2 w-2 rounded-full" />

              <div className="flex-1">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="mt-2 h-2.5 w-1/2" />
              </div>

              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-mist text-muted">
            <CoffeeIcon size={20} />
          </div>

          <p className="text-[13px] font-medium text-ink">
            All good, nothing needs you
          </p>

          <p className="mt-1 max-w-[260px] text-[11px] leading-5 text-muted">
            New tasks appear as rent falls due
            or a repair goes unattended.
          </p>
        </div>
      ) : (
        /* Tasks */
        <div className="mt-3">
          {rows.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              busy={busyId === task.id}
              onDone={() =>
                void updateStatus(
                  task,
                  "done"
                )
              }
            />
          ))}
        </div>
      )}

      {/* See all — one clear, always-visible button (replaces the old small muted-text links that
          were easy to miss) rather than separate desktop/mobile versions. */}
      {hasMore && (
        <div className="mt-3 border-t border-line/70 pt-3">
          <button
            type="button"
            onClick={() => navigate("/tasks")}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-mist/40 px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-mist"
          >
            See all {counts.all} tasks
            <CaretRight size={12} weight="bold" />
          </button>
        </div>
      )}
    </section>
  );
}