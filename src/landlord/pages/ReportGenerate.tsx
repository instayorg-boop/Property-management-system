import { useRef, useState } from "react";
import { downloadElementAsPdf } from "../../lib/reportPdf";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, WarningCircle } from "@phosphor-icons/react";
import { getReportType } from "../reportTypes";
import { useSettings } from "../SettingsContext";
import { supabase } from "../../lib/supabaseClient";
import { edgeFunctionErrorMessage } from "../../lib/functionsError";
import ReportPreview, { type GenerateReportResult } from "../components/ReportPreview";
import Button from "../components/Button";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

type DateRangeMode = "annually" | "monthly" | "custom";
type ReportFormat = "csv" | "pdf";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// Maps this page's URL slug (src/landlord/reportTypes.ts) to the report_type value
// supabase/functions/generate-report/index.ts expects — named independently (slugs match the old
// in-app dashboard routes; report_type matches the edge function's own spec).
const SLUG_TO_REPORT_TYPE: Record<string, GenerateReportResult["reportType"]> = {
  "income-expenses": "income_vs_expenses",
  "occupancy-rate": "occupancy",
  "arrears-delinquency": "overdue_rent",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Persists the generated preview across a reload/back-forward — without this, refreshing the page
// while looking at a just-generated report threw the landlord straight back to an empty form, with
// no way back to what they'd already generated short of running it again.
function resultStorageKey(slug: string): string {
  return `instay-report-preview:${slug}`;
}

function readCachedResult(slug: string): GenerateReportResult | null {
  try {
    const raw = sessionStorage.getItem(resultStorageKey(slug));
    return raw ? (JSON.parse(raw) as GenerateReportResult) : null;
  } catch {
    return null;
  }
}

function cacheResult(slug: string, result: GenerateReportResult | null) {
  try {
    if (result) sessionStorage.setItem(resultStorageKey(slug), JSON.stringify(result));
    else sessionStorage.removeItem(resultStorageKey(slug));
  } catch {
    // Storage full or blocked — the preview still works for this visit, it just won't survive a reload.
  }
}

/** Configure-and-generate screen for one report type — design only per the request that started
 * this: no export logic yet, "Generate report" doesn't call anything. Modeled on the same shape
 * most payroll/property-management report generators use (Gusto's Expense report screen was the
 * explicit reference): a time-period picker whose fields change with the mode, then a format
 * choice, then one commit action. Reached from the Reports hub's report cards; the back arrow
 * returns there rather than to the dashboard, since that's the natural "undo" for this screen. */
export default function ReportGenerate() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const report = getReportType(slug);
  const { propertyId } = useSettings();

  const [mode, setMode] = useState<DateRangeMode>("annually");
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [month, setMonth] = useState(String(new Date().getMonth()));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateReportResult | null>(() => (slug ? readCachedResult(slug) : null));
  const previewRef = useRef<HTMLDivElement>(null);

  if (!report) {
    return (
      <div className="px-4 py-10 text-center sm:px-8">
        <p className="text-sm font-medium text-ink">Report not found</p>
        <Link to="/reports" className="mt-2 inline-block text-sm text-brand hover:underline">
          Back to reports
        </Link>
      </div>
    );
  }

  const Icon = report.icon;
  const canGenerate = !!propertyId && (mode !== "custom" || (!!startDate && !!endDate));

  const resolveDateRange = (): { dateFrom: string; dateTo: string } => {
    if (mode === "annually") {
      const y = Number(year);
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
    }
    if (mode === "monthly") {
      const y = Number(year);
      const m = Number(month);
      return { dateFrom: toIsoDate(new Date(y, m, 1)), dateTo: toIsoDate(new Date(y, m + 1, 0)) };
    }
    return { dateFrom: startDate, dateTo: endDate };
  };

  const handleGenerate = async () => {
    if (!propertyId) return;
    setError(null);
    setGenerating(true);
    try {
      const { dateFrom, dateTo } = resolveDateRange();
      const { data, error: invokeError } = await supabase.functions.invoke("generate-report", {
        body: {
          report_type: SLUG_TO_REPORT_TYPE[report.slug],
          format,
          property_id: propertyId,
          date_from: dateFrom,
          date_to: dateTo,
        },
      });
      if (invokeError) throw invokeError;
      if (!data?.url) throw new Error("The report didn't come back as expected.");
      setResult(data as GenerateReportResult);
      cacheResult(report.slug, data as GenerateReportResult);
    } catch (e) {
      setError(await edgeFunctionErrorMessage(e, "Couldn't generate that report. Try again."));
    } finally {
      setGenerating(false);
    }
  };

  const goBackToForm = () => {
    cacheResult(report.slug, null);
    setResult(null);
  };

  const handleDownload = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      // PDFs are made from the preview on screen, so the file looks exactly like what you see.
      if (result.fileName.endsWith(".pdf") && previewRef.current) {
        await downloadElementAsPdf(previewRef.current, result.fileName);
        return;
      }
      // Re-sign rather than reuse result.url directly — that URL is only good for 5 minutes, and
      // this preview can now sit around across reloads far longer than that. `download` forces a
      // real save (Content-Disposition: attachment) instead of the browser opening another
      // preview tab, which is what a plain signed URL + <a download> does for a cross-origin file.
      const { data, error: signError } = await supabase.storage.from("reports").createSignedUrl(result.filePath, 300, { download: result.fileName });
      if (signError || !data) throw signError ?? new Error("Couldn't refresh the download link.");
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setError(await edgeFunctionErrorMessage(e, "Couldn't download that report. Try again."));
    } finally {
      setDownloading(false);
    }
  };

  // Once generate-report has returned, this screen switches to a preview of the finished report
  // (same design the PDF uses) with a Download action, rather than downloading immediately and
  // leaving the landlord looking at a bare form with no confirmation of what they just made.
  if (result) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        {/* Actions live up here, next to Back, rather than below the report — easier to spot than
            scrolling past a full page of table to find them. */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBackToForm}
            className="flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={16} weight="bold" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={goBackToForm}>
              Generate another
            </Button>
            <Button variant="primary" onClick={() => void handleDownload()} disabled={downloading}>
              {downloading ? "Preparing…" : `Download ${result.fileName.endsWith(".pdf") ? "PDF" : "CSV"}`}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-6" ref={previewRef}>
          <ReportPreview result={result} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-8">
      <button
        type="button"
        onClick={() => navigate("/reports")}
        className="flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={16} weight="bold" />
        Reports
      </button>

      <div className="mt-8 flex flex-col items-center text-center">
        <span className={`flex h-14 w-14 items-center justify-center rounded-md ${report.tint}`}>
          <Icon size={26} weight="duotone" />
        </span>
        <h1 className="font-display mt-4 text-xl font-bold tracking-tight text-ink">Generate: {report.title}</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">{report.description}</p>
      </div>

      <div className="mt-8 rounded-lg ">
        <p className="text-lg font-semibold text-ink">Which time period should we include?</p>

        <div className="mt-4 space-y-1.5">
          <Label>Date range</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as DateRangeMode)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="annually">Annually</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "annually" && (
          <div className="mt-4 space-y-1.5">
            <Label>Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {mode === "monthly" && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {mode === "custom" && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-start">Start date</Label>
              <Input id="report-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-end">End date</Label>
              <Input id="report-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <p className="text-lg font-semibold text-ink">How would you like this report formatted?</p>
          <RadioGroup value={format} onValueChange={(v) => setFormat(v as ReportFormat)} className="mt-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <RadioGroupItem value="csv" />
              CSV
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <RadioGroupItem value="pdf" />
              PDF
            </label>
          </RadioGroup>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <Button variant="primary" className="mt-6 w-full py-2.5" disabled={!canGenerate || generating} onClick={() => void handleGenerate()}>
        {generating ? "Generating…" : "Generate report"}
      </Button>
    </div>
  );
}
