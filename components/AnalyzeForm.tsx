"use client";

import { useCallback, useMemo, useState } from "react";
import { validateHttpUrl } from "@/lib/validateUrl";
import { checkDns } from "@/lib/dnsCheck";
import type { QuickCheckResult, ReportPhase } from "@/lib/types";
import {
  hasDispatchToken,
  startAnalysis,
  type DeviceProfile,
} from "@/lib/startAnalysis";
import { fetchReport, fetchStatus } from "@/lib/pollReport";
import { assetUrl } from "@/lib/paths";

function newReportId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AnalyzeForm() {
  const [urlInput, setUrlInput] = useState("");
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>("desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ReportPhase | null>(null);
  const [quick, setQuick] = useState<Partial<QuickCheckResult> | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setReportId(null);
    setPhase(null);
    setQuick(null);
  }, []);

  const runInstantChecks = useCallback(async (normalizedUrl: string) => {
    const host = new URL(normalizedUrl).hostname;
    const dns = await checkDns(host);
    setQuick((q) => ({
      ...q,
      validUrl: true,
      dnsOk: dns.ok,
      dnsMessage: dns.message,
    }));
  }, []);

  const pollLoop = useCallback(async (id: string) => {
    const started = Date.now();
    const maxMs = 45 * 60 * 1000;
    while (Date.now() - started < maxMs) {
      try {
        const status = await fetchStatus(id);
        if (status) {
          setPhase(status.phase);
          if (status.quick) setQuick(status.quick);
          if (status.phase === "complete") {
            const report = await fetchReport(id);
            if (report) {
              window.location.href = assetUrl(
                `/report?id=${encodeURIComponent(id)}`,
              );
              return;
            }
          }
          if (status.phase === "failed") {
            setError(status.error || "Analysis failed.");
            setBusy(false);
            return;
          }
        }
      } catch {
        /* transient network errors — keep polling */
      }
      await new Promise((r) => setTimeout(r, 3500));
    }
    setError("Timed out waiting for the report. Try again later.");
    setBusy(false);
  }, []);

  const onAnalyze = useCallback(async () => {
    setError(null);
    const v = validateHttpUrl(urlInput);
    if (!v.ok || !v.normalized) {
      setError(v.error || "Invalid URL");
      return;
    }

    const id = newReportId();
    setReportId(id);
    setBusy(true);
    setPhase("queued");
    setQuick({ validUrl: true });

    await runInstantChecks(v.normalized);

    try {
      await startAnalysis(id, v.normalized, deviceProfile);
      void pollLoop(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start analysis.";
      setError(msg);
      setBusy(false);
    }
  }, [deviceProfile, pollLoop, runInstantChecks, urlInput]);

  const phaseLabel = useMemo(() => {
    if (!phase) return null;
    const map: Record<ReportPhase, string> = {
      queued: "Queued",
      quick: "Quick scan",
      crawling: "Crawling pages",
      analyzing: "Deep analysis",
      complete: "Complete",
      failed: "Failed",
    };
    return map[phase];
  }, [phase]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          placeholder="https://example.com"
          className="w-full flex-1 rounded-lg border border-surface-border bg-surface-raised px-4 py-3 text-sm text-slate-100 outline-none ring-accent/40 placeholder:text-slate-500 focus:ring-2"
          value={urlInput}
          disabled={busy}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onAnalyze();
          }}
        />
        <button
          type="button"
          onClick={() => void onAnalyze()}
          disabled={busy}
          className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Working…" : "Analyze"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
        <span className="text-slate-400">분석 화면 크기</span>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="deviceProfile"
            value="desktop"
            checked={deviceProfile === "desktop"}
            disabled={busy}
            onChange={() => setDeviceProfile("desktop")}
            className="accent-accent"
          />
          데스크톱 (1440px)
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="deviceProfile"
            value="mobile"
            checked={deviceProfile === "mobile"}
            disabled={busy}
            onChange={() => setDeviceProfile("mobile")}
            className="accent-accent"
          />
          모바일 (390px)
        </label>
      </div>

      {!hasDispatchToken() && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          A GitHub tab may open — click <strong>Submit new issue</strong> once to
          start analysis. For one-click Analyze, add the{" "}
          <code className="font-mono text-xs">QUEUE_DISPATCH_TOKEN</code> secret
          and redeploy Pages.
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {(busy || reportId) && (
        <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Report
              </p>
              <p className="font-mono text-sm text-slate-200">{reportId}</p>
            </div>
            {phaseLabel && (
              <span className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200">
                {phaseLabel}
              </span>
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <QuickRow label="URL valid" ok={quick?.validUrl} />
            <QuickRow label="DNS" ok={quick?.dnsOk} detail={quick?.dnsMessage} />
            <QuickRow
              label="HTTP reachable"
              ok={quick?.httpOk}
              detail={
                quick?.httpStatus != null
                  ? `Status ${quick.httpStatus}`
                  : undefined
              }
            />
            <QuickRow
              label="TLS certificate"
              ok={quick?.sslOk}
              detail={quick?.sslMessage}
            />
            <QuickRow
              label="Response time"
              detail={
                quick?.responseTimeMs != null
                  ? `${quick.responseTimeMs} ms (homepage)`
                  : "Pending"
              }
            />
            <QuickRow
              label="Internal links (homepage)"
              detail={
                quick?.internalLinkCount != null
                  ? `${quick.internalLinkCount} found`
                  : "Pending"
              }
            />
          </div>

          {quick?.screenshotRelativePath && (
            <div className="mt-5">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                Homepage screenshot
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(`/${quick.screenshotRelativePath}`)}
                alt="Homepage capture"
                className="max-h-64 w-full rounded-lg border border-surface-border object-contain object-left bg-black/40"
              />
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Quick signals update as soon as the background job publishes them.
            Deep results appear in the final report when crawling finishes.
          </p>
        </div>
      )}

      {reportId && !busy && error && (
        <button
          type="button"
          className="text-sm text-accent underline-offset-4 hover:underline"
          onClick={reset}
        >
          Clear
        </button>
      )}
    </div>
  );
}

function QuickRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok?: boolean;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-surface-border/80 bg-surface/60 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-200">{label}</p>
        {ok === undefined ? (
          <span className="text-xs text-slate-500">…</span>
        ) : ok ? (
          <span className="text-xs font-medium text-emerald-400">OK</span>
        ) : (
          <span className="text-xs font-medium text-amber-300">Issue</span>
        )}
      </div>
      {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
    </div>
  );
}
