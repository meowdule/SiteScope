"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnalyzeForm } from "@/components/AnalyzeForm";
import { DEFAULT_GITHUB_REPO } from "@/lib/config";
import {
  getAutomationToken,
  getConfiguredRepo,
  setAutomationToken,
} from "@/lib/queueRequest";

export function SiteShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [token, setToken] = useState("");
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const configuredRepo = getConfiguredRepo();
  const automationConfigured = useMemo(() => {
    void tick;
    const t = typeof window === "undefined" ? null : getAutomationToken();
    return !!t;
  }, [tick]);

  const openSettings = () => {
    setToken(getAutomationToken() || "");
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    setAutomationToken(token.trim() || null);
    setSettingsOpen(false);
    refresh();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-6 border-b border-surface-border pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            SiteScope
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Website quality inspection
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Run quick signals instantly, then let the background job crawl your
            site in a real browser, score Lighthouse and accessibility, capture
            screenshots, and flag common UI issues across mobile, tablet, and
            desktop viewports.
          </p>
        </div>
        <button
          type="button"
          onClick={openSettings}
          className="self-start rounded-lg border border-surface-border bg-surface-raised px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
        >
          Settings
        </button>
      </header>

      <main className="mt-10">
        <AnalyzeForm automationConfigured={automationConfigured} />
      </main>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            className="absolute inset-0"
            aria-hidden
            onClick={() => setSettingsOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-surface-border bg-surface-raised p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Settings</h2>
            <p className="mt-2 text-sm text-slate-400">
              The automation token is stored only in this browser. It needs
              permission to create files in the analysis repository so a
              background job can start.
            </p>
            <p className="mt-4 rounded-lg border border-surface-border bg-surface px-3 py-2 font-mono text-xs text-slate-300">
              Repository: {configuredRepo || DEFAULT_GITHUB_REPO}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Configured at deploy time via GitHub Actions variables (defaults to{" "}
              {DEFAULT_GITHUB_REPO}).
            </p>
            <label className="mt-5 block text-sm font-medium text-slate-200">
              Automation token
            </label>
            <input
              type="password"
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-accent/30 focus:ring-2"
              placeholder="GitHub personal access token (contents: write)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-surface"
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-muted"
                onClick={saveSettings}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
