import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { AxeBuilder } from "@axe-core/playwright";
import { VIEWPORTS, collectUiSignals } from "./ui-detect.mjs";
import { normalizeUrl, sameRegistrableDomain, isHttp } from "./url-utils.mjs";
import { runLighthouseForUrl } from "./lighthouse-runner.mjs";

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

async function probeInternalLinks(page, pageUrl, startUrl, limit = 18) {
  const hrefs = await page.evaluate((base) => {
    const out = [];
    document.querySelectorAll("a[href]").forEach((a) => {
      try {
        const abs = new URL(a.getAttribute("href"), base).toString();
        out.push(abs);
      } catch {
        /* ignore */
      }
    });
    return out;
  }, pageUrl);
  const broken = [];
  const unique = [...new Set(hrefs)].filter((h) => {
    const n = normalizeUrl(h, pageUrl);
    return n && isHttp(n) && sameRegistrableDomain(n, startUrl);
  });
  for (const href of unique.slice(0, limit)) {
    try {
      const r = await page.request.head(href, { timeout: 12000 });
      const st = r.status();
      if (st >= 400) {
        broken.push({ from: pageUrl, to: href, reason: `HTTP ${st}` });
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
      waitUntil: "networkidle",
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
  const shotDir = path.join(reportsAbsDir, "screenshots");
  await fs.mkdir(shotDir, { recursive: true });

  if (gotoOk) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      try {
        await page.reload({ waitUntil: "networkidle", timeout: 90000 });
      } catch {
        /* continue with partial state */
      }
      await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 500));
        window.scrollTo(0, 0);
      });
      await new Promise((r) => setTimeout(r, 400));

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
      await page.reload({ waitUntil: "networkidle", timeout: 90000 });
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
    lighthouse = await runLighthouseForUrl(url, { timeoutMs: 110000 });
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
    ? await probeInternalLinks(page, url, startUrl)
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
    crawledAt: new Date().toISOString(),
  };
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
