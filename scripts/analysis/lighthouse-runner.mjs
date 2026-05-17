import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const execFileP = promisify(execFile);
const require = createRequire(import.meta.url);

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
  };
}

/** Fallback metrics from Performance API when Lighthouse CLI fails (common on SPAs). */
export async function collectPerfFallback(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
      fcp: fcp?.startTime ?? null,
      lcp: null,
      cls: null,
      tbt: null,
      si: null,
      collected: false,
      fallback: true,
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      loadEvent: nav?.loadEventEnd ?? null,
    };
  });
}

export async function runLighthouseForUrl(pageUrl, options = {}) {
  const chromePath = chromium.executablePath();
  let lhCli;
  try {
    lhCli = require.resolve("lighthouse/cli/index.js");
  } catch {
    return null;
  }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "lh-"));
  const outFile = path.join(tmp, "lh.json");
  const args = [
    pageUrl,
    "--quiet",
    `--chrome-path=${chromePath}`,
    "--output=json",
    `--output-path=${outFile}`,
    "--only-categories=performance,accessibility,best-practices,seo",
    "--screenEmulation.disabled",
    "--throttling-method=simulate",
    "--max-wait-for-load=90000",
    "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
  ];
  try {
    await execFileP(process.execPath, [lhCli, ...args], {
      timeout: options.timeoutMs ?? 150000,
      env: { ...process.env, NODE_OPTIONS: "" },
      windowsHide: true,
    });
    return await parseLhJson(outFile);
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

  const fromCli = await runLighthouseForUrl(url, options);
  if (fromCli?.collected) return fromCli;

  const fallback = await collectPerfFallback(page);
  return {
    ...fallback,
    lighthouseError:
      "Lighthouse could not complete (often on heavy SPA pages). Showing basic load timings instead.",
  };
}
