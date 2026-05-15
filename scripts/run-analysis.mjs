#!/usr/bin/env node
import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { reportsDir, writeJson, readJson } from "./analysis/fs-utils.mjs";
import { writeStatus } from "./analysis/status.mjs";
import { nodeQuickProbe } from "./analysis/node-quick-probe.mjs";
import { discoverUrls, extractInternalLinks } from "./analysis/crawler.mjs";
import { analyzePage } from "./analysis/page-analyzer.mjs";
import { buildSummary } from "./analysis/report-summary.mjs";
import { renderReportHtml } from "./analysis/report-html.mjs";

async function readRequest({ requestFile, reportId, targetUrl }) {
  if (requestFile) {
    const data = await readJson(path.resolve(requestFile));
    return {
      reportId: data.reportId,
      targetUrl: data.targetUrl,
    };
  }
  if (reportId && targetUrl) {
    return { reportId, targetUrl };
  }
  throw new Error(
    "Provide --request-file=... or both --report-id and --target-url",
  );
}

async function runQuickHome({ browser, targetUrl, reportId, absDir }) {
  const nodeProbe = await nodeQuickProbe(targetUrl);
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SiteScope/0.1",
  });
  try {
    const page = await ctx.newPage();
    let internalLinkCount = 0;
    let httpOk = nodeProbe.httpOk;
    let httpStatus = nodeProbe.httpStatus;
    let finalUrl = nodeProbe.finalUrl;
    let redirectChain = nodeProbe.redirectChain;
    try {
      const resp = await page.goto(targetUrl, {
        waitUntil: "networkidle",
        timeout: 90000,
      });
      httpStatus = resp?.status() ?? httpStatus;
      httpOk = !!httpStatus && httpStatus < 400;
      finalUrl = page.url();
      await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 500));
        window.scrollTo(0, 0);
      });
      await new Promise((r) => setTimeout(r, 600));
      const links = await extractInternalLinks(page, finalUrl, targetUrl);
      internalLinkCount = links.length;
      const shotRel = `reports/${reportId}/screenshots/quick-home.png`;
      const shotAbs = path.join(absDir, "screenshots", "quick-home.png");
      await fs.mkdir(path.dirname(shotAbs), { recursive: true });
      await page.screenshot({ path: shotAbs, fullPage: false });
      return {
        validUrl: true,
        dnsOk: nodeProbe.dnsOk,
        dnsMessage: nodeProbe.dnsMessage,
        httpStatus,
        httpOk,
        finalUrl,
        redirectChain,
        sslOk: nodeProbe.sslOk,
        sslMessage: nodeProbe.sslMessage,
        responseTimeMs: nodeProbe.responseTimeMs,
        internalLinkCount,
        screenshotRelativePath: shotRel,
      };
    } catch (e) {
      return {
        validUrl: true,
        dnsOk: nodeProbe.dnsOk,
        dnsMessage: nodeProbe.dnsMessage,
        httpStatus,
        httpOk: false,
        finalUrl,
        redirectChain,
        sslOk: nodeProbe.sslOk,
        sslMessage: nodeProbe.sslMessage,
        responseTimeMs: nodeProbe.responseTimeMs,
        internalLinkCount,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } finally {
    await ctx.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      "request-file": { type: "string" },
      "report-id": { type: "string" },
      "target-url": { type: "string" },
    },
    allowPositionals: true,
  });

  const requestFile = process.env.REQUEST_FILE || values["request-file"];
  const reportIdArg = process.env.REPORT_ID || values["report-id"];
  const targetArg = process.env.TARGET_URL || values["target-url"];

  const { reportId, targetUrl } = await readRequest({
    requestFile,
    reportId: reportIdArg,
    targetUrl: targetArg,
  });

  const absDir = reportsDir(reportId);
  await fs.mkdir(absDir, { recursive: true });

  await writeStatus(reportId, {
    targetUrl,
    phase: "queued",
    quick: undefined,
    error: undefined,
  });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const quick = await runQuickHome({ browser, targetUrl, reportId, absDir });
    await writeStatus(reportId, {
      targetUrl,
      phase: "quick",
      quick,
    });

    await writeStatus(reportId, {
      targetUrl,
      phase: "crawling",
      quick,
    });

    const urls = await discoverUrls({
      browser,
      startUrl: targetUrl,
      maxPages: 30,
      maxDepth: 2,
    });

    await writeStatus(reportId, {
      targetUrl,
      phase: "analyzing",
      quick,
    });

    const pages = [];
    const brokenLinks = [];
    for (const url of urls) {
      const result = await analyzePage({
        browser,
        reportId,
        url,
        reportsAbsDir: absDir,
        startUrl: targetUrl,
      });
      const { brokenLinks: bl, ...pageRest } = result;
      pages.push(pageRest);
      brokenLinks.push(...(bl || []));
    }

    const dedupBroken = [];
    const seen = new Set();
    for (const b of brokenLinks) {
      const k = `${b.from}|${b.to}`;
      if (seen.has(k)) continue;
      seen.add(k);
      dedupBroken.push(b);
    }

    const summary = buildSummary(pages);
    const completedAt = new Date().toISOString();
    const report = {
      reportId,
      targetUrl,
      createdAt: completedAt,
      completedAt,
      quick,
      pages,
      brokenLinks: dedupBroken.slice(0, 200),
      summary,
    };

    await writeJson(path.join(absDir, "report.json"), report);
    const html = renderReportHtml(report);
    await fs.writeFile(path.join(absDir, "index.html"), html, "utf8");

    await writeStatus(reportId, {
      targetUrl,
      phase: "complete",
      quick,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeStatus(reportId, {
      targetUrl,
      phase: "failed",
      error: msg,
    });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await main();
