import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const execFileP = promisify(execFile);
const require = createRequire(import.meta.url);

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
    "--throttling-method=devtools",
    "--max-wait-for-load=45000",
  ];
  try {
    await execFileP(
      process.execPath,
      [lhCli, ...args],
      {
        timeout: options.timeoutMs ?? 120000,
        env: { ...process.env, NODE_OPTIONS: "" },
        windowsHide: true,
      },
    );
  } catch {
    return null;
  }
  try {
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
    };
  } catch {
    return null;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
