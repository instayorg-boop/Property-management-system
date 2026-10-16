import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ClockCounterClockwise,
  CurrencyCircleDollar,
  UsersThree,
  GearSix,
  UserCircle,
  Funnel,
} from "@phosphor-icons/react";
import { useSettings } from "../SettingsContext";
import { listAuditLog, type AuditLogRow } from "../../lib/auditLog";
import { dayKeyAndLabel } from "../components/NotificationsPanel";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";

type AuditCategory = "financial" | "tenant" | "settings" | "auth";

// Groups the AuditAction union (src/lib/auditLog.ts) into the four categories the landlord asked
// for when this feature was scoped: financial actions, tenant record changes, settings changes,
// and login/access events. Anything not listed here falls back to "settings" rather than being
// silently dropped from the filter.
const CATEGORY_OF: Record<string, AuditCategory> = {
  "payment.logged": "financial",
  "adjustment.added": "financial",
  "penalty.waived": "financial",
  "ledger_entry.voided": "financial",
  "payout.requested": "financial",
  "payout_recipient.added": "financial",
  "subscription.changed": "financial",
  "tenant.created": "tenant",
  "tenant.updated": "tenant",
  "tenant.archived": "tenant",
  "tenant.moved_out": "tenant",
  "tenant.reactivated": "tenant",
  "settings.updated": "settings",
  "auth.signed_in": "auth",
  "auth.signed_out": "auth",
  "auth.password_changed": "auth",
};

const CATEGORY_STYLE: Record<AuditCategory, { icon: typeof CurrencyCircleDollar; tint: string; label: string }> = {
  financial: { icon: CurrencyCircleDollar, tint: "bg-emerald-50 text-emerald-600", label: "Financial" },
  tenant: { icon: UsersThree, tint: "bg-sky-50 text-sky-600", label: "Tenant records" },
  settings: { icon: GearSix, tint: "bg-mist text-muted", label: "Settings" },
  auth: { icon: UserCircle, tint: "bg-amber-50 text-amber-600", label: "Login & access" },
};

function categoryOf(row: AuditLogRow): AuditCategory {
  return CATEGORY_OF[row.action] ?? "settings";
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

function Row({ row }: { row: AuditLogRow }) {
  const { icon: Icon, tint } = CATEGORY_STYLE[categoryOf(row)];
  return (
    <div className="flex items-start gap-3 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tint}`}>
        <Icon size={17} weight="bold" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{row.summary}</p>
        <p className="mt-0.5 text-xs text-muted">
          {row.actor_label} &middot; {timeOfDay(row.created_at)}
        </p>
      </div>
    </div>
  );
}

/** Landlord-facing, read-only view of the audit_log table (Task #12): every financial action,
 * tenant record change, settings change and login/access event, each written right at its own
 * write path (see src/lib/auditLog.ts). The table itself has no UPDATE/DELETE RLS policy at all,
 * so what's shown here can never be edited, only appended to, by design. */
export default function ActivityLog() {
  const { propertyId } = useSettings();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Set<AuditCategory>>(new Set());

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    setLoading(true);
    listAuditLog(propertyId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the activity log.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const toggleCategory = (c: AuditCategory) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const visible = useMemo(
    () => rows.filter((r) => categories.size === 0 || categories.has(categoryOf(r))),
    [rows, categories]
  );

  const grouped = useMemo(() => {
    const order: string[] = [];
    const labels = new Map<string, string>();
    const byDay = new Map<string, typeof visible>();
    for (const r of visible) {
      const { key, label } = dayKeyAndLabel(r.created_at);
      if (!byDay.has(key)) {
        order.push(key);
        labels.set(key, label);
        byDay.set(key, []);
      }
      byDay.get(key)!.push(r);
    }
    return order.map((key) => ({ key, label: labels.get(key)!, rowsForDay: byDay.get(key)! }));
  }, [visible]);

  const allCategories = Object.keys(CATEGORY_STYLE) as AuditCategory[];

  return (
    <div className="px-4 pt-5 pb-24 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            aria-label="Back to settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <ArrowLeft size={16} weight="bold" />
          </button>
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand">Activity log</h1>
          {rows.length > 0 && (
            <span className="rounded-md bg-mist px-2 py-1 text-xs font-medium text-muted">{rows.length}</span>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Funnel size={14} weight="bold" />
              Filter
              {categories.size > 0 && (
                <Badge variant="secondary" className="ml-0.5 px-1.5">
                  {categories.size}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 border-gray-200">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Type</p>
              <div className="mt-2 space-y-2">
                {allCategories.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox checked={categories.has(c)} onCheckedChange={() => toggleCategory(c)} />
                    {CATEGORY_STYLE[c].label}
                  </label>
                ))}
              </div>
            </div>
            {categories.size > 0 && (
              <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setCategories(new Set())}>
                Clear filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted">
        A permanent record of what happened on this account, who did it, and when. Entries here
        cannot be edited or deleted once written.
      </p>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {!error && loading ? (
        <div className="mt-6 flex flex-col items-center justify-center border-y border-line/70 py-20 text-center">
          <p className="text-sm text-muted">Loading...</p>
        </div>
      ) : !error && visible.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center border-y border-line/70 py-20 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-mist">
            <ClockCounterClockwise size={19} className="text-muted" />
          </div>
          <p className="text-sm font-medium text-ink">Nothing here yet</p>
          <p className="mt-1 text-xs text-muted">Actions taken on this account will show up here.</p>
        </div>
      ) : (
        <div className="mt-6 max-w-3xl">
          {grouped.map(({ key, label, rowsForDay }) => (
            <div key={key}>
              <p className="pt-3 pb-1 text-xs font-medium text-muted">{label}</p>
              <div className="divide-y divide-line/70">
                {rowsForDay.map((r) => (
                  <Row key={r.id} row={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
