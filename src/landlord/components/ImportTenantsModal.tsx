import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { UploadSimple, DownloadSimple, CheckCircle, WarningCircle, XCircle, ArrowCounterClockwise } from "@phosphor-icons/react";
import Modal from "./Modal";
import Button from "./Button";
import Select from "./Select";
import { useTenants } from "../TenantsContext";
import { useSettings } from "../SettingsContext";
import { useToast } from "../ToastContext";
import {
  IMPORT_FIELDS, parseTable, autoMap, buildRows, templateCsv, runImport, undoImport, sendWelcomeTexts, last9,
  type ImportField, type ImportRow,
} from "../../lib/importTenants";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

type Step = "input" | "review" | "done";

export default function ImportTenantsModal({ onClose }: { onClose: () => void }) {
  const { tenants } = useTenants();
  const { propertyId, propertyName, dueDay } = useSettings();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("input");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<ImportField, number>>({} as Record<ImportField, number>);
  const [defaultRent, setDefaultRent] = useState("");
  const [sendTexts, setSendTexts] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ batchId: string; count: number; skipped: number; failed: { row: ImportRow; error: string }[] } | null>(null);
  // Phones already in this property, read once when the file is loaded. Frozen on purpose: if it
  // followed the live tenant list, every row would turn into "already a tenant" while the import
  // was running, because the tenants it had just added counted as duplicates of themselves.
  const [existingSnap, setExistingSnap] = useState<Set<string> | null>(null);
  const [undone, setUndone] = useState<string | null>(null);

  const existing = useMemo(
    () => existingSnap ?? new Set(tenants.filter((t) => t.active).flatMap((t) => t.phones.map(last9))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existingSnap],
  );
  const rent = Number(defaultRent.replace(/[^\d.]/g, "")) || null;
  const rows = useMemo(
    () => (table.length ? buildRows(table, map, { propertyName, defaultRent: rent, existingPhones: existing }) : []),
    [table, map, rent, propertyName, existing],
  );
  const good = rows.filter((r) => r.tenant);
  const warns = rows.filter((r) => r.status === "warn").length;
  const bad = rows.filter((r) => r.status === "error");

  const load = async (raw: string) => {
    const parsed = parseTable(raw);
    if (parsed.length < 2) {
      setError("We need a header row and at least one tenant.");
      return;
    }
    setError(null);
    // Fresh read from the database, not the in-app list, which can be out of date.
    let phones: string[] = [];
    if (propertyId) {
      const { data } = await supabase.from("tenants").select("phones").eq("property_id", propertyId).eq("active", true);
      phones = (data ?? []).flatMap((t) => ((t.phones as string[] | null) ?? []).map(last9));
    }
    setExistingSnap(new Set(phones));
    setHeaders(parsed[0]);
    setTable(parsed.slice(1));
    setMap(autoMap(parsed[0]));
    setStep("review");
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) {
      setError("Excel files can't be read directly. In Excel choose Save As, then CSV, or copy the cells and paste them below.");
      return;
    }
    setFileName(f.name);
    await load(await f.text());
  };

  const headerOptions = [{ value: "-1", label: "Not in my file" }, ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))];
  const needsMap = (map.name ?? -1) < 0 || ((map.rent ?? -1) < 0 && !rent);

  const doImport = async () => {
    if (!propertyId) return;
    setBusy(true);
    setProgress(0);
    const label = `Import ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${fileName ? ` · ${fileName}` : ""}`;
    try {
      const res = await runImport(propertyId, good, label, setProgress);
      if (sendTexts && res.imported.length) void sendWelcomeTexts(res.imported.map((x) => x.id));
      setResult({ batchId: res.batchId, count: res.imported.length, skipped: bad.length, failed: res.failed });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!result) return;
    setBusy(true);
    const r = await undoImport(result.batchId);
    setBusy(false);
    setUndone(r.kept ? `Removed ${r.removed}. Kept ${r.kept} that already have payments.` : `Removed all ${r.removed} imported tenants.`);
    showToast("Import undone");
  };

  const downloadErrors = () => {
    const lines = [[...headers, "Problem"].map(csvCell).join(",")];
    for (const r of [...bad, ...(result?.failed.map((f) => f.row) ?? [])]) lines.push([...r.raw, r.messages.join("; ")].map(csvCell).join(","));
    download("rows-to-fix.csv", lines.join("\n"));
  };

  const firstDue = (() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return new Date(d.getFullYear(), d.getMonth(), Math.min(dueDay || 1, last));
  })();
  const firstDueText = firstDue.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  const footer =
    step === "input" ? (
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    ) : step === "review" ? (
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => { setStep("input"); setTable([]); }}>Back</Button>
        <Button variant="primary" disabled={busy || good.length === 0 || needsMap} onClick={() => void doImport()}>
          {busy ? `Importing ${progress}/${good.length}…` : `Import ${good.length} tenant${good.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    ) : (
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button
          variant="primary"
          onClick={() => {
            onClose();
            navigate("/tenants");
          }}
        >
          View tenants
        </Button>
      </div>
    );

  return (
    <Modal onClose={onClose} title="Import tenants" description="Bring your tenant list in from a spreadsheet." icon={<UploadSimple size={20} />} maxWidth="max-w-lg" footer={footer} disableBackdropClose={busy}>
      <div className="min-h-[340px]">
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}

        {step === "input" && (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink">1. Download the template</p>
              <button
                type="button"
                onClick={() => download("tenants-template.csv", templateCsv())}
                className="flex w-full items-center gap-3 rounded-md border border-brand/30 bg-brand-soft px-4 py-3 text-left transition-colors hover:border-brand"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-white"><DownloadSimple size={18} weight="bold" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-brand">Download tenants-template.csv</span>
                  <span className="block text-xs text-muted">Open it in Excel or Sheets and fill in one tenant per row.</span>
                </span>
              </button>
              <p className="mt-2 text-xs text-muted">
                <span className="font-semibold text-ink">Required:</span> full name, phone, monthly rent.{" "}
                <span className="font-semibold text-ink">Optional:</span> unit, move-in date, deposit, gender, guardian.
              </p>
              <p className="mt-2 rounded-md bg-brand-soft/50 px-3 py-2 text-xs text-ink">
                Everyone starts fully paid. Their first rent is due on your next due date. If someone owes from
                before, add it on their profile after importing.
              </p>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink">2. Upload it</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); void onFile(e.dataTransfer.files?.[0]); }}
                className={`flex w-full flex-col items-center gap-1 rounded-md border border-dashed px-4 py-7 text-center transition-colors ${dragging ? "border-brand bg-brand-soft" : "border-line hover:bg-mist"}`}
              >
                <UploadSimple size={22} className="text-brand" />
                <span className="text-sm font-semibold">Choose your CSV file</span>
                <span className="text-xs text-muted">or drop it here. Save Excel files as CSV first.</span>
              </button>
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
          </div>
        )}

        {step === "review" && busy && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-display text-lg font-semibold">Adding your tenants…</p>
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-mist">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${good.length ? Math.round((progress / good.length) * 100) : 0}%` }} />
            </div>
            <p className="text-xs text-muted">
              {progress} of {good.length}. Keep this window open.
            </p>
          </div>
        )}

        {step === "review" && !busy && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle size={14} weight="fill" /> {good.length - warns} ready</span>
              {warns > 0 && <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><WarningCircle size={14} weight="fill" /> {warns} with a warning</span>}
              {bad.length > 0 && <span className="inline-flex items-center gap-1 font-semibold text-red-600"><XCircle size={14} weight="fill" /> {bad.length} won't be imported</span>}
              <button type="button" onClick={() => setShowMap((v) => !v)} className="ml-auto font-semibold text-brand">{showMap || needsMap ? "Hide columns" : "Check columns"}</button>
            </div>

            {(showMap || needsMap) && (
              <div className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-2">
                {IMPORT_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1 block text-[11px] font-medium text-muted">{f.label}{f.required ? " *" : ""}</label>
                    <Select value={String(map[f.key] ?? -1)} onChange={(v) => setMap((m) => ({ ...m, [f.key]: Number(v) }))} options={headerOptions} />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-medium text-muted">Rent to use when a row has none (optional)</label>
                  <input value={defaultRent} onChange={(e) => setDefaultRent(e.target.value)} inputMode="numeric" placeholder="e.g. 1500" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand" />
                </div>
              </div>
            )}

            <div className="max-h-[260px] overflow-auto rounded-md border border-line">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-mist text-muted">
                  <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Rent</th><th className="px-3 py-2">Note</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r) => (
                    <tr key={r.line} className="border-t border-line">
                      <td className="px-3 py-1.5 text-muted">{r.line}</td>
                      <td className="px-3 py-1.5 font-medium">{r.tenant?.name ?? (map.name >= 0 ? r.raw[map.name] : "") ?? ""}</td>
                      <td className="px-3 py-1.5">{r.tenant?.phones[0] ?? (map.phone >= 0 ? r.raw[map.phone] : "")}</td>
                      <td className="px-3 py-1.5">{r.tenant ? `K${r.tenant.rentAmount.toLocaleString()}` : map.rent >= 0 && r.raw[map.rent] ? `K${r.raw[map.rent]}` : ""}</td>
                      <td className={`px-3 py-1.5 ${r.status === "error" ? "text-red-600" : r.status === "warn" ? "text-amber-700" : "text-emerald-700"}`}>
                        {(r.messages.join(", ") || "Ready").replace("Already a tenant with this number", "Already in your tenants")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 200 && <p className="text-xs text-muted">Showing the first 200 rows. All {rows.length} will be checked.</p>}
            {bad.length > 0 && <button type="button" onClick={downloadErrors} className="text-xs font-semibold text-brand">Download the {bad.length} skipped rows</button>}

            <fieldset className="rounded-md border border-line p-3">
              <legend className="px-1 text-[11px] font-medium text-muted">Welcome text with their payment link</legend>
              <label className="flex items-center gap-2 py-1 text-sm">
                <input type="radio" checked={!sendTexts} onChange={() => setSendTexts(false)} /> Not yet. I'll send them when I'm ready
              </label>
              <label className="flex items-center gap-2 py-1 text-sm">
                <input type="radio" checked={sendTexts} onChange={() => setSendTexts(true)} /> Send to everyone with a phone number now
              </label>
            </fieldset>
          </div>
        )}

        {step === "done" && result && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle size={40} weight="fill" className="text-emerald-600" />
            <p className="font-display text-lg font-semibold">
              {result.count} tenant{result.count === 1 ? "" : "s"} added
            </p>
            <p className="max-w-xs text-sm text-muted">
              Everyone starts fully paid. First rent is due on the {firstDueText}, and reminders go out from then.
            </p>
            {(result.skipped > 0 || result.failed.length > 0) && (
              <p className="mt-1 text-xs text-amber-700">
                {result.skipped + result.failed.length} row{result.skipped + result.failed.length === 1 ? " wasn't" : "s weren't"} added.{" "}
                <button type="button" onClick={downloadErrors} className="font-semibold underline">
                  Download them to fix
                </button>
              </p>
            )}
            <div className="mt-3 flex items-center gap-3">
              {!undone && (
                <button type="button" disabled={busy} onClick={undo} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink">
                  <ArrowCounterClockwise size={14} /> Undo this import
                </button>
              )}
            </div>
            {undone && <p className="text-sm text-muted">{undone}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
