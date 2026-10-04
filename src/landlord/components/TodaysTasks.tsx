import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowCounterClockwise,
  CaretDown,
  CoffeeIcon,
  Clock,
  Sparkle,
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
import { ChevronUp } from "lucide-react";
import { useTenants } from "../TenantsContext";
import { resolveTaskLink } from "../linkResolver";
import { Checkbox } from "../../components/ui/checkbox";

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

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  high: "bg-red-50 text-red-600",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-emerald-50 text-emerald-700",
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
  onSnooze,
  busy,
}: {
  task: TodayTask;
  onDone: () => void;
  onSnooze: () => void;
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

  return (
    <div
      className="
        group
        flex
        items-start
        gap-3
        border-b
        border-line/70
        py-4
        transition-colors
        last:border-b-0
      "
    >
      {/* Checkbox leads the row, todo-list style — checking it off is the same "mark done" action
          the old far-right checkmark button was, just where a to-do list convention expects it. */}
      <Checkbox
        checked={justChecked}
        onCheckedChange={handleDone}
        disabled={busy}
        aria-label={`Mark "${task.title}" as done`}
        className="mt-0.5 shrink-0"
      />

      {/* Task content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-[13px] font-medium leading-5 transition-colors ${
              justChecked ? "text-muted line-through" : "text-ink"
            }`}
          >
            {task.title}
          </p>
          <span
            className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[task.priority]}`}
          >
            {PRIORITY_LABEL[task.priority]}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] leading-5 text-muted">{factsLine(task)}</p>
      </div>

      {/* Actions */}
      <div
        className="
          flex
          shrink-0
          items-center
          gap-2 *
          mx-2
         
          transition-opacity
          group-hover:opacity-100
          group-focus-within:opacity-100
          max-sm:opacity-100
        "
      >
        {label && (
          <button
            type="button"
            onClick={() => navigate(route)}
            className="
            underline
            text-xs
            font-medium
            text-muted
            transition-colors
            
            hover:text-brand
          "
          >
            {label}
          </button>
        )}

        <button
          type="button"
          onClick={onSnooze}
          disabled={busy}
          aria-label={`Snooze "${task.title}" for ${SNOOZE_DAYS} days`}
          title={`Snooze ${SNOOZE_DAYS} days`}
          className="
            flex
            h-7
            w-7
            items-center
            justify-center
            rounded-md
            text-muted
            transition-colors
            hover:bg-mist
            hover:text-ink
            disabled:cursor-not-allowed
            disabled:opacity-40
          "
        >
          <Clock size={14} />
        </button>
      </div>
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
                  ? "bg-paper text-ink shadow-sm"
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

  const doneToday =
    payload?.doneToday ?? 0;

  const totalToday =
    counts.all + doneToday;

  const completion =
    totalToday > 0
      ? Math.round(
          (doneToday / totalToday) * 100
        )
      : 0;

  const rows = payload?.top ?? [];
  const hasMore = counts.all > rows.length;

  return (
    <section className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
            Today's tasks
          </h2>

          {counts.all > 0 && (
            <span className="rounded-md bg-mist px-1.5 py-0.5 text-[10px] font-medium text-muted">
              {counts.all}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[11px] text-muted">
            {doneToday}/{totalToday} done
          </span>

          {hasMore && (
            <button
              type="button"
              onClick={() => navigate("/tasks")}
              className="
                hidden
                items-center
                gap-1
                text-[11px]
                font-medium
                text-muted
                transition-colors
                hover:text-ink
                sm:flex
              "
            >
              See all
              <CaretDown size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {totalToday > 0 && (
        <div className="mt-3 h-1 rounded-4xl w-full bg-line">
          <div
            className="h-1 rounded-4xl bg-brand transition-[width] duration-500"
            style={{
              width: `${completion}%`,
            }}
          />
        </div>
      )}

      {/* Mobile see all */}
      {hasMore && (
        <button
          type="button"
          onClick={() => navigate("/tasks")}
          className="
              mt-3
              flex
              items-center
              gap-1
              text-[11px]
              font-medium
              text-muted
              sm:hidden
            "
        >
          See all {counts.all} tasks
          <ChevronUp size={12} />
        </button>
      )}

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
            Nothing left here
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
              onSnooze={() =>
                void updateStatus(
                  task,
                  "snoozed"
                )
              }
            />
          ))}
        </div>
      )}

      {/* Desktop footer */}
      {hasMore && (
        <div className="mt-2 hidden border-t border-line/70 pt-3 sm:block">
          <button
            type="button"
            onClick={() => navigate("/tasks")}
            className="
                flex
                items-center
                gap-1
                text-[11px]
                font-medium
                text-muted
                transition-colors
                hover:text-ink
              "
          >
            See all {counts.all} tasks
            <CaretDown size={12} />
          </button>
        </div>
      )}
    </section>
  );
}