import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { AxeBuilder } from "@axe-core/playwright";
import { VIEWPORTS, collectUiSignals } from "./ui-detect.mjs";
import { runLighthouseOnPage } from "./lighthouse-runner.mjs";
import { waitForSpaReady } from "./spa-wait.mjs";
import { explorePageInteractions } from "./interaction-crawl.mjs";
import { extractAllLinks } from "./link-extract.mjs";
import { enrichUiIssue } from "./issue-labels.mjs";

function redirectChainFromResponse(response) {
  const chain = [];
  if (!response) return chain;
  let req = response.request();
  const seen = new Set();
  while (req && !seen.has(req)) {
    seen.add(req);
    chain.push(req.url());
    req = req.redirectedFrom();
  }
  return chain.reverse();
}

export async function analyzePage({
  browser,
  reportId,
  url,
  reportsAbsDir,
  startUrl,
}) {
  const consoleErrors = [];
  const jsExceptions = [];
  const failedRequests = [];

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SiteScope/0.1",
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    jsExceptions.push(err.message || String(err));
  });
  page.on("requestfailed", (req) => {
    const f = req.failure();
    failedRequests.push({
      url: req.url(),
      failure: f?.errorText || "request failed",
    });
  });
  page.on("response", (res) => {
    const st = res.status();
    if (st >= 400) {
      failedRequests.push({ url: res.url(), status: st });
    }
  });

  let statusCode = null;
  let redirects = [];
  let gotoOk = false;
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    statusCode = response?.status() ?? null;
    redirects = redirectChainFromResponse(response);
    gotoOk = true;
  } catch (e) {
    jsExceptions.push(e instanceof Error ? e.message : String(e));
  }

  const screenshotPaths = {};
  const uiIssues = [];
  const interactionLog = [];
  const shotDir = path.join(reportsAbsDir, "screenshots");
  await fs.mkdir(shotDir, { recursive: true });

  if (gotoOk) {
    await waitForSpaReady(page);
    const explored = await explorePageInteractions(page, page.url(), startUrl, {
      maxInteractions: 8,
    });
    interactionLog.push(...explored.interactions);
    for (const ch of explored.uiStateChanges || []) {
      uiIssues.push(
        enrichUiIssue({
          id: `modal-${uiIssues.length}`,
          type: "modal_or_drawer",
          message: ch.message,
          viewport: "desktop",
          severity: "info",
        }),
      );
    }

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await waitForSpaReady(page, { short: true });

      const file = `${crypto.randomUUID()}-${vp.name}.png`;
      const abs = path.join(shotDir, file);
      await page.screenshot({ path: abs, fullPage: false });
      screenshotPaths[vp.name] = `screenshots/${file}`;

      const sig = await collectUiSignals(page, vp);
      uiIssues.push(...sig);
    }
  }

  let axeViolations = [];
  if (gotoOk) {
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await waitForSpaReady(page, { short: true });
      const results = await new AxeBuilder({ page }).analyze();
      axeViolations = (results.violations || []).map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.help || v.description,
        nodes: v.nodes?.length ?? 0,
      }));
    } catch {
      axeViolations = [];
    }
  }

  let lighthouse = null;
  if (gotoOk) {
    lighthouse = await runLighthouseOnPage(page, { timeoutMs: 150000 });
  }

  const brokenImages = gotoOk
    ? await page.evaluate(() => {
        const out = [];
        for (const img of Array.from(document.images || [])) {
          if (!img.complete) continue;
          if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            out.push({ src: img.currentSrc || img.src, alt: img.alt || "" });
          }
        }
        return out;
      })
    : [];

  const brokenLinks = gotoOk
    ? await probeInternalLinksFromExtract(page, url, startUrl)
    : [];

  await page.close();
  await context.close();

  return {
    url,
    statusCode,
    redirects,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 80),
    jsExceptions: [...new Set(jsExceptions)].slice(0, 40),
    failedRequests: dedupeFailed(failedRequests).slice(0, 80),
    lighthouse: lighthouse || undefined,
    axeViolations,
    brokenImages,
    uiIssues: dedupeUi(uiIssues),
    screenshotPaths,
    brokenLinks,
    interactionLog: interactionLog.slice(0, 30),
    crawledAt: new Date().toISOString(),
  };
}

async function probeInternalLinksFromExtract(page, pageUrl, startUrl) {
  const hrefs = await extractAllLinks(page, pageUrl, startUrl);
  const broken = [];
  for (const href of hrefs.slice(0, 24)) {
    try {
      const r = await page.request.head(href, { timeout: 12000 });
      if (r.status() >= 400) {
        broken.push({ from: pageUrl, to: href, reason: `HTTP ${r.status()}` });
      }
    } catch (e) {
      broken.push({
        from: pageUrl,
        to: href,
        reason: e instanceof Error ? e.message : "Request failed",
      });
    }
  }
  return broken;
}

function dedupeFailed(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${it.url}|${it.status ?? ""}|${it.failure ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function dedupeUi(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${it.type}|${it.message}|${it.viewport}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
