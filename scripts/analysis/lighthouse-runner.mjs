import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { ANALYSIS_CONFIG } from "./analysis-config.mjs";

const execFileP = promisify(execFile);
const require = createRequire(import.meta.url);
const LH = ANALYSIS_CONFIG.lighthouse;

async function parseLhJson(outFile) {
  const raw = await fs.readFile(outFile, "utf8");
  const json = JSON.parse(raw);
  const cats = json.categories || {};
  const audits = json.audits || {};
  const num = (id) => {
    const v = cats[id]?.score;
    return typeof v === "number" ? Math.round(v * 100) : null;
  };
  return {
    performance: num("performance"),
    accessibility: num("accessibility"),
    bestPractices: num("best-practices"),
    seo: num("seo"),
    fcp: audits["first-contentful-paint"]?.numericValue ?? null,
    lcp: audits["largest-contentful-paint"]?.numericValue ?? null,
    cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    tbt: audits["total-blocking-time"]?.numericValue ?? null,
    si: audits["speed-index"]?.numericValue ?? null,
    collected: true,
    mode: "full",
  };
}

/** Fallback metrics from Performance API when Lighthouse CLI fails (common on SPAs). */
export async function collectPerfFallback(page) {
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const loadMs = nav?.loadEventEnd ?? nav?.domContentLoadedEventEnd ?? null;
    let perf = null;
    if (loadMs != null) {
      if (loadMs < 2500) perf = 85;
      else if (loadMs < 4000) perf = 65;
      else if (loadMs < 6000) perf = 45;
      else perf = 25;
    }
    return {
      performance: perf,
      fcp: fcp?.startTime ?? null,
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      loadEvent: loadMs,
    };
  });
  return {
    performance: metrics.performance,
    accessibility: null,
    bestPractices: null,
    seo: null,
    fcp: metrics.fcp,
    lcp: null,
    cls: null,
    tbt: null,
    si: null,
    collected: false,
    fallback: true,
    mode: "fallback",
    domContentLoaded: metrics.domContentLoaded,
    loadEvent: metrics.loadEvent,
  };
}

/**
 * @param {'full'|'light'|'skip'} mode
 */
export async function runLighthouseForUrl(pageUrl, options = {}) {
  const mode = options.mode ?? "light";
  if (mode === "skip") return null;

  const chromePath = chromium.executablePath();
  let lhCli;
  try {
    lhCli = require.resolve("lighthouse/cli/index.js");
  } catch {
    return null;
  }

  const categories =
    mode === "full" ? LH.fullCategories : LH.lightCategories;
  const timeoutMs =
    mode === "full" ? LH.fullTimeoutMs : LH.lightweightTimeoutMs;

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "lh-"));
  const outFile = path.join(tmp, "lh.json");
  const args = [
    pageUrl,
    "--quiet",
    `--chrome-path=${chromePath}`,
    "--output=json",
    `--output-path=${outFile}`,
    `--only-categories=${categories}`,
    "--screenEmulation.mobile",
    "--form-factor=mobile",
    "--throttling.cpuSlowdownMultiplier=1",
    `--max-wait-for-load=${LH.maxWaitForLoad}`,
    "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu",
  ];

  try {
    await execFileP(process.execPath, [lhCli, ...args], {
      timeout: options.timeoutMs ?? timeoutMs,
      env: { ...process.env, NODE_OPTIONS: "" },
      windowsHide: true,
    });
    const parsed = await parseLhJson(outFile);
    return { ...parsed, mode };
  } catch {
    return null;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/** Run Lighthouse on an already-loaded Playwright page URL (after SPA settle). */
export async function runLighthouseOnPage(page, options = {}) {
  const url = page.url();
  if (!url || url.startsWith("about:")) return collectPerfFallback(page);

  const mode = options.mode ?? "light";
  if (mode === "skip") {
    return collectPerfFallback(page);
  }

  const fromCli = await runLighthouseForUrl(url, {
    mode,
    timeoutMs: options.timeoutMs,
  });
  if (fromCli?.collected) return fromCli;

  const fallback = await collectPerfFallback(page);
  if (mode === "skip") return fallback;

  return {
    ...fallback,
    lighthouseError:
      mode === "light"
        ? "빠른 성능 측정만 적용했습니다 (전체 Lighthouse 생략)."
        : "Lighthouse could not complete (often on heavy SPA pages). Showing basic load timings instead.",
  };
}
