import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CoffeeIcon, Plus, Sparkle } from "@phosphor-icons/react";
import {
  getAllOpenTasks,
  setTaskStatus,
  addManualTask,
  type TodayTask,
  type TaskPriority,
} from "../../lib/todaysTasksApi";
import { useSettings } from "../SettingsContext";
import { Skeleton } from "../components/Skeleton";
import { TaskRow, PriorityTabs, SNOOZE_DAYS } from "../components/TodaysTasks";
import DashboardTabs from "../components/DashboardTabs";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import Button from "../components/Button";

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/** Full task list — reached via "See all" on the dashboard's Today's tasks widget, which only ever
 * shows a handful of rows to keep the dashboard compact. This page owns filtering/pagination-free
 * browsing of every open task; the widget and this page share TaskRow/PriorityTabs so a row looks
 * and behaves identically in both places. */
export default function Tasks() {
  const { propertyId, isReady: settingsReady } = useSettings();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<TodayTask[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | TaskPriority>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      setTasks(await getAllOpenTasks(propertyId));
    } catch (e) {
      console.error("Failed to load tasks", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const counts = useMemo(() => {
    const c = { all: 0, high: 0, medium: 0, low: 0 };
    for (const t of tasks ?? []) {
      c.all += 1;
      c[t.priority] += 1;
    }
    return c;
  }, [tasks]);

  const visible = useMemo(() => {
    if (!tasks) return [];
    return tab === "all" ? tasks : tasks.filter((t) => t.priority === tab);
  }, [tasks, tab]);

  const handleAddTask = async () => {
    if (!propertyId || !newTitle.trim()) return;
    setAdding(true);
    try {
      await addManualTask(propertyId, {
        title: newTitle.trim(),
        priority: newPriority,
        dueDate: newDueDate || null,
      });
      setAddOpen(false);
      setNewTitle("");
      setNewPriority("medium");
      setNewDueDate("");
      await load();
    } catch (e) {
      console.error("Failed to add task", e);
    } finally {
      setAdding(false);
    }
  };

  const updateStatus = async (task: TodayTask, status: "done" | "snoozed") => {
    setBusyId(task.id);
    const previous = tasks;
    setTasks((prev) => (prev ? prev.filter((t) => t.id !== task.id) : prev));
    try {
      await setTaskStatus(task.id, status, SNOOZE_DAYS);
    } catch (e) {
      console.error("Failed to update task", e);
      setTasks(previous);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <DashboardTabs />
      <div className="px-4 pt-5 pb-24 sm:px-8">
      {/* Title and its filter controls share one row — same grouped-toolbar treatment as
          /notifications, rather than the priority tabs sitting on a separate line below. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            aria-label="Back to dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <ArrowLeft size={16} weight="bold" />
          </button>

          <h1 className="font-display text-2xl font-bold tracking-tight text-brand">Tasks</h1>
          {counts.all > 0 && (
            <span className="rounded-md bg-mist px-2 py-1 text-xs font-medium text-muted">{counts.all} open</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <PriorityTabs tab={tab} counts={counts} onChange={setTab} />

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button variant="primary" size="sm" className="gap-1.5">
                <Plus size={14} weight="bold" />
                Add task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a task</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="task-title">Title</Label>
                  <Input
                    id="task-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Call the electrician about the borehole pump"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <div className="flex gap-2">
                    {PRIORITY_OPTIONS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setNewPriority(p.value)}
                        className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                          newPriority === p.value
                            ? "border-ink bg-ink text-paper"
                            : "border-line text-muted hover:text-ink"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="task-due">Due date (optional)</Label>
                  <Input id="task-due" type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void handleAddTask()} disabled={!newTitle.trim() || adding}>
                  {adding ? "Adding…" : "Add task"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!settingsReady || loading ? (
        <div className="mt-6 max-w-3xl divide-y divide-line/70">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-4">
              <Skeleton className="h-2 w-2 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="mt-2 h-2.5 w-1/2" />
              </div>
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center border-y border-line/70 py-20 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-mist text-muted">
            <CoffeeIcon size={20} />
          </div>
          <p className="text-sm font-medium text-ink">Nothing left here</p>
          <p className="mt-1 max-w-[260px] text-xs text-muted">
            New tasks appear as rent falls due or a repair goes unattended.
          </p>
        </div>
      ) : (
        <div className="mt-6 max-w-3xl divide-y divide-line/70">
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              busy={busyId === task.id}
              onDone={() => void updateStatus(task, "done")}
              onSnooze={() => void updateStatus(task, "snoozed")}
            />
          ))}
        </div>
      )}

      <p className="mt-3 flex max-w-3xl items-center gap-1.5 text-[11px] text-muted">
        <Sparkle size={12} />
        Titles are AI-worded where available; what's shown and when is decided by the property's own data.
      </p>
      </div>
    </>
  );
}
