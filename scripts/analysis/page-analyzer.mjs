import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { AxeBuilder } from "@axe-core/playwright";
import { collectUiSignals } from "./ui-detect.mjs";
import {
  runLighthouseOnPage,
  collectPerfFallback,
} from "./lighthouse-runner.mjs";
import { waitForSpaReady } from "./spa-wait.mjs";
import { explorePageInteractions } from "./interaction-crawl.mjs";
import { extractAllLinks } from "./link-extract.mjs";
import { enrichUiIssue } from "./issue-labels.mjs";
import { ANALYSIS_CONFIG } from "./analysis-config.mjs";
import { isHomepageUrl } from "./url-utils.mjs";
import {
  captureViewportScreenshot,
  screenshotViewports,
} from "./screenshot.mjs";
import { createPageTimer } from "./timing.mjs";
import { playwrightContextOptions } from "./viewport-profile.mjs";

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
  runFullLighthouse = false,
  isHomepage = false,
  deviceProfile = "desktop",
  analysisTimer = null,
}) {
  const pageTimer = analysisTimer
    ? createPageTimer(analysisTimer, url)
    : null;

  const consoleErrors = [];
  const jsExceptions = [];
  const failedRequests = [];

  const context = await browser.newContext(
    playwrightContextOptions(deviceProfile),
  );

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
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
    if (st >= 400) failedRequests.push({ url: res.url(), status: st });
  });

  let statusCode = null;
  let redirects = [];
  let gotoOk = false;

  pageTimer?.start("initial_load");
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    statusCode = response?.status() ?? null;
    redirects = redirectChainFromResponse(response);
    gotoOk = true;
  } catch (e) {
    jsExceptions.push(e instanceof Error ? e.message : String(e));
  }
  pageTimer?.end("initial_load");

  const screenshotPaths = {};
  const uiIssues = [];
  const interactionLog = [];
  let interactionFlow = "";
  let interactionDiscovery;
  const shotDir = path.join(reportsAbsDir, "screenshots");
  const homepage =
    isHomepage || isHomepageUrl(gotoOk ? url : startUrl, startUrl);
  await fs.mkdir(shotDir, { recursive: true });

  if (gotoOk) {
    pageTimer?.start("hydration_wait");
    await waitForSpaReady(page, { fast: ANALYSIS_CONFIG.fast });
    pageTimer?.end("hydration_wait");

    pageTimer?.start("interaction_crawl");
    const explored = await explorePageInteractions(page, page.url(), startUrl, {
      profile: homepage ? "homepage" : "subpage",
      deviceProfile,
    });
    pageTimer?.end("interaction_crawl");

    interactionLog.push(...explored.interactions);
    interactionFlow = explored.interactionFlow || "";
    if (homepage) interactionDiscovery = explored.discoveryStats;
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

    pageTimer?.start("screenshots");
    const viewports = screenshotViewports();
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await waitForSpaReady(page, { short: true, fast: true });

      const file = `${crypto.randomUUID()}-${vp.name}.jpg`;
      const abs = path.join(shotDir, file);
      await captureViewportScreenshot(page, abs);
      screenshotPaths[vp.name] = `screenshots/${file}`;

      pageTimer?.start(`ui_signals_${vp.name}`);
      const sig = await collectUiSignals(page, vp, { fast: ANALYSIS_CONFIG.fast });
      pageTimer?.end(`ui_signals_${vp.name}`);
      uiIssues.push(...sig);
    }
    pageTimer?.end("screenshots");
  }

  let axeViolations = [];
  if (gotoOk) {
    pageTimer?.start("axe");
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await waitForSpaReady(page, { short: true, fast: true });
      const results = await new AxeBuilder({ page })
        .options({ resultTypes: ["violations"] })
        .analyze();
      axeViolations = (results.violations || []).map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.help || v.description,
        nodes: v.nodes?.length ?? 0,
      }));
    } catch {
      axeViolations = [];
    }
    pageTimer?.end("axe");
  }

  let lighthouse = null;
  if (gotoOk) {
    pageTimer?.start("lighthouse");
    const lhMode = runFullLighthouse ? "full" : ANALYSIS_CONFIG.lighthouse.skipOnSubpages ? "skip" : "light";
    if (lhMode === "skip") {
      lighthouse = await collectPerfFallback(page);
    } else {
      lighthouse = await runLighthouseOnPage(page, {
        mode: lhMode,
        timeoutMs: runFullLighthouse
          ? ANALYSIS_CONFIG.lighthouse.fullTimeoutMs
          : ANALYSIS_CONFIG.lighthouse.lightweightTimeoutMs,
      });
    }
    pageTimer?.end("lighthouse");
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
    interactionLog: interactionLog.slice(0, 40),
    interactionFlow: interactionFlow || undefined,
    interactionDiscovery,
    crawledAt: new Date().toISOString(),
  };
}

async function probeInternalLinksFromExtract(page, pageUrl, startUrl) {
  const hrefs = await extractAllLinks(page, pageUrl, startUrl);
  const broken = [];
  const limit = ANALYSIS_CONFIG.brokenLinkProbeLimit;
  for (const href of hrefs.slice(0, limit)) {
    try {
      const r = await page.request.head(href, { timeout: 8000 });
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
