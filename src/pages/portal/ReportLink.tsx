import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getReportLink, type ReportLinkData } from "../../lib/reportLink";
import ReportDocument from "../../components/ReportDocument";

/**
 * Where the autopilot milestone/weekly/monthly SMS sends the landlord: a plain, no-login report
 * page. The token itself is the one thing that reveals this property's numbers, same reasoning
 * as subscriptionPay.ts for the landlord's own IPM fee link — no auth is added here.
 */
export default function ReportLink() {
  const { token } = useParams();
  const [data, setData] = useState<ReportLinkData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => {
    if (!token) return;
    setLoadError(null);
    setNetworkError(false);
    getReportLink(token)
      .then(setData)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "This link isn't valid anymore.";
        // A network failure (no response at all) gets a retry button; an invalid-token response
        // from the server gets the plain "not available" message instead.
        if (message.includes("connection")) {
          setNetworkError(true);
        } else {
          setLoadError(message);
        }
      });
  }, [token]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  if (networkError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-mist px-4 text-center">
        <p className="text-sm text-muted">Couldn't reach the server. Check your connection.</p>
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-mist"
        >
          Try again
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist px-4">
        <div className="w-full max-w-sm rounded-xl border border-line bg-paper p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-ink">Link not available</p>
          <p className="mt-1.5 text-sm text-muted">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[794px] px-4 py-8 sm:px-10">
        <div className="flex flex-col gap-3">
          <div className="h-8 w-2/3 animate-pulse rounded bg-mist" />
          <div className="h-32 w-full animate-pulse rounded bg-mist" />
          <div className="h-48 w-full animate-pulse rounded bg-mist" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mist print:bg-white">
      <ReportDocument report={data} />
    </div>
  );
}
